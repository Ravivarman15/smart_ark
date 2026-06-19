// useBulkImport — drives the entire client-side import engine:
//   parse (Web Worker) → auto-map → validate → dedupe → match course →
//   assign counselor → insert in 500-row batches → queue WhatsApp →
//   notifications → live progress (job row + local state) → summary.
//
// Pause / Resume / Cancel are honoured between batches via a control ref so the
// loop can be interrupted without tearing down React state.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  assignmentService,
  leadCoursesService,
  leadNotificationsService,
  leadWhatsappService,
} from "../services";
import { bulkImportService } from "../services/bulkImport.service";
import { detectColumnMapping } from "../utils/bulkImportMapping";
import { prepareRows, buildAssigner } from "../utils/bulkImportPrepare";
import { welcomeTemplateForCourse } from "../utils/leadWhatsappTemplates";
import {
  IMPORT_BATCH_SIZE,
  MAX_IMPORT_ROWS,
  emptySummary,
  type ColumnMapping,
  type ImportPhase,
  type ImportRowError,
  type ImportSummary,
  type ParsedFile,
  type PreparedLead,
} from "../types/bulkImport.types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const detectFileType = (name: string): string => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ["csv", "xls", "xlsx"].includes(ext) ? ext : "csv";
};

interface ControlState {
  paused: boolean;
  cancelled: boolean;
}

export interface UseBulkImport {
  file: File | null;
  parsed: ParsedFile | null;
  mapping: ColumnMapping;
  phase: ImportPhase;
  progress: number;
  summary: ImportSummary;
  busy: boolean;
  paused: boolean;
  truncated: boolean;
  errors: ImportRowError[];
  duplicates: ImportRowError[];
  jobId: string | null;
  selectFile: (file: File) => Promise<void>;
  setMapping: (m: ColumnMapping) => void;
  start: (opts: { whatsapp: boolean }) => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  reset: () => void;
}

export function useBulkImport(): UseBulkImport {
  const { user } = useAuth();
  const actor = user?.profileId;

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary>(emptySummary());
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [duplicates, setDuplicates] = useState<ImportRowError[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  const control = useRef<ControlState>({ paused: false, cancelled: false });
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const reset = useCallback(() => {
    control.current = { paused: false, cancelled: false };
    setFile(null);
    setParsed(null);
    setMapping({});
    setPhase("idle");
    setProgress(0);
    setSummary(emptySummary());
    setBusy(false);
    setPaused(false);
    setTruncated(false);
    setErrors([]);
    setDuplicates([]);
    setJobId(null);
  }, []);

  // ── Parse the file in the Web Worker ───────────────────────────────────────
  const selectFile = useCallback(async (f: File) => {
    reset();
    setFile(f);
    setPhase("parsing");
    setBusy(true);
    const buffer = await f.arrayBuffer();
    const worker = new Worker(
      new URL("../workers/bulkImportParser.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    const result = await new Promise<ParsedFile | { error: string }>((resolve) => {
      worker.onmessage = (e: MessageEvent) => {
        const d = e.data as
          | { ok: true; headers: string[]; rows: Record<string, string>[]; totalRows: number; truncated: boolean }
          | { ok: false; error: string };
        if (d.ok) resolve({ headers: d.headers, rows: d.rows, totalRows: d.totalRows, truncated: d.truncated });
        else resolve({ error: d.error });
      };
      worker.onerror = (e) => resolve({ error: e.message });
      worker.postMessage({ buffer }, [buffer]);
    });
    worker.terminate();
    workerRef.current = null;

    if ("error" in result) {
      setPhase("failed");
      setBusy(false);
      throw new Error(result.error);
    }
    setParsed(result);
    setTruncated(result.truncated);
    setMapping(detectColumnMapping(result.headers));
    setSummary({ ...emptySummary(), total: Math.min(result.totalRows, MAX_IMPORT_ROWS) });
    setPhase("idle");
    setBusy(false);
  }, [reset]);

  const pause = useCallback(() => { control.current.paused = true; setPaused(true); setPhase("paused"); }, []);
  const resume = useCallback(() => { control.current.paused = false; setPaused(false); setPhase("importing"); }, []);
  const cancel = useCallback(() => { control.current.cancelled = true; control.current.paused = false; setPaused(false); }, []);

  // ── Run the full pipeline ───────────────────────────────────────────────────
  const start = useCallback(async ({ whatsapp }: { whatsapp: boolean }) => {
    if (!parsed || !mapping.student_name || !mapping.mobile) return;
    control.current = { paused: false, cancelled: false };
    setBusy(true);
    setPaused(false);

    let createdJobId: string | null = null;
    try {
      const job = await bulkImportService.createJob({
        fileName: file?.name ?? "import",
        fileType: detectFileType(file?.name ?? ""),
        totalRows: Math.min(parsed.totalRows, MAX_IMPORT_ROWS),
        uploadedBy: actor,
      });
      createdJobId = job.id;
      setJobId(job.id);
      await bulkImportService.audit(job.id, "start", actor, `Importing ${parsed.rows.length} rows`);

      // Notify admins/management the import started.
      const staff = await bulkImportService.loadStaffProfiles();
      const adminMgmt = Array.from(staff.entries())
        .filter(([, p]) => ["admin", "management"].includes(p.role))
        .map(([id]) => id);
      await leadNotificationsService.notifyMany(adminMgmt, {
        type: "import_started",
        title: "Lead import started",
        message: `${file?.name ?? "file"} — ${parsed.rows.length} rows`,
        mirrorGlobal: true,
      });

      // 1. Validate / dedupe / course-match.
      setPhase("validating");
      await bulkImportService.updateJob(job.id, { status: "PROCESSING", phase: "validating", startedAt: new Date().toISOString() });
      const [courses, existingMobiles] = await Promise.all([
        leadCoursesService.listActiveNames(),
        bulkImportService.loadExistingMobiles(),
      ]);
      const { prepared, errors: invalid, duplicates: dups } = prepareRows(
        parsed.rows, mapping, courses, existingMobiles,
      );
      setErrors(invalid);
      setDuplicates(dups);
      await bulkImportService.logErrors(job.id, [...invalid, ...dups]);
      const baseSummary: ImportSummary = {
        ...emptySummary(),
        total: parsed.rows.length,
        valid: prepared.length,
        invalid: invalid.length,
        duplicate: dups.length,
      };
      setSummary(baseSummary);
      await bulkImportService.updateJob(job.id, {
        validRows: prepared.length, invalidRows: invalid.length, duplicateRows: dups.length,
      });

      // 2. Assign counselors in-memory (snapshot mappings + active counts once).
      setPhase("assigning");
      await bulkImportService.updateJob(job.id, { phase: "assigning" });
      const mappings = await assignmentService.listMappings();
      const counselorIds = Array.from(new Set(mappings.map((m) => m.counselorId)));
      const activeCounts = await bulkImportService.loadActiveLeadCounts(counselorIds);
      const assigner = buildAssigner(mappings, activeCounts);
      const assigned: (PreparedLead & { assignedTo?: string })[] = prepared.map((p) => ({
        ...p,
        assignedTo: assigner.assign(p.course) ?? undefined,
      }));

      // 3. Insert in batches with pause/resume/cancel.
      setPhase("importing");
      await bulkImportService.updateJob(job.id, { phase: "importing" });
      let imported = 0;
      let assignedCount = 0;
      let unassignedCount = 0;
      let whatsappQueued = 0;

      for (let i = 0; i < assigned.length; i += IMPORT_BATCH_SIZE) {
        if (control.current.cancelled) break;
        while (control.current.paused && !control.current.cancelled) await sleep(300);
        if (control.current.cancelled) break;

        const batch = assigned.slice(i, i + IMPORT_BATCH_SIZE);
        const inserted = await bulkImportService.insertLeadsBatch(batch, job.id, actor);
        imported += inserted.length;
        await bulkImportService.logCreatedActivities(job.id, inserted);

        for (const lead of inserted) {
          if (lead.assignedTo) assignedCount++; else unassignedCount++;
        }

        // 4. Queue WhatsApp (welcome + counselor) — optional + best-effort.
        if (whatsapp) {
          for (const lead of inserted) {
            const okWelcome = await leadWhatsappService.send({
              leadId: lead.id,
              templateKey: welcomeTemplateForCourse(lead.course),
              phone: lead.phone,
              recipientName: lead.parentName ?? lead.studentName,
              recipientKind: "lead",
              studentName: lead.studentName,
              courseName: lead.course,
              course: lead.course,
              leadClass: lead.standard,
              vars: { student_name: lead.studentName, course_name: lead.course ?? "your course of interest" },
              createdBy: actor,
            });
            if (okWelcome) whatsappQueued++;

            if (lead.assignedTo) {
              const counselor = staff.get(lead.assignedTo);
              if (counselor?.phone) {
                const okCounselor = await leadWhatsappService.send({
                  leadId: lead.id,
                  templateKey: "lead_assigned_counselor",
                  phone: counselor.phone,
                  recipientName: counselor.name,
                  recipientKind: "counselor",
                  studentName: lead.studentName,
                  courseName: lead.course,
                  course: lead.course,
                  leadClass: lead.standard,
                  vars: {
                    counselor_name: counselor.name || "Counselor",
                    student_name: lead.studentName,
                    course_name: lead.course ?? "—",
                    mobile_number: lead.phone,
                  },
                  createdBy: actor,
                });
                if (okCounselor) whatsappQueued++;
              }
            }
          }
        }

        const progressPct = Math.round((imported / Math.max(1, assigned.length)) * 100);
        setProgress(progressPct);
        setSummary({ ...baseSummary, imported, assigned: assignedCount, unassigned: unassignedCount, whatsappQueued });
        await bulkImportService.updateJob(job.id, {
          progress: progressPct, importedRows: imported, assignedRows: assignedCount,
          unassignedRows: unassignedCount, whatsappQueued,
        });
        await sleep(0); // yield to the UI between batches
      }

      // 5. Finalise.
      if (control.current.cancelled) {
        setPhase("cancelled");
        await bulkImportService.updateJob(job.id, { status: "CANCELLED", phase: "cancelled", completedAt: new Date().toISOString() });
        await bulkImportService.audit(job.id, "cancel", actor, `Cancelled after ${imported} rows`);
      } else {
        setPhase("completed");
        setProgress(100);
        await bulkImportService.updateJob(job.id, { status: "COMPLETED", phase: "completed", progress: 100, completedAt: new Date().toISOString() });
        await bulkImportService.audit(job.id, "complete", actor, `Imported ${imported}, assigned ${assignedCount}, unassigned ${unassignedCount}`);
        await leadNotificationsService.notifyMany(adminMgmt, {
          type: "import_completed",
          title: "Lead import completed",
          message: `${imported} leads imported (${assignedCount} assigned, ${unassignedCount} unassigned, ${dups.length} duplicates, ${invalid.length} invalid)`,
          mirrorGlobal: true,
        });
        if (unassignedCount > 0) {
          await leadNotificationsService.notifyMany(adminMgmt, {
            type: "import_unassigned",
            title: "Imported leads need a counselor",
            message: `${unassignedCount} imported lead(s) are UNASSIGNED — add counselor↔course mappings in Automation Config.`,
            mirrorGlobal: true,
          });
        }
        // Persist report CSVs (best-effort).
        const { errorsToCsv } = await import("../utils/bulkImportCsv");
        if (invalid.length) await bulkImportService.uploadReport(job.id, "failed_rows.csv", errorsToCsv(invalid));
        if (dups.length) await bulkImportService.uploadReport(job.id, "duplicate_leads.csv", errorsToCsv(dups));
      }
    } catch (e) {
      setPhase("failed");
      if (createdJobId) {
        await bulkImportService.updateJob(createdJobId, { status: "FAILED", phase: "failed", errorMessage: (e as Error).message, completedAt: new Date().toISOString() });
        await bulkImportService.audit(createdJobId, "fail", actor, (e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }, [parsed, mapping, file, actor]);

  return {
    file, parsed, mapping, phase, progress, summary, busy, paused, truncated,
    errors, duplicates, jobId,
    selectFile, setMapping, start, pause, resume, cancel, reset,
  };
}
