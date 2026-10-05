// BOOK-CONFIRM: the questions that decide whether a booking-approved message
// CAN go, as pure functions.
//
// Two callers ask them and must get the same answers:
//
//   lib/reminders/dispatch.ts            at SEND time, to choose the channel and
//                                        to refuse a location with no contact
//   lib/scheduling/book-confirm-notice.ts at APPROVAL time, to tell the approver
//                                        "nothing can be sent, ring the patient"
//
// They used to live inside dispatch.ts, and the notice had its own smaller copy
// of one of them. The copy disagreed with the dispatch on a patient whose SMS
// was switched off and on a location with no address: the dispatch sent
// nothing and the approver was told nothing. One definition, imported by both,
// is what stops the two drifting again.
//
// Pure: no DB, no SDK, no `server-only`.

import { isSmsCapablePT, normalizePhonePT } from "@osteojp/notify";

/**
 * Can the SMS leg send to this stored number, and if not, why?
 *
 * The two questions the send path asks before it hands a message over: does
 * the number normalise to a Portuguese E.164 number, and is it a line that can
 * receive SMS (a geographic line cannot). Two reasons, kept apart for the
 * reason dispatch.ts gives at its landline branch: one is a typo, the other is
 * a good number on the wrong channel.
 */
export type SmsNumberVerdict =
  | { ok: true; e164: string }
  | { ok: false; reason: "invalid_phone" | "landline" };

export function smsNumberVerdict(phone: string | null | undefined): SmsNumberVerdict {
  const e164 = normalizePhonePT((phone ?? "").trim());
  if (!e164) return { ok: false, reason: "invalid_phone" };
  if (!isSmsCapablePT(e164)) return { ok: false, reason: "landline" };
  return { ok: true, e164 };
}

export type BookingApprovedPlan =
  | { send: "email" }
  | { send: "sms" }
  | { send: "none"; reason: "no_contact" | "channels_off"; channel: "email" | "sms" };

/**
 * Which ONE channel an approval goes out on. Pure, exported for direct testing.
 *
 *   an email on file              -> the email, and NO SMS
 *   no email, a phone on file     -> the SMS fallback, if SMS is switched on
 *   neither                       -> nothing
 *
 * THE EMAIL IS TRANSACTIONAL: it answers a request the patient made, so
 * neither the tenant's reminder email switch nor the patient's reminder email
 * preference is an input here. The SMS fallback still respects the tenant's and
 * the patient's SMS switches.
 *
 * THE FALLBACK IS FOR "NO EMAIL ON FILE" AND NOTHING ELSE. An email that is on
 * file and then fails to send does not turn into an SMS: the patient would get
 * two messages on a retry, and the ruling is one.
 *
 * `channel` on the `none` arm is the channel the ledger row is filed under.
 */
export function planBookingApprovedChannel(args: {
  hasEmail: boolean;
  hasPhone: boolean;
  tenantSmsEnabled: boolean;
  patientSmsEnabled: boolean;
}): BookingApprovedPlan {
  if (args.hasEmail) return { send: "email" };
  if (!args.hasPhone) return { send: "none", reason: "no_contact", channel: "email" };
  if (!args.tenantSmsEnabled || !args.patientSmsEnabled) {
    return { send: "none", reason: "channels_off", channel: "sms" };
  }
  return { send: "sms" };
}

/**
 * The address and the phone the message prints, from the appointment's
 * LOCATION row only. Null when either is missing or blank.
 *
 * `tenantSettings` is deliberately NOT a parameter: the ruling is that nothing
 * falls back to the tenant's clinic settings, and a function that cannot see
 * them cannot fall back to them.
 */
export function bookingApprovedLocationContact(location: {
  locationAddress: string | null;
  locationPhone: string | null;
}): { address: string; phone: string } | null {
  const address = (location.locationAddress ?? "").trim();
  const phone = (location.locationPhone ?? "").trim();
  if (address === "" || phone === "") return null;
  return { address, phone };
}

/** Everything the three questions need, about one appointment. */
export type BookingApprovedReachInput = {
  patientEmail: string | null;
  patientPhone: string | null;
  tenantSmsEnabled: boolean;
  patientSmsEnabled: boolean;
  locationAddress: string | null;
  locationPhone: string | null;
};

/**
 * Why NO booking-approved message can go for this appointment, for a reason
 * that is knowable before anything is sent. Null when one can.
 *
 * THE DISPATCH'S OWN GATES, IN THE DISPATCH'S OWN ORDER, composed from the
 * functions above and nothing else:
 *
 *   patient_unreachable       no email on file, and the SMS leg cannot send:
 *                             no phone, SMS switched off for the clinic or for
 *                             this patient, or a number the SMS leg cannot use
 *   location_contact_missing  the appointment's location has no address or no
 *                             phone, so neither channel sends
 *
 * WHAT IS DELIBERATELY NOT HERE: a refusal that only exists at send time. A
 * location NAME with an accent or too long for one segment makes the SMS body
 * unsendable (`body_refused`), a name with braces does the same to the email,
 * a provider can refuse, live send can be off. None of those is a fact about
 * the patient's or the location's contact data that reception could act on at
 * the desk, and predicting them here would mean rendering the message twice.
 * They leave a ledger row and no notice.
 */
export function bookingApprovedBlocker(
  input: BookingApprovedReachInput,
): "patient_unreachable" | "location_contact_missing" | null {
  const email = (input.patientEmail ?? "").trim();
  const phone = (input.patientPhone ?? "").trim();
  const plan = planBookingApprovedChannel({
    hasEmail: email !== "",
    hasPhone: phone !== "",
    tenantSmsEnabled: input.tenantSmsEnabled,
    patientSmsEnabled: input.patientSmsEnabled,
  });
  if (plan.send === "none") return "patient_unreachable";
  if (plan.send === "sms" && !smsNumberVerdict(phone).ok) return "patient_unreachable";
  if (bookingApprovedLocationContact(input) === null) return "location_contact_missing";
  return null;
}
