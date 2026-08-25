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
import {
  feeNoticeFlagEnabled,
  shouldRenderFeeNotice,
  smsTemplateIdFor,
} from "./fee-notice";
import { sendEmail, sendSms, type SendResult } from "./clients";
import type { Channel } from "@osteojp/notify";
import { normalizePhonePT } from "@osteojp/notify";
import { isSmsCapablePT } from "@osteojp/notify";
import {
  signRescheduleToken,
  rescheduleTokenExpiry,
  type TokenScope,
} from "./link-token";
import { REMINDER_OFFSETS } from "./offsets";

// Reminder dispatch: load (tenant-scoped) → resolve locale → render PT/EN →
// send (sandbox-gated). One function, called from the Inngest step. Kept thin
// and side-effect-explicit so the Inngest layer stays about orchestration.

// Statuses where a reminder still makes sense. A cancelled / completed /
// no-show appointment is dropped silently — the run is a no-op, not an error.
const REMINDABLE_STATUSES = new Set(["scheduled", "confirmed"]);

/**
 * The pedido gate. An appointment whose `confirmation_state` is `pending` is a
 * PEDIDO DE MARCACAO that reception has not confirmed, and it must not produce a
 * reminder.
 *
 * WHY THIS IS NOT COVERED BY THE STATUS CHECK ABOVE, which is the whole reason
 * this constant exists separately. A pedido is `status = 'scheduled'` with
 * `confirmation_state = 'pending'`, so `REMINDABLE_STATUSES` admits it. The two
 * columns answer different questions: status is "does this appointment still
 * exist", confirmation_state is "has the clinic agreed to it". Reminding on the
 * first without the second tells a patient their appointment is tomorrow when
 * the clinic has not accepted it.
 *
 * WHAT MADE IT NECESSARY, and it was a ruling rather than a bug report. JP ruled
 * on D1 that unconfirmed pedidos stack on one slot with NO CAP, confirming
 * migration 0059's header. With no cap, N patients can hold a pending pedido on
 * the same therapist and the same slot, and without this gate every one of them
 * receives a 24h reminder for an appointment only ONE of them can hold. The
 * no-cap ruling is defensible precisely because a pedido is a request; a
 * reminder would restate it as a commitment. Full reasoning:
 * docs/rulings/R10-reminders-skip-unconfirmed-pedidos.md.
 *
 * A SET RATHER THAN A `!== "pending"` COMPARISON, deliberately: the enum can
 * grow, and a future state that also means "not agreed yet" must be added HERE
 * rather than discovered as a second reminder defect. Null is remindable because
 * rows predating the column carry no pedido semantics.
 */
const UNREMINDABLE_CONFIRMATION_STATES = new Set(["pending"]);

export type DispatchOutcome =
  | {
      dispatched: false;
      reason:
        | "not_found"
        | "status"
        /** W13-C: an unconfirmed pedido. Distinct from `status` on purpose - a
         *  pedido IS `scheduled`, so collapsing the two would hide which gate
         *  fired and make the skip unreadable in the logs. */
        | "unconfirmed"
        | "no_contact"
        | "lead_time_off"
        | "channels_off";
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
  templateId: string;
}): Promise<SendResult | null> {
  const to = normalizePhonePT(args.phone);
  if (!to) {
    console.warn(
      `[reminders] sms skipped: invalid_phone tenantId=${args.tenantId} appointmentId=${args.appointmentId} patientId=${args.patientId}`,
    );
    return null;
  }

  // ================================================================= //
  // A LANDLINE IS SKIPPED, NOT SENT. Q-LE-REMINDERS-LANDLINE-1, ruled
  // 2026-08-20: skip AND surface it to reception.
  // ================================================================= //
  // `normalizePhonePT` admits the `2` prefix - Portuguese geographic lines,
  // which cannot receive SMS - so before this the clinic paid Twilio for a
  // message the carrier had nowhere to deliver. The patient got no reminder
  // either way; the only difference the skip makes is the bill.
  //
  // ITS OWN REASON, NOT `invalid_phone`, and that distinction is the whole
  // reason this branch is separate. They are different facts about different
  // problems: `invalid_phone` is a number nobody can use and the record is
  // wrong; `landline` is a perfectly good number that cannot receive THIS
  // channel. Reception acts on them differently - one is a typo, the other is a
  // conversation with the patient - and a single log line saying "invalid"
  // would send them to correct a number that is correct.
  //
  // SKIPPING IS HALF THE RULING AND IT IS THE HALF THAT DOES NOT HELP THE
  // PATIENT. The clinic stops paying and the patient still gets nothing. The
  // other half is the reception surface: `listPatientsUnreachableBySms` derives
  // the patients this WILL happen to from their stored number and their upcoming
  // appointments - BEFORE the reminder is due, rather than logging it after.
  if (!isSmsCapablePT(to)) {
    console.warn(
      `[reminders] sms skipped: landline tenantId=${args.tenantId} appointmentId=${args.appointmentId} patientId=${args.patientId}. ` +
        `The stored number is a Portuguese geographic line and cannot receive SMS. ` +
        `This is a DATA problem, not a delivery failure: reception sees the patient on /notificacoes and asks for a mobile.`,
    );
    return null;
  }
  return sendSms({
    to,
    body: args.body,
    templateId: args.templateId,
    appointmentId: args.appointmentId,
  });
}

function tenantPhone(settings: unknown): string {
  const s = settings as { contacts?: { phone?: unknown } } | null | undefined;
  const phone = s?.contacts?.phone;
  return typeof phone === "string" ? phone : "";
}

/**
 * Base URL for the signed reschedule link. REQUIRED — no fallback.
 *
 * The previous default was `https://osteojp.pt`, the MARKETING site. Unset in
 * prod meant every reminder and no-show email carried a `/r/<token>` link that
 * 404s, with nothing failing anywhere: the send succeeded, the patient hit a dead
 * page, and the clinic learned about it from a phone call. Failing at render is
 * strictly better than shipping a broken link to a patient.
 */
function requiredRescheduleBase(): string {
  const base = process.env.REMINDERS_RESCHEDULE_BASE_URL;
  if (!base || base.trim() === "") {
    throw new Error(
      "reminders/link: REMINDERS_RESCHEDULE_BASE_URL is required and has no default. " +
        "Set it to the deployed app origin (the host that serves /r/<token>), not the marketing site.",
    );
  }
  return base;
}

function rescheduleLink(args: {
  tenantId: string;
  appointmentId: string;
  startsAt: Date;
  scope: TokenScope;
}): string {
  // Stateless, HMAC-signed token (see link-token.ts) — the URL carries only the
  // opaque token, never patient data or a raw id path. Resolves at /r/<token>.
  // EMAIL only: the token is too long for a single-segment SMS, so the SMS copy
  // points to the clinic phone instead.
  //
  // `scope` is REQUIRED rather than defaulted, and that is the point. Counsel's
  // per-offset matrix (docs/rgpd-token-flow.md §5) gives the 48h email confirm
  // AND cancel, and the 24h SMS confirm ONLY, because the SMS arrives at or
  // inside the clinic's 24h cancel cutoff. A default here would let a future
  // offset acquire the permissive scope by saying nothing, which is exactly how
  // an action the clinic has ruled out would ship unnoticed. Every call site
  // must state which matrix row it is.
  const base = requiredRescheduleBase();
  const token = signRescheduleToken({
    tenantId: args.tenantId,
    appointmentId: args.appointmentId,
    exp: rescheduleTokenExpiry(args.startsAt),
    scope: args.scope,
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
      // The link is carried by the 48h EMAIL only (see rescheduleLink), which is
      // sent outside the 24h cancel cutoff: counsel's matrix row for that offset
      // is confirm AND cancel. The server still re-checks the cutoff at
      // redemption, because this link can be clicked well after it was sent.
      scope: "confirm_cancel",
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
  /** The single channel this run is for. One run, one channel, one key. */
  channel: Channel,
): Promise<DispatchOutcome> {
  const data = await loadReminderData(tenantId, appointmentId);
  if (!data) return { dispatched: false, reason: "not_found" };
  if (!REMINDABLE_STATUSES.has(data.status)) {
    return { dispatched: false, reason: "status" };
  }
  // The pedido gate. Checked AFTER status so an unconfirmed pedido that was also
  // cancelled reports the more specific reason it already reported, keeping the
  // existing outcome stable for callers that count skip reasons.
  if (UNREMINDABLE_CONFIRMATION_STATES.has(data.confirmationState ?? "")) {
    return { dispatched: false, reason: "unconfirmed" };
  }

  const config = parseTenantConfig(data.tenantSettings).reminders;
  const plan = planReminderChannels(
    config,
    offsetId,
    { email: !!data.patientEmail, phone: !!data.patientPhone },
    { smsEnabled: data.patientReminderSmsEnabled, emailEnabled: data.patientReminderEmailEnabled },
  );
  if (!plan.send) return { dispatched: false, reason: plan.reason };

  // One run sends ONE channel. The scheduler already fanned out per channel, so
  // narrowing the plan here is what keeps the run and its idempotency key aligned:
  // a run keyed on ...:email must never also send an SMS.
  const wantEmail = channel === "email" && plan.email;
  const wantSms = channel === "sms" && plan.sms;
  if (!wantEmail && !wantSms) return { dispatched: false, reason: "channels_off" };

  const locale = resolveLocale(data.tenantSettings);
  const ctx = buildReminderContext({ ...data, tenantId }, locale);

  const channels: SendResult[] = [];
  if (wantEmail && data.patientEmail) {
    const email = renderEmail(offsetId, locale, ctx);
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: email.subject,
        body: email.body,
        templateId: `reminder.${offsetId}.email`,
        appointmentId,
      }),
    );
  }
  if (wantSms && data.patientPhone) {
    // W13-05 DOUBLE GATE, evaluated ONCE, here. `shouldRenderFeeNotice` is the
    // only place the condition exists; everything below consumes its answer.
    //
    // THE ID IS DERIVED FROM THE SAME BOOLEAN AS THE BODY, so a fee-bearing
    // message cannot be sent under the approved plain id. packages/notify's gate
    // resolves approval BY ID, so that pairing is what makes the registry a real
    // third lock rather than a label: while the fee entry is `approved: false`
    // the send is refused as `template_unapproved` and the patient gets nothing.
    const feeNotice = shouldRenderFeeNotice({
      flagEnabled: feeNoticeFlagEnabled(),
      patientHasAcceptedTerms: data.patientHasAcceptedTerms,
    });
    const sms = renderSms(offsetId, locale, ctx, feeNotice);
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: sms,
      templateId: smsTemplateIdFor(offsetId, feeNotice),
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
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: rendered.subject,
        body: rendered.body,
        templateId: "confirmation.email",
        appointmentId,
      }),
    );
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderConfirmationSms(locale, ctx),
      templateId: "confirmation.sms",
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
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: rendered.subject,
        body: rendered.body,
        templateId: "follow_up.email",
        appointmentId,
      }),
    );
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderFollowUpSms(locale, ctx),
      templateId: "follow_up.sms",
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
      scope: "confirm_cancel",
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
    channels.push(
      await sendEmail({
        to: data.patientEmail,
        subject: rendered.subject,
        body: rendered.body,
        templateId: "no_show.email",
        appointmentId,
      }),
    );
  }
  if (sms && data.patientPhone) {
    const sent = await sendPatientSms({
      tenantId,
      appointmentId,
      patientId: data.patientId,
      phone: data.patientPhone,
      body: renderNoShowSms(locale, ctx),
      templateId: "no_show.sms",
    });
    if (sent) channels.push(sent);
  }
  return { dispatched: true, channels };
}
