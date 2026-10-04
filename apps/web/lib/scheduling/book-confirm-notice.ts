import { eq, inArray } from "drizzle-orm";
import { appointments, patients } from "@osteojp/db";

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { isSmsCapablePT, normalizePhonePT } from "@osteojp/notify";
import { bookConfirmAppliesTo, bookConfirmMode } from "@/lib/reminders/book-confirm-mode";

// BOOK-CONFIRM: the approver's notice. Strategy dispatch S-1003-B block 1, and
// the rule as re-ruled in S-1004-A (R40, owner, 2026-10-04): "notice to the
// approver only when neither exists".
//
// When the booking-approved message applies to a patient and that patient has
// NEITHER an email on file NOR a number the SMS leg can use, the person who
// just approved is told to ring them: "Paciente sem email: avise por telefone".
// Nothing can be sent to such a patient, so reception is told at the moment
// they can still act on it. A patient with a mobile and no email gets the SMS
// and needs no call, so no notice: until 2026-10-04 the notice appeared
// whenever there was no email, and the sentence is unchanged.
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
  rows: readonly { patientId: string; email: string | null; phone: string | null }[],
  env: Record<string, string | undefined> = process.env,
): ApprovalNotice | null {
  const unreachable = rows.some(
    (r) =>
      bookConfirmAppliesTo(r.patientId, env).applies &&
      (r.email ?? "").trim() === "" &&
      !smsLegCanUse(r.phone),
  );
  return unreachable ? "patient_no_email" : null;
}

/**
 * Can the SMS leg send to this number? The same two questions the send path
 * asks before it hands a message over (`sendPatientSms` in
 * lib/reminders/dispatch.ts): it normalises to a Portuguese E.164 number, and
 * it is not a geographic line. A blank, a typo and a landline all answer no.
 */
export function smsLegCanUse(phone: string | null | undefined): boolean {
  const e164 = normalizePhonePT((phone ?? "").trim());
  return e164 !== null && isSmsCapablePT(e164);
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
        .select({
          patientId: appointments.patientId,
          email: patients.email,
          phone: patients.phone,
        })
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
