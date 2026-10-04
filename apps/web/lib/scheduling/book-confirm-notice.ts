import { eq, inArray } from "drizzle-orm";
import { appointments, patients } from "@osteojp/db";

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { bookConfirmAppliesTo, bookConfirmMode } from "@/lib/reminders/book-confirm-mode";

// BOOK-CONFIRM: the approver's notice. Strategy dispatch S-1003-B block 1.
//
// When the booking-approved message applies to a patient and that patient has
// no email on file, the person who just accepted the request is told to ring
// them: "Paciente sem email: avise por telefone". The email is the message; the
// SMS is only a fallback, and it may not go at all (a landline, SMS switched
// off), so reception is told at the moment they can still act on it.
//
// IT RUNS AFTER THE COMMIT AND IT NEVER THROWS. The request is already accepted
// when this is asked. A notice that could fail the acceptance would report a
// committed write as an error, so every failure here answers "no notice" and is
// logged with the error NAME only, never its message (rule 7).
//
// IT ASKS THE SAME SWITCH THE DISPATCH ASKS (`bookConfirmAppliesTo`), so the
// notice appears for exactly the patients the new message applies to. With the
// switch off it makes no read at all.
//
// No "server-only" here, the same choice ./reminders.ts and
// ./pedido-acceptance.ts make, so the helper stays unit-testable under vitest.

export type ApprovalNotice = "patient_no_email";

/**
 * The decision, pure. `rows` are the accepted appointments' patients as the
 * CALLER can read them. A patient the caller cannot read is simply not in
 * `rows`, and "unknown" is never reported as "no email".
 */
export function approvalNoticeFor(
  rows: readonly { patientId: string; email: string | null }[],
  env: Record<string, string | undefined> = process.env,
): ApprovalNotice | null {
  const missing = rows.some(
    (r) => bookConfirmAppliesTo(r.patientId, env).applies && (r.email ?? "").trim() === "",
  );
  return missing ? "patient_no_email" : null;
}

/**
 * The notice for the pedidos just accepted, or null. Call it AFTER the
 * acceptance has committed, with the ids of the appointments that were accepted.
 */
export async function approvalNoticeAfterAccept(
  actor: RequestContext,
  appointmentIds: readonly string[],
): Promise<ApprovalNotice | null> {
  try {
    if (appointmentIds.length === 0) return null;
    if (bookConfirmMode() === "off") return null;
    const rows = await runScoped(actor, (tx) =>
      tx
        .select({ patientId: appointments.patientId, email: patients.email })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .where(inArray(appointments.id, [...appointmentIds])),
    );
    return approvalNoticeFor(rows);
  } catch (e) {
    console.error(
      "scheduling: book-confirm notice failed; the acceptance is committed and stands",
      e instanceof Error ? e.name : "unknown",
    );
    return null;
  }
}
