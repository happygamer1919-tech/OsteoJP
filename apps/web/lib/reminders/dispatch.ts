import "server-only";
import { loadReminderData } from "./data";
import { resolveLocale, formatTime, formatDateLong, formatDateShort } from "./locale";
import { renderEmail, renderSms, type ReminderContext, type ReminderOffsetId } from "./templates";
import { sendEmail, sendSms, type SendResult } from "./clients";
import { signRescheduleToken, rescheduleTokenExpiry } from "./link-token";

// Reminder dispatch: load (tenant-scoped) → resolve locale → render PT/EN →
// send (sandbox-gated). One function, called from the Inngest step. Kept thin
// and side-effect-explicit so the Inngest layer stays about orchestration.

// Statuses where a reminder still makes sense. A cancelled / completed /
// no-show appointment is dropped silently — the run is a no-op, not an error.
const REMINDABLE_STATUSES = new Set(["scheduled", "confirmed"]);

export type DispatchOutcome =
  | { dispatched: false; reason: "not_found" | "status" | "no_contact" }
  | { dispatched: true; channels: SendResult[] };

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function tenantPhone(settings: unknown): string {
  const s = settings as { contacts?: { phone?: unknown } } | null | undefined;
  const phone = s?.contacts?.phone;
  return typeof phone === "string" ? phone : "";
}

function rescheduleLink(args: {
  tenantId: string;
  appointmentId: string;
  startsAt: Date;
}): string {
  // Stateless, HMAC-signed token (see link-token.ts) — the URL carries only the
  // opaque token, never patient data or a raw id path. Resolves at /r/<token>.
  // EMAIL only: the token is too long for a single-segment SMS, so the SMS copy
  // points to the clinic phone instead.
  const base = process.env.REMINDERS_RESCHEDULE_BASE_URL ?? "https://osteojp.pt";
  const token = signRescheduleToken({
    tenantId: args.tenantId,
    appointmentId: args.appointmentId,
    exp: rescheduleTokenExpiry(args.startsAt),
  });
  return `${base.replace(/\/$/, "")}/r/${token}`;
}

/**
 * Build the channel-agnostic render context from loaded data + resolved locale.
 * Exported for direct unit testing without the DB.
 */
export function buildReminderContext(
  data: {
    tenantId: string;
    startsAt: Date;
    patientName: string;
    practitionerName: string;
    locationName: string;
    locationPhone: string | null;
    tenantSettings: unknown;
    appointmentId: string;
  },
  locale: Parameters<typeof formatTime>[1],
): ReminderContext {
  return {
    patientFirstName: firstName(data.patientName),
    appointmentDateLong: formatDateLong(data.startsAt, locale),
    appointmentDateShort: formatDateShort(data.startsAt),
    appointmentTime: formatTime(data.startsAt, locale),
    practitionerName: data.practitionerName,
    clinicLocation: data.locationName,
    clinicPhone: data.locationPhone || tenantPhone(data.tenantSettings),
    rescheduleLink: rescheduleLink({
      tenantId: data.tenantId,
      appointmentId: data.appointmentId,
      startsAt: data.startsAt,
    }),
  };
}

/**
 * Render and send the reminder for one appointment + offset. Email goes out if
 * the patient has an email; SMS if they have a phone. Both are sandbox-gated in
 * the send wrappers, so by default this renders and returns without any network
 * call.
 */
export async function dispatchReminder(
  tenantId: string,
  appointmentId: string,
  offsetId: ReminderOffsetId,
): Promise<DispatchOutcome> {
  const data = await loadReminderData(tenantId, appointmentId);
  if (!data) return { dispatched: false, reason: "not_found" };
  if (!REMINDABLE_STATUSES.has(data.status)) {
    return { dispatched: false, reason: "status" };
  }
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildReminderContext({ ...data, tenantId }, locale);

  const channels: SendResult[] = [];
  if (data.patientEmail) {
    const email = renderEmail(offsetId, locale, ctx);
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: email.subject,
        body: email.body,
      }),
    );
  }
  if (data.patientPhone) {
    const sms = renderSms(offsetId, locale, ctx);
    channels.push(await sendSms({ to: data.patientPhone, body: sms }));
  }

  return { dispatched: true, channels };
}
