/**
 * RB-01 — the three deep links, built in one place and unit-tested.
 *
 * A PURE MODULE WITH NO `server-only` AND NO REACT, because these are the only
 * lines on this feature whose correctness is not visible on the screen. A
 * malformed `wa.me` URL opens WhatsApp on an empty chat and the receptionist
 * types the message by hand — it fails soft, silently, and nobody reports it.
 */

/** WhatsApp wants the E.164 digits with NO leading `+`. With one it opens a
 *  blank chat rather than the patient's. */
export function whatsappLink(e164: string, message: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}

/**
 * `sms:` with `?&body=`, and the odd-looking `?&` is deliberate.
 *
 * iOS wants `sms:+351...&body=...` and Android wants `sms:+351...?body=...`.
 * `?&body=` satisfies both: Android reads `?` as the query start and `&body`
 * as the first parameter, iOS reads `&body` as the separator it expects. It is
 * the documented cross-platform form and it is why this is not just template
 * interpolation at the call site.
 */
export function smsLink(e164: string, message: string): string {
  return `sms:${e164}?&body=${encodeURIComponent(message)}`;
}

export function mailtoLink(email: string, subject: string, message: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(message)}`;
}

/**
 * The prefilled message.
 *
 * A DRAFT, NOT A SEND. It arrives in the receptionist's own WhatsApp or mail
 * client where they can change every word before sending, which is what makes a
 * templated message acceptable for a clinical relationship at all. Marked for
 * the owner's copy review at the WF-03 sitting rather than treated as approved.
 *
 * NO CLINICAL CONTENT, and that is a hard rule rather than a stylistic one. The
 * template names the patient and the DATE they were last seen. It never names
 * the service, the therapist's speciality or the reason for the visit — a
 * WhatsApp preview appears on a lock screen that other people can see.
 */
export function followupMessage(
  template: string,
  patientName: string,
  lastAttendance: string,
): string {
  // First name only. "Bom dia Maria" is how a receptionist speaks; the full
  // legal name reads like a debt collector.
  const firstName = patientName.trim().split(/\s+/)[0] ?? patientName;
  return template.replace("{name}", firstName).replace("{date}", lastAttendance);
}
