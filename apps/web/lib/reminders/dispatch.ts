import "server-only";
import { parseTenantConfig, type ReminderConfig } from "@/lib/admin/settings-config";
import { loadReminderData } from "./data";
import { resolveLocale, formatTime, formatDateLong, formatDateShort } from "./locale";
import {
  renderEmail,
  renderSms,
  renderConfirmationEmail,
  renderConfirmationSms,
  renderFollowUpEmail,
  renderFollowUpSms,
  renderNoShowEmail,
  renderNoShowSms,
  type ReminderContext,
  type ReminderOffsetId,
  type FollowUpContext,
  type NoShowContext,
} from "./templates";
import { sendEmail, sendSms, type SendResult } from "./clients";
import { normalizePhonePT } from "./phone";
import { signRescheduleToken, rescheduleTokenExpiry } from "./link-token";
import { REMINDER_OFFSETS } from "./offsets";

// Reminder dispatch: load (tenant-scoped) → resolve locale → render PT/EN →
// send (sandbox-gated). One function, called from the Inngest step. Kept thin
// and side-effect-explicit so the Inngest layer stays about orchestration.

// Statuses where a reminder still makes sense. A cancelled / completed /
// no-show appointment is dropped silently — the run is a no-op, not an error.
const REMINDABLE_STATUSES = new Set(["scheduled", "confirmed"]);

export type DispatchOutcome =
  | {
      dispatched: false;
      reason: "not_found" | "status" | "no_contact" | "lead_time_off" | "channels_off";
    }
  | { dispatched: true; channels: SendResult[] };

/**
 * Lead-time (hours before start) for each scheduler offset id, derived from
 * REMINDER_OFFSETS so the dispatch gate and the scheduler share one source of
 * truth. The tenant config's REMINDER_LEAD_TIME_OPTIONS is deliberately the same
 * 48/24 set, which is what makes the membership test in planReminderChannels
 * meaningful — the UI can never select a lead time the pipeline can't honor.
 */
const OFFSET_LEAD_HOURS = new Map<ReminderOffsetId, number>(
  REMINDER_OFFSETS.map((o) => [o.id, o.minutesBefore / 60]),
);

export type ReminderPlan =
  | { send: false; reason: "lead_time_off" | "no_contact" | "channels_off" }
  | { send: true; email: boolean; sms: boolean };

/**
 * Decide, from the tenant reminder config, which channels (if any) a reminder
 * for this (offset, patient-contact) should go out on. Pure + exported for
 * direct unit testing without the DB. Precedence, most decisive first:
 *   1. lead_time_off  — the tenant disabled this offset; nothing sends, contact
 *      and channel toggles are irrelevant.
 *   2. no_contact     — the patient has neither email nor phone on file.
 *   3. channels_off   — contact exists, but every channel the patient could be
 *      reached on is disabled (tenant config OR patient opt-out).
 * On the default config (both channels on, both lead times on) and default
 * patient prefs (SMS on, email off), this collapses to the prior contact-
 * presence behavior — which is how "defaults preserve current behavior" holds.
 *
 * patientPrefs defaults to both-enabled to preserve behavior for callers that
 * don't yet supply the field (e.g. existing tests).
 */
export function planReminderChannels(
  reminders: ReminderConfig,
  offsetId: ReminderOffsetId,
  contact: { email: boolean; phone: boolean },
  patientPrefs: { smsEnabled: boolean; emailEnabled: boolean } = { smsEnabled: true, emailEnabled: true },
): ReminderPlan {
  const leadHours = OFFSET_LEAD_HOURS.get(offsetId);
  if (
    leadHours === undefined ||
    !(reminders.leadTimeHours as readonly number[]).includes(leadHours)
  ) {
    return { send: false, reason: "lead_time_off" };
  }
  if (!contact.email && !contact.phone) {
    return { send: false, reason: "no_contact" };
  }
  const email = reminders.emailEnabled && patientPrefs.emailEnabled && contact.email;
  const sms = reminders.smsEnabled && patientPrefs.smsEnabled && contact.phone;
  if (!email && !sms) return { send: false, reason: "channels_off" };
  return { send: true, email, sms };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Normalize the stored patient phone to E.164 PT and send, or skip with a
 * structured warning when it cannot normalize (docs/QUESTIONS.md 2026-07-06:
 * un-normalized numbers reach Twilio and fail with 21211 once live). The log
 * carries ids only — never the raw number (PII rule #7). Returns null on skip
 * so callers simply don't push a channel result; the appointment still counts
 * as dispatched (email, when planned, goes out independently).
 */
async function sendPatientSms(args: {
  tenantId: string;
  appointmentId: string;
  patientId: string;
  phone: string;
  body: string;
}): Promise<SendResult | null> {
  const to = normalizePhonePT(args.phone);
  if (!to) {
    console.warn(
      `[reminders] sms skipped: invalid_phone tenantId=${args.tenantId} appointmentId=${args.appointmentId} patientId=${args.patientId}`,
    );
    return null;
  }
  return sendSms({ to, body: args.body });
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
 * Render and send the reminder for one appointment + offset, honoring the
 * tenant's reminder config (channel toggles + selected lead times) read from
 * tenants.settings. A channel goes out only when it is BOTH enabled in config
 * AND the patient has that contact on file; an offset the tenant turned off is
 * suppressed entirely. Config is read tolerantly (parseTenantConfig), so a
 * tenant with no reminder config saved behaves exactly as before — all channels
 * on, both lead times on. Sends stay sandbox-gated in the wrappers, so by
 * default this renders and returns without any network call.
 *
 * The scheduler still enqueues every offset (it has no per-tenant config); the
 * gate lives here so the scheduling math (#98/#99) stays untouched.
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

  const config = parseTenantConfig(data.tenantSettings).reminders;
  const plan = planReminderChannels(
    config,
    offsetId,
    { email: !!data.patientEmail, phone: !!data.patientPhone },
    { smsEnabled: data.patientReminderSmsEnabled, emailEnabled: data.patientReminderEmailEnabled },
  );
  if (!plan.send) return { dispatched: false, reason: plan.reason };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildReminderContext({ ...data, tenantId }, locale);

  const channels: SendResult[] = [];
  if (plan.email && data.patientEmail) {
    const email = renderEmail(offsetId, locale, ctx);
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: email.subject,
        body: email.body,
      }),
    );
  }
  if (plan.sms && data.patientPhone) {
    const sms = renderSms(offsetId, locale, ctx);
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: sms,
    });
    if (sent) channels.push(sent);
  }

  return { dispatched: true, channels };
}

/* ================================================================== */
/* Confirmation dispatch                                               */
/* ================================================================== */

/** Statuses where a booking confirmation makes sense (pre-visit only). */
const CONFIRMABLE_STATUSES = new Set(["scheduled", "confirmed"]);

/**
 * Send the immediate booking confirmation for an appointment. Fires right after
 * appointment creation or reschedule; reuses the same ReminderContext so the
 * email body can include the reschedule link. Channel toggles from the tenant's
 * reminder config apply — the same emailEnabled / smsEnabled switches gate all
 * outbound patient notifications.
 */
export async function dispatchConfirmation(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  const data = await loadReminderData(tenantId, appointmentId);
  if (!data) return { dispatched: false, reason: "not_found" };
  if (!CONFIRMABLE_STATUSES.has(data.status)) {
    return { dispatched: false, reason: "status" };
  }
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = reminders.emailEnabled && data.patientReminderEmailEnabled && !!data.patientEmail;
  const sms = reminders.smsEnabled && data.patientReminderSmsEnabled && !!data.patientPhone;
  if (!email && !sms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildReminderContext({ ...data, tenantId }, locale);

  const channels: SendResult[] = [];
  if (email && data.patientEmail) {
    const rendered = renderConfirmationEmail(locale, ctx);
    channels.push(await sendEmail({ to: data.patientEmail, subject: rendered.subject, body: rendered.body }));
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderConfirmationSms(locale, ctx),
    });
    if (sent) channels.push(sent);
  }
  return { dispatched: true, channels };
}

/* ================================================================== */
/* Follow-up dispatch                                                  */
/* ================================================================== */

function buildFollowUpContext(
  data: Awaited<ReturnType<typeof loadReminderData>> & object,
  locale: Parameters<typeof formatTime>[1],
): FollowUpContext {
  return {
    patientFirstName: firstName(data.patientName),
    appointmentDateLong: formatDateLong(data.startsAt, locale),
    appointmentDateShort: formatDateShort(data.startsAt),
    clinicPhone: data.locationPhone || tenantPhone(data.tenantSettings),
  };
}

/**
 * Send the post-visit follow-up. Called 24 h after the appointment ends (the
 * Inngest function sleeps before calling). Only fires when status is still
 * "completed" — if the appointment was subsequently re-opened this is a no-op.
 */
export async function dispatchFollowUp(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  const data = await loadReminderData(tenantId, appointmentId);
  if (!data) return { dispatched: false, reason: "not_found" };
  if (data.status !== "completed") return { dispatched: false, reason: "status" };
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = reminders.emailEnabled && data.patientReminderEmailEnabled && !!data.patientEmail;
  const sms = reminders.smsEnabled && data.patientReminderSmsEnabled && !!data.patientPhone;
  if (!email && !sms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildFollowUpContext(data, locale);

  const channels: SendResult[] = [];
  if (email && data.patientEmail) {
    const rendered = renderFollowUpEmail(locale, ctx);
    channels.push(await sendEmail({ to: data.patientEmail, subject: rendered.subject, body: rendered.body }));
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderFollowUpSms(locale, ctx),
    });
    if (sent) channels.push(sent);
  }
  return { dispatched: true, channels };
}

/* ================================================================== */
/* No-show dispatch                                                    */
/* ================================================================== */

function buildNoShowContext(
  data: Awaited<ReturnType<typeof loadReminderData>> & object,
  tenantId: string,
  locale: Parameters<typeof formatTime>[1],
): NoShowContext {
  return {
    patientFirstName: firstName(data.patientName),
    appointmentDateLong: formatDateLong(data.startsAt, locale),
    appointmentDateShort: formatDateShort(data.startsAt),
    appointmentTime: formatTime(data.startsAt, locale),
    clinicPhone: data.locationPhone || tenantPhone(data.tenantSettings),
    rescheduleLink: rescheduleLink({
      tenantId,
      appointmentId: data.appointmentId,
      startsAt: data.startsAt,
    }),
  };
}

/**
 * Send the no-show notification. Fires immediately when the Inngest function
 * receives the appointment/noshow event. Guards on status still being "no_show"
 * in case the staff corrects the status before the job runs.
 */
export async function dispatchNoShow(
  tenantId: string,
  appointmentId: string,
): Promise<DispatchOutcome> {
  const data = await loadReminderData(tenantId, appointmentId);
  if (!data) return { dispatched: false, reason: "not_found" };
  if (data.status !== "no_show") return { dispatched: false, reason: "status" };
  if (!data.patientEmail && !data.patientPhone) {
    return { dispatched: false, reason: "no_contact" };
  }

  const { reminders } = parseTenantConfig(data.tenantSettings);
  const email = reminders.emailEnabled && data.patientReminderEmailEnabled && !!data.patientEmail;
  const sms = reminders.smsEnabled && data.patientReminderSmsEnabled && !!data.patientPhone;
  if (!email && !sms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildNoShowContext(data, tenantId, locale);

  const channels: SendResult[] = [];
  if (email && data.patientEmail) {
    const rendered = renderNoShowEmail(locale, ctx);
    channels.push(await sendEmail({ to: data.patientEmail, subject: rendered.subject, body: rendered.body }));
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderNoShowSms(locale, ctx),
    });
    if (sent) channels.push(sent);
  }
  return { dispatched: true, channels };
}
