import { eq, inArray } from "drizzle-orm";
import { appointments, locations, patients, tenants } from "@osteojp/db";

import { parseTenantConfig } from "@/lib/admin/settings-config";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { bookConfirmAppliesTo, bookConfirmMode } from "@/lib/reminders/book-confirm-mode";
import {
  bookingApprovedBlocker,
  type BookingApprovedReachInput,
} from "@/lib/reminders/book-confirm-plan";

// BOOK-CONFIRM: the approver's notice.
//
// THE RULE, as decided by the lead on 2026-10-04 on top of S-1003-B and
// S-1004-A (R40): the person who approves is told whenever the booking-approved
// message applies to this patient and NO message can go, for a reason that is
// knowable at approval time. Two reasons, two sentences:
//
//   patient_no_email          no email on file AND the SMS leg cannot send:
//                             no usable mobile, or SMS switched off for the
//                             clinic, or switched off for this patient.
//                             "Paciente sem email: avise por telefone"
//   location_contact_missing  the appointment's location has no address or no
//                             phone, so neither channel sends.
//                             "Confirmação não enviada: o local não tem morada
//                             ou telefone. Avise o paciente por telefone."
//
// THE PREDICATES ARE THE DISPATCH'S OWN, IMPORTED, NOT RESTATED
// (`bookingApprovedBlocker`, lib/reminders/book-confirm-plan.ts). This file
// used to carry its own, smaller idea of "can the SMS leg send": it looked at
// the shape of the number and nothing else. So a patient with a mobile, no
// email and SMS switched off got nothing, and so did every patient at a
// location with no address, and in both cases the approver was told nothing.
// One definition, used by the send and by the notice, cannot disagree with
// itself.
//
// WHAT GETS NO NOTICE, deliberately: a refusal that only exists at send time.
// A location NAME with an accent or too long for one SMS segment, a name with
// braces in the email, a provider refusing, live send switched off. None is a
// fact about contact data that reception can act on at the desk; each leaves a
// ledger row (`body_refused`, `provider_error`, `live_send_disabled`).
//
// IT RUNS AFTER THE COMMIT AND IT NEVER THROWS. The request is already accepted
// when this is asked. A notice that could fail the acceptance would report a
// committed write as an error, so every failure here answers "no notice" and is
// logged with the error NAME only, never its message (rule 7).
//
// IT REVEALS NOTHING THE ACTOR CANNOT READ. The read runs under the actor's own
// scope, and the patient, the location and the tenant are INNER joins: a row
// the actor cannot see is not a row, and "unknown" is never reported as
// "unreachable" or as "the location has no address".
//
// IT ASKS THE SAME SWITCH THE DISPATCH ASKS (`bookConfirmAppliesTo`), so the
// notice appears for exactly the patients the new message applies to. With the
// switch off it makes no read at all.
//
// No "server-only" here, the same choice ./reminders.ts and
// ./pedido-acceptance.ts make, so the helper stays unit-testable under vitest.

export type ApprovalNotice = "patient_no_email" | "location_contact_missing";

/** One approved appointment, as the ACTOR can read it. */
export type ApprovalNoticeRow = BookingApprovedReachInput & { patientId: string };

/**
 * The decision, pure. `rows` are the approved appointments as the CALLER can
 * read them; an appointment whose patient or location the caller cannot read
 * is simply not in `rows`.
 *
 * Over several rows (a series accepted at once) the patient's own reason wins:
 * it is checked first for every row, the way the dispatch checks it first for
 * one.
 */
export function approvalNoticeFor(
  rows: readonly ApprovalNoticeRow[],
  env: Record<string, string | undefined> = process.env,
): ApprovalNotice | null {
  const blockers = rows
    .filter((r) => bookConfirmAppliesTo(r.patientId, env).applies)
    .map((r) => bookingApprovedBlocker(r));
  if (blockers.includes("patient_unreachable")) return "patient_no_email";
  if (blockers.includes("location_contact_missing")) return "location_contact_missing";
  return null;
}

/**
 * The notice for the appointments just approved, or null. Call it AFTER the
 * approval has committed, with the ids of the appointments that were approved.
 */
export async function approvalNoticeAfterAccept(
  actor: RequestContext,
  appointmentIds: readonly string[],
): Promise<ApprovalNotice | null> {
  try {
    if (appointmentIds.length === 0) return null;
    if (bookConfirmMode() === "off") return null;
    const read = await runScoped(actor, (tx) =>
      tx
        .select({
          patientId: appointments.patientId,
          patientEmail: patients.email,
          patientPhone: patients.phone,
          patientSmsEnabled: patients.reminderSmsEnabled,
          locationAddress: locations.address,
          locationPhone: locations.phone,
          tenantSettings: tenants.settings,
        })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .innerJoin(locations, eq(locations.id, appointments.locationId))
        .innerJoin(tenants, eq(tenants.id, appointments.tenantId))
        .where(inArray(appointments.id, [...appointmentIds])),
    );
    return approvalNoticeFor(
      read.map(({ tenantSettings, ...row }) => ({
        ...row,
        // The same parse the dispatch makes of the same column.
        tenantSmsEnabled: parseTenantConfig(tenantSettings).reminders.smsEnabled,
      })),
    );
  } catch (e) {
    console.error(
      "scheduling: book-confirm notice failed; the acceptance is committed and stands",
      e instanceof Error ? e.name : "unknown",
    );
    return null;
  }
}
