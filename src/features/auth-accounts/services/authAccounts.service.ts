// ── Student & Parent Authentication — service ────────────────────────────────
// Client gateway to the student-parent-accounts edge function (provision / verify
// / reset / status / link) plus read-only account listing + the Account Health
// snapshot. Degrades gracefully before the migration is applied.

import { BaseService, AppError } from "@/shared/services";
import { summarizeAccountHealth } from "../utils/authAccounts";
import type {
  AccountStatus,
  AccountVerifyResult,
  AccountHealthSnapshot,
  StudentAuthAccount,
  ParentAuthAccount,
  LinkedChild,
} from "../types/authAccounts.types";

const isMissingTable = (err: { message?: string } | null | undefined): boolean => {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache") || m.includes("relation");
};

const num = (v: unknown): string | undefined => (v == null ? undefined : String(v));

/**
 * Coerce anything an error body might hold into readable text.
 *
 * Edge runtimes return `{ error: {...} }` as often as `{ error: "..." }`, and
 * `String({})` is the literal "[object Object]" while React renders a stringified
 * empty object as "{}". Both are what a user sees instead of a reason — which is
 * exactly the "nothing happened, just {}" failure this guards against.
 */
export const asMessage = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return v.message;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Common nested shapes before falling back to serialising.
    for (const k of ["message", "error", "msg", "detail", "description"]) {
      const inner = o[k];
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
    try {
      const json = JSON.stringify(v);
      // "{}" carries no information — treat it as no message at all so the
      // caller falls through to its own fallback text.
      return json === "{}" || json === "null" ? "" : json.slice(0, 300);
    } catch {
      return "";
    }
  }
  return "";
};

/** Did provisioning fail because the login address is already registered? */
export const isEmailTaken = (res: AccountVerifyResult): boolean => {
  const haystack = `${res.reason ?? ""} ${res.message ?? ""}`.toLowerCase();
  return (
    /already (been )?registered|already exists|duplicate|email_exists|user already/.test(haystack)
  );
};

class AuthAccountsService extends BaseService {
  /**
   * Call the provisioning edge function and report what ACTUALLY went wrong.
   *
   * supabase-js surfaces a non-2xx as a FunctionsHttpError whose `.message` is
   * the useless generic "Edge Function returned a non-2xx status code" — the
   * real reason ("Forbidden — management or admin role required", "unknown
   * action") is in the response body. Not reading it is why a failed provision
   * looked like nothing happening at all.
   */
  private async invoke(body: Record<string, unknown>): Promise<AccountVerifyResult> {
    try {
      const { data, error } = await this.db.functions.invoke("student-parent-accounts", { body });

      if (error) {
        const ctx = (error as { context?: Response }).context;
        let detail = "";
        let status = 0;
        if (ctx && typeof ctx.json === "function") {
          status = ctx.status ?? 0;
          try {
            const parsed = await ctx.clone().json();
            // asMessage, not a raw property read: `error` is frequently an
            // OBJECT, and assigning it here is what surfaced as a bare "{}".
            detail = asMessage((parsed as Record<string, unknown>)?.error) || asMessage(parsed);
          } catch {
            try {
              detail = (await ctx.clone().text()).slice(0, 300);
            } catch {
              /* body already consumed */
            }
          }
        }

        // 404 means the function has never been deployed to this project —
        // by far the most common cause, and the one with a one-line fix.
        if (status === 404 || /not\s*found/i.test(detail)) {
          return {
            ok: false,
            reason: "not_deployed",
            message:
              "The provisioning service is not deployed on this project. Run: supabase functions deploy student-parent-accounts",
          };
        }
        if (status === 403) {
          return {
            ok: false,
            reason: "forbidden",
            message: detail || "Only admin or management may create login accounts.",
          };
        }
        return {
          ok: false,
          reason: "edge_error",
          message:
            detail ||
            asMessage(error) ||
            `The provisioning service returned an error${status ? ` (HTTP ${status})` : ""}.`,
        };
      }

      // A 2xx with no body would otherwise return undefined and be read as a
      // silent success by callers checking `res.ok`.
      if (!data) {
        return { ok: false, reason: "empty_response", message: "The provisioning service returned no response." };
      }

      // The function reports its OWN failures as 200 + { ok:false }. Normalise
      // the message here so every failure path yields readable text.
      const result = data as AccountVerifyResult;
      if (!result.ok) {
        return {
          ...result,
          message:
            asMessage(result.message) ||
            asMessage((data as Record<string, unknown>).error) ||
            `Provisioning failed${result.reason ? ` (${result.reason})` : ""}.`,
        };
      }
      return result;
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/failed to fetch|network/i.test(msg)) {
        return {
          ok: false,
          reason: "network",
          message: "Could not reach the provisioning service — check your connection.",
        };
      }
      return { ok: false, reason: "edge_error", message: msg || "Unexpected error." };
    }
  }

  /**
   * Is the provisioning service reachable and are we allowed to use it?
   *
   * Sends a deliberately invalid action: a deployed, authorised function
   * answers 400 "unknown action" without creating anything, while a missing
   * deployment 404s and a wrong role 403s. Cheap, side-effect free, and it
   * turns "nothing happened" into a specific banner before staff fill a form.
   */
  async probe(): Promise<{ ok: boolean; reason?: string; message?: string }> {
    const res = await this.invoke({ action: "__probe__" });
    // 400 unknown-action comes back as edge_error with that text — the service
    // is alive and we are authorised.
    if (res.reason === "edge_error" && /unknown action/i.test(res.message ?? "")) {
      return { ok: true };
    }
    if (res.reason === "not_deployed" || res.reason === "forbidden" || res.reason === "network") {
      return { ok: false, reason: res.reason, message: res.message };
    }
    // Anything else (including an unexpected 2xx) — treat as usable rather
    // than blocking staff on a probe heuristic.
    return { ok: true };
  }

  createStudent(input: { studentId: string; username?: string; email?: string; mobile?: string }) {
    return this.invoke({ action: "create_student", ...input });
  }
  /**
   * Provision a parent login and link their children.
   *
   * `relation` ('father' | 'mother' | 'guardian') is stamped onto the links
   * AFTER the edge function returns, rather than being passed into it.
   *
   * Why: the relation is what `sync_parent_from_student()` reads to decide
   * WHICH guardian columns to mirror onto the account. Deployed copies of the
   * edge function predate the field and insert links without it, which would
   * leave every new account silently un-synced. Stamping it client-side means
   * the feature works on the currently-deployed function — the write is a plain
   * UPDATE that staff already hold an RLS policy for.
   */
  async createParent(input: {
    name: string;
    username?: string;
    email?: string;
    mobile?: string;
    studentIds?: string[];
    relation?: string;
  }): Promise<AccountVerifyResult> {
    const { relation, email, ...rest } = input;
    const contactEmail = (email ?? "").trim();

    // ── Login handle vs contact address ──────────────────────────────────────
    // The edge function uses `body.email` as the LOGIN email and feeds it to
    // auth.admin.createUser. Passing a family's real address therefore fails
    // outright whenever that address is already an auth user — which happens
    // constantly in practice: the office's own address used as a placeholder,
    // a parent who is also a staff member, or a second child provisioned
    // against the same family email.
    //
    // So: attempt with the real address (a memorable login is genuinely nicer),
    // and on a collision fall back to a synthesised handle. Either way the real
    // address is stored separately as the CONTACT email, which is what
    // credential delivery uses.
    let res = await this.invoke({
      action: "create_parent",
      ...rest,
      ...(contactEmail ? { email: contactEmail } : {}),
    });

    // Retry on ANY create_failed, not only when the message parses as a
    // collision. The server's wording varies by Supabase version and is
    // sometimes empty, so matching on text made the fallback unreliable — and
    // an unnecessary retry costs one request, while a missed one costs the
    // whole account.
    if (!res.ok && contactEmail && res.reason === "create_failed") {
      const first = res;
      res = await this.invoke({ action: "create_parent", ...rest });
      if (res.ok) {
        res.message = isEmailTaken(first)
          ? `${contactEmail} is already registered to another account, so the login ` +
            `handle below was generated instead. Credentials still go to ${contactEmail}.`
          : `Could not use ${contactEmail} as the login address, so the handle below ` +
            `was generated instead. Credentials still go to ${contactEmail}.`;
      } else {
        // Both attempts failed — the email was never the problem. Report the
        // FIRST failure, which carries the more specific reason.
        res = { ...res, message: first.message || res.message, detail: first.detail ?? res.detail };
      }
    }

    if (!res.ok) return res;

    // Linking is NOT optional — a parent account with no child is an empty
    // portal, which is indistinguishable from a broken one. Verify and repair
    // before reporting success. See reconcileLinks().
    if (res.accountId) {
      const failed = await this.reconcileLinks(res.accountId, input.studentIds ?? [], relation);
      if (failed.length > 0) {
        res.linkWarning =
          `The login was created but ${failed.length} student${failed.length === 1 ? "" : "s"} ` +
          `could not be attached to it. Use “Link child” on the account to finish, ` +
          `otherwise the parent signs in to an empty portal.`;
      }
    }

    if (res.accountId && relation) {
      await this.stampRelation(res.accountId, input.studentIds ?? [], relation);
    }
    // Persist the real contact address even when the login handle is synthetic.
    if (res.accountId && contactEmail) {
      await this.updateParent(res.accountId, { email: contactEmail }).catch(() => {});
    }
    return res;
  }

  /**
   * Guarantee every requested child is actually linked; returns the ids that
   * could not be attached.
   *
   * WHY THIS EXISTS — the deployed edge function links children like this:
   *
   *     await supabase.from("parent_student_links").insert(…).then(() => {}, () => {});
   *
   * …which discards the result. Any failure (RLS, a stale FK, a transient
   * network blip) leaves the account created, the response `ok: true`, and the
   * parent linked to nobody. Staff then see a working account attached to an
   * empty portal with nothing anywhere explaining why.
   *
   * Reading the links back and re-inserting the gaps makes the outcome true
   * regardless of which build of the function is deployed. The direct insert is
   * a legitimate fallback, not a privilege bypass: `parent_student_links`
   * already carries a staff-write policy (admin/management/coordinator), which
   * is the same policy `unlinkStudent` relies on.
   */
  private async reconcileLinks(
    parentAccountId: string,
    studentIds: string[],
    relation?: string,
  ): Promise<string[]> {
    if (studentIds.length === 0) return [];

    const { data, error } = await this.db
      .from("parent_student_links" as never)
      .select("student_id")
      .eq("parent_account_id", parentAccountId);

    // Could not read them back — attempt every insert rather than assume they
    // landed. A duplicate is rejected harmlessly by the UNIQUE constraint and
    // treated as success below; a missing link is a silently broken portal.
    const present = new Set(
      error ? [] : ((data as unknown as { student_id: string }[]) ?? []).map((r) => String(r.student_id)),
    );
    const missing = studentIds.filter((id) => !present.has(id));
    if (missing.length === 0) return [];

    const failed: string[] = [];
    for (const studentId of missing) {
      const isPrimary = studentId === studentIds[0];
      const viaFunction = await this.linkStudent({
        parentAccountId,
        studentId,
        relation,
        isPrimary,
      });
      if (viaFunction.ok) continue;

      const { error: insErr } = await this.db.from("parent_student_links" as never).insert({
        parent_account_id: parentAccountId,
        student_id: studentId,
        relation: relation ?? null,
        is_primary: isPrimary,
      } as never);
      // The row already existing is the outcome we wanted.
      if (insErr && !/duplicate|unique/i.test(insErr.message)) {
        console.warn("[authAccounts] could not link student:", studentId, insErr.message);
        failed.push(studentId);
      }
    }
    return failed;
  }

  /**
   * Record which guardian slot each link represents. Best-effort: a failure
   * here costs automatic sync, not the account itself, so it must never turn a
   * successful provision into a reported failure.
   */
  private async stampRelation(
    parentAccountId: string,
    studentIds: string[],
    relation: string,
  ): Promise<void> {
    if (studentIds.length === 0) return;
    try {
      const { error } = await this.db
        .from("parent_student_links" as never)
        .update({ relation } as never)
        .eq("parent_account_id", parentAccountId)
        .in("student_id", studentIds);
      if (error) console.warn("[authAccounts] could not stamp relation:", error.message);
    } catch (e) {
      console.warn("[authAccounts] could not stamp relation:", (e as Error).message);
    }
  }
  verify(input: { subject: "student" | "parent"; accountId?: string; studentId?: string; loginUrl?: string }) {
    return this.invoke({ action: "verify", ...input });
  }
  resetPassword(input: { subject: "student" | "parent"; accountId: string }) {
    return this.invoke({ action: "reset_password", ...input });
  }
  setStatus(input: { subject: "student" | "parent"; accountId: string; status: AccountStatus }) {
    return this.invoke({ action: "set_status", ...input });
  }
  linkStudent(input: { parentAccountId: string; studentId: string; relation?: string; isPrimary?: boolean }) {
    return this.invoke({ action: "link_student", ...input });
  }

  async listStudentAccounts(): Promise<StudentAuthAccount[]> {
    const res = await this.db
      .from("student_auth_accounts" as never)
      .select("id, student_id, user_id, username, login_email, mobile, status, last_login_at");
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "student_auth_accounts");
    }
    return ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      studentId: String(r.student_id),
      userId: num(r.user_id),
      username: num(r.username),
      loginEmail: num(r.login_email),
      mobile: num(r.mobile),
      status: (r.status as AccountStatus) ?? "pending",
      lastLoginAt: num(r.last_login_at),
    }));
  }

  /**
   * Parent accounts with their linked children resolved.
   *
   * Two queries, not N+1: one for the accounts, one for ALL links joined to
   * students, then grouped in memory. An institution with 800 parents would
   * otherwise issue 800 round trips to render one page.
   */
  async listParentAccounts(): Promise<ParentAuthAccount[]> {
    // auto_sync / last_synced_at arrive with 20260728. Select them separately
    // so a database that has not applied it yet still lists accounts instead of
    // erroring on an unknown column.
    let res = await this.db
      .from("parent_auth_accounts" as never)
      .select("id, user_id, name, username, login_email, email, mobile, status, auto_sync, last_synced_at")
      .order("created_at", { ascending: false });
    if (res.error && /auto_sync|last_synced_at|column/i.test(res.error.message ?? "")) {
      res = await this.db
        .from("parent_auth_accounts" as never)
        .select("id, user_id, name, username, login_email, email, mobile, status")
        .order("created_at", { ascending: false });
    }
    if (res.error) {
      if (isMissingTable(res.error)) return [];
      throw AppError.fromSupabase(res.error, "parent_auth_accounts");
    }

    const accounts = ((res.data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      userId: num(r.user_id),
      name: num(r.name),
      username: num(r.username),
      loginEmail: num(r.login_email),
      email: num(r.email),
      mobile: num(r.mobile),
      status: (r.status as AccountStatus) ?? "pending",
      // Pre-migration databases have no column — default to true so the UI
      // shows the intended behaviour rather than claiming sync is off.
      autoSync: r.auto_sync === undefined ? true : !!r.auto_sync,
      lastSyncedAt: num(r.last_synced_at),
      linkedStudentIds: [] as string[],
      children: [] as LinkedChild[],
    }));
    if (accounts.length === 0) return accounts;

    // `students.section` arrives with 20260630_student_profile_foundation.sql.
    // Naming it in the embed makes the WHOLE query fail with 42703 on a database
    // that has not applied that file — and the previous `if (error) return
    // accounts` then rendered every parent as "No children linked", which is a
    // LIE about a security-relevant relationship: staff read it as "the portal
    // is broken" and re-link a child that was already linked.
    //
    // So: fall back exactly the way students.service.ts does (RICH → BASE), and
    // if even the minimal shape fails, report the error instead of inventing an
    // empty list. An unknown state and an empty state must never look alike.
    //
    // students is named by CONSTRAINT in both shapes. `parent_student_links`
    // has two foreign keys to `students` — the plain one and the composite
    // tenant-integrity `(organization_id, student_id)` — and PostgREST refuses
    // to guess (PGRST201, HTTP 300). Without the constraint name the RICH→BASE
    // fallback is useless: BOTH shapes fail for the same reason, so the retry
    // buys nothing. See docs/POSTGREST_AMBIGUOUS_EMBEDS.md.
    const LINK_STUDENT = "students:students!parent_student_links_student_id_fkey";
    const LINK_RICH =
      `parent_account_id, student_id, relation, is_primary, ${LINK_STUDENT}(name, section, enrolment_no, standards(name))`;
    const LINK_BASE = `parent_account_id, student_id, relation, is_primary, ${LINK_STUDENT}(name)`;

    let links = await this.db.from("parent_student_links" as never).select(LINK_RICH);
    if (links.error) {
      links = await this.db.from("parent_student_links" as never).select(LINK_BASE);
    }
    if (links.error) {
      const msg = links.error.message;
      for (const a of accounts) a.childrenError = msg;
      return accounts;
    }

    const byParent = new Map<string, LinkedChild[]>();
    for (const raw of (links.data as unknown as Record<string, unknown>[]) ?? []) {
      const stuRaw = raw.students;
      const stu = (Array.isArray(stuRaw) ? stuRaw[0] : stuRaw) as Record<string, unknown> | null;
      const stdRaw = stu?.standards;
      const std = (Array.isArray(stdRaw) ? stdRaw[0] : stdRaw) as Record<string, unknown> | null;
      const pid = String(raw.parent_account_id);
      const list = byParent.get(pid) ?? [];
      list.push({
        studentId: String(raw.student_id),
        name: (stu?.name as string) ?? "Unknown student",
        className: (std?.name as string) ?? undefined,
        section: (stu?.section as string) ?? undefined,
        enrolmentNo: (stu?.enrolment_no as string) ?? undefined,
        relation: (raw.relation as string) ?? undefined,
        isPrimary: !!raw.is_primary,
      });
      byParent.set(pid, list);
    }

    for (const a of accounts) {
      const kids = byParent.get(a.id) ?? [];
      a.children = kids.sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary));
      a.linkedStudentIds = kids.map((k) => k.studentId);
    }
    return accounts;
  }

  /**
   * Edit a parent's own details.
   *
   * The BEFORE UPDATE trigger installed by 20260728 flips `auto_sync` to false
   * on any human edit to name/mobile/email — so a deliberate correction here is
   * never reverted by the next save of the student record. Re-enabling sync is
   * therefore an explicit choice, passed as `autoSync`.
   */
  async updateParent(
    accountId: string,
    patch: { name?: string; mobile?: string; email?: string; autoSync?: boolean },
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name || null;
    if (patch.mobile !== undefined) row.mobile = patch.mobile || null;
    if (patch.email !== undefined) row.email = patch.email || null;
    if (patch.autoSync !== undefined) row.auto_sync = patch.autoSync;
    if (Object.keys(row).length === 0) return;

    const { error } = await this.db
      .from("parent_auth_accounts" as never)
      .update(row as never)
      .eq("id", accountId);
    if (error) throw AppError.fromSupabase(error, "parent_auth_accounts");
  }

  /**
   * Detach a student from a parent.
   *
   * A direct delete rather than an edge-function action: the function has no
   * `unlink_student`, and `parent_student_links` already carries a staff-write
   * RLS policy — so this needs no service-role privilege. The parent loses
   * access to that child immediately, because every portal grant resolves
   * through this table.
   */
  async unlinkStudent(parentAccountId: string, studentId: string): Promise<void> {
    const { error } = await this.db
      .from("parent_student_links" as never)
      .delete()
      .eq("parent_account_id", parentAccountId)
      .eq("student_id", studentId);
    if (error) throw AppError.fromSupabase(error, "parent_student_links");
  }

  async health(): Promise<AccountHealthSnapshot> {
    const [studentAccounts, parentAccounts] = await Promise.all([
      this.listStudentAccounts(),
      this.listParentAccounts(),
    ]);

    let totalStudents = 0;
    const studRes = await this.db
      .from("students" as never)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (!studRes.error) totalStudents = studRes.count ?? 0;

    return summarizeAccountHealth({ totalStudents, studentAccounts, parentAccounts });
  }
}

export const authAccountsService = new AuthAccountsService();
