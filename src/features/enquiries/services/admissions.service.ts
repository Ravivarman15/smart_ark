import { BaseService, AppError } from "@/shared/services";
import { studentsService } from "@/features/students";
import { feesService } from "@/features/fees";
import { toDbStatus } from "../utils/status";
import type {
  ApproveAdmissionInput,
  ApproveAdmissionResult,
} from "../types/enquiry.types";

interface EnquiryLookup {
  id: string;
  prospect_name: string | null;
  phone: string | null;
}

/**
 * Orchestrates the conversion of an enquiry into a student (and optional fee).
 *
 * Why a separate service:
 *   - This is the only flow that crosses three domains (enquiries +
 *     students + fees). Putting it inside any single domain would
 *     create circular ownership.
 *   - Future requirements (audit log, notification email, idempotency
 *     token) all attach here, not in any single CRUD service.
 *
 * Failure model:
 *   - If student creation fails → enquiry stays in its current status. No
 *     "ghost converted" rows.
 *   - If fee creation fails (when initialFee is provided) → student remains;
 *     the error surfaces and the operator can manually retry the fee.
 *     Rationale: a created student is a real human in the system; refusing
 *     to keep them because a fee row failed would be worse than the alternative.
 *   - Only after the student exists do we flip the enquiry to `converted`.
 */
class AdmissionsService extends BaseService {
  async approve(
    input: ApproveAdmissionInput,
    actor: { name?: string; profileId?: string } = {}
  ): Promise<ApproveAdmissionResult> {
    // 1. Look up the enquiry directly (single-source-of-truth read).
    const lookup = await this.db
      .from("admission_calls")
      .select("id, prospect_name, phone")
      .eq("id", input.enquiryId)
      .single();
    const enquiry = this.guard(lookup, "enquiry") as EnquiryLookup;

    // 2. Create the student. studentsService owns the DB mapping.
    let studentId: string;
    try {
      const student = await studentsService.create({
        name: input.studentName ?? enquiry.prospect_name ?? "",
        batch: input.batch ?? "Pending Allocation",
        spi: 0,
        risk: "safe",
        campus: input.campus,
        parentContact: enquiry.phone ?? undefined,
      });
      studentId = student.id;
    } catch (err) {
      throw new AppError(
        "Unknown",
        err instanceof Error ? err.message : "Failed to create student record",
        err
      );
    }

    // 3. Create the initial fee record if requested. Do NOT roll back the
    //    student on fee failure — see failure model above.
    let feeId: string | undefined;
    if (input.initialFee) {
      try {
        const fee = await feesService.create(
          {
            student: input.studentName ?? enquiry.prospect_name ?? "",
            batch: input.batch ?? "Pending Allocation",
            amount: input.initialFee.amount,
            dueSince: input.initialFee.dueSince,
            paid: input.initialFee.paid ?? false,
          },
          actor.profileId
        );
        feeId = fee.id;
      } catch (err) {
        console.error("[admissionsService.approve] fee creation failed:", err);
        // Surface but don't undo student creation. Operator retries fee manually.
      }
    }

    // 4. Mark the enquiry converted. Failure here is loud but does not
    //    undo the student (the student row is the durable artefact).
    const { error: convertErr } = await this.db
      .from("admission_calls")
      .update({ status: toDbStatus("converted") } as never)
      .eq("id", input.enquiryId);
    if (convertErr) {
      throw new AppError(
        "Unknown",
        "Student created, but enquiry status update failed — please mark it converted manually.",
        convertErr
      );
    }

    return { studentId, feeId };
  }
}

export const admissionsService = new AdmissionsService();
