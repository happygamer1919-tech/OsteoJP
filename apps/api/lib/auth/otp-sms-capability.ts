// SEC-otp-unauthenticated-sms-pump, direction (b) - landline rejection.
//
// Pure module: no DB, no env, no `server-only`. Unit-testable anywhere.
//
// ================================================================== //
// WHY THIS IS NOT A ONE-CHARACTER EDIT TO PT_SUBSCRIBER.
// ================================================================== //
//
// The obvious fix is `/^[29]\d{8}$/` -> `/^9\d{8}$/` in
// `apps/api/lib/notify/phone.ts:19`. It was ruled against, and the reason is
// blast radius rather than taste:
//
//   `normalizePhonePT` has FIVE live call sites across TWO apps - this app's OTP
//   request and verify routes and its notify client, plus
//   `apps/web/lib/reminders/dispatch.ts:160` and `clients.ts:203`. The last two
//   are the launch-critical reminder send path.
//   `apps/api/lib/notify/phone.ts:7` additionally declares
//   `apps/web/lib/reminders/phone.ts` the CANONICAL copy and itself a mirror, so
//   editing one silently diverges them and editing both changes reminder
//   behaviour.
//
// Whether a landline on a patient record should stop receiving reminder SMS is a
// real question with a defensible answer, but it is a DIFFERENT question from
// whether an unauthenticated stranger may make us pay to text one. It is carded
// separately (LE-reminders-landline-dispatch). This module answers only the
// second question, at one endpoint.
//
// So `normalizePhonePT` still decides what a well-formed PT number IS, and this
// decides whether we are willing to SEND to one. Two questions, two modules, and
// the second cannot drift into the first.

/**
 * Portuguese geographic (fixed-line) numbers begin with `2`. They cannot receive
 * SMS: the carrier has nowhere to deliver it, so the message is billed and
 * discarded.
 *
 * The rest of the 9-digit space that `normalizePhonePT` admits begins with `9` -
 * mobile plus the nomadic 9x ranges - and is SMS-capable as a class.
 *
 * PREFIX-LEVEL ASSIGNMENT IS STILL NOT ENFORCED, deliberately, and this module
 * inherits that decision from `phone.ts:12-18` rather than quietly reversing it:
 * whether `92` is an assigned block is the carrier's call, and over-strictness
 * here silently drops reachable patients. This rejects one class that provably
 * cannot receive SMS, not every number that might not.
 */
const PT_GEOGRAPHIC_E164 = /^\+3512\d{8}$/;

/**
 * True when an E.164 PT number can receive an SMS.
 *
 * ================================================================== //
 * THIS LEAKS NOTHING, WHICH IS WHY IT MAY REFUSE OUT LOUD.
 * ================================================================== //
 *
 * Every other refusal on the OTP request path is deliberately indistinguishable,
 * because the endpoint must not become a patient-list oracle. This one is safe
 * to act on for a reason that does not generalise: the Portuguese numbering plan
 * is a PUBLIC fact. Answering "that number cannot receive SMS" tells the caller
 * something they could read off a regulator's website about a number THEY typed.
 * It says nothing about whether the clinic has ever heard of them.
 *
 * Compare the refusal this endpoint must never make: "that number is not one of
 * our patients" is a fact only we hold, and answering it hands over the patient
 * list to anyone with a phone book.
 *
 * @param e164 a number already normalised by `normalizePhonePT`, i.e. `+351`
 *             followed by nine digits. Anything else returns false: this is a
 *             capability check, not a second validator, and a caller that has
 *             not normalised first has a bug this must not paper over.
 */
export function isSmsCapablePT(e164: string): boolean {
  if (!/^\+351\d{9}$/.test(e164)) return false;
  return !PT_GEOGRAPHIC_E164.test(e164);
}
