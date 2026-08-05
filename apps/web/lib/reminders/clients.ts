// Email (Resend) + SMS (Twilio) adapters for apps/web.
//
// These are TRANSPORT ONLY. Every gating decision — is the template approved, is
// live send armed, is the provider configured — belongs to the choke point in
// @osteojp/notify, and there is no way to reach `messages.create` or
// `emails.send` except through it. This module supplies the provider calls and
// the env reads; it makes no policy.
//
// Callers pass a `templateId`. An id that is absent from
// notification-registry.ts, or present but approved:false, is refused before any
// SDK is constructed. That is deliberate: adding a body without registering it
// cannot ship it.
//
// No `server-only` here so the adapters stay unit-testable under vitest's node
// env. The SDKs are imported lazily inside the live path, so the suppressed path
// never loads them and fires zero network calls.
//
// PII rule (#7): nothing here logs recipients, subjects, or bodies.

import {
  assertNotificationEnv,
  createNotifier,
  liveSendEnabled as flagEnabled,
  type Channel,
  type SendOutcome,
  type TemplateRegistry,
  type Transport,
} from "@osteojp/notify";
import { INVITE_TEMPLATE, webRegistry } from "./notification-registry";
import { normalizePhonePT } from "./phone";

// BOOT VALIDATION for every apps/web send path that is NOT an Inngest function.
//
// app/api/inngest/route.ts already asserts this pair, but that route is only
// loaded for Inngest-driven work. Staff invites are not Inngest-driven: they run
// in a server action (lib/admin/staff.ts -> lib/invites/email.ts -> sendEmail
// here), a chain that never touches the route and therefore never reached a boot
// check. Arming INVITES_LIVE_SEND with REMINDERS_EMAIL_FROM or RESEND_API_KEY
// absent booted clean, then providerConfigured() below returned false and the
// caller silently degraded every invite to the temporary-password hand-off - no
// email, no error, no boot signal. That is the exact "fails at the user, not at
// boot" class #763 removed from the reminder path, surviving on the invite path
// because the sweep followed the reminder path only.
//
// This module is the right place, and for the same reason apps/api/lib/notify/
// clients.ts carries the identical line: it is the ONE choke point every send in
// this app goes through, reminders and invites alike, so nothing can send
// without loading it.
//
// BOTH flags, because either one arms an email send that needs the same vars.
// A no-op while every live-send flag is off, so dev, CI and preview builds are
// unaffected - missingNotificationEnv() returns an empty list unless a stream is
// actually live.
assertNotificationEnv(["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"]);

export type SendChannel = Channel;

/**
 * Kept structurally identical to the pre-registry shape so callers and the
 * invite module (which imports these types) are unaffected.
 */
export type SendResult = {
  channel: SendChannel;
  /** true when no network call was made (suppressed by any gate). */
  sandbox: boolean;
  /** Provider message id when live; a synthetic marker otherwise. */
  id: string;
};

export type EmailMessage = { to: string; subject: string; body: string };
export type SmsMessage = { to: string; body: string };

/** Back-compat helper: the reminder stream's own flag. */
export function liveSendEnabled(): boolean {
  return flagEnabled("REMINDERS_LIVE_SEND");
}

/**
 * The verified Resend sender. REQUIRED — there is no fallback. The previous
 * default was `reminders@osteojp.pt`, a root-domain address Resend would reject
 * at send time because the verified identity is the `send.osteojp.pt` subdomain.
 * A guaranteed send-time failure that looks healthy at boot is worse than a boot
 * failure, so this throws.
 */
function requiredEmailFrom(templateId?: string): string {
  const name = emailFromVarFor(templateId);
  const from = process.env[name];
  if (!from || from.trim() === "") {
    throw new Error(
      `reminders/email: ${name} is required and has no default. ` +
        "Set it to a verified Resend identity on send.osteojp.pt.",
    );
  }
  return from;
}

/**
 * Which from-address variable this template sends under.
 * LE-reminders-email-from-naming, owner ruling 2026-08-05: SPLIT, not rename.
 *
 * The name `REMINDERS_EMAIL_FROM` had come to power staff invites as well as
 * patient reminders, so the name lied about its scope and the two streams could
 * not have different senders without a second migration of everyone's
 * environment. They are separate variables now.
 *
 * DEFAULTS TO THE REMINDERS SENDER, not to the invites one. Every template in
 * this app except the staff invite is a patient reminder, so an unrecognised id
 * is far more likely to be a new reminder than a new invite — and if the guess
 * is ever wrong the failure is a loud boot/send error naming the missing
 * variable, never a silent send from the wrong identity.
 */
function emailFromVarFor(templateId?: string): string {
  return templateId === INVITE_TEMPLATE.id
    ? "INVITES_EMAIL_FROM"
    : "REMINDERS_EMAIL_FROM";
}

function twilioSender(): string | undefined {
  return process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID;
}

/** Credential presence only. Never constructs a client, never logs a value. */
function transportConfigured(channel: Channel, templateId?: string): boolean {
  if (channel === "email") {
    // The sender is checked PER STREAM: an invite is configured when the invites
    // sender is set, a reminder when the reminders sender is. Checking a single
    // shared name here would report a stream as configured on the strength of the
    // other stream's variable, and the send would then fail at Resend instead of
    // being suppressed with `missing_provider_config`.
    return !!process.env.RESEND_API_KEY && !!process.env[emailFromVarFor(templateId)];
  }
  return (
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!twilioSender()
  );
}

const providerTransport: Transport = {
  async sendEmail(msg) {
    // Lazy import: only on the live path, never in sandbox/tests.
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    if (error) throw new Error(`reminders/email: Resend send failed (${error.name})`);
    return { id: data?.id ?? "unknown" };
  },
  async sendSms(msg) {
    const { default: twilio } = await import("twilio");
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const result = await client.messages.create({
      to: msg.to,
      from: twilioSender()!,
      body: msg.body,
    });
    return { id: result.sid };
  },
};

function toSendResult(o: SendOutcome): SendResult {
  return { channel: o.channel, sandbox: o.sandbox, id: o.id };
}

/**
 * Bind the adapters to a registry. Production uses `webRegistry`; tests inject a
 * fixture so TRANSPORT behaviour (sender resolution, E.164, error propagation)
 * stays testable without approving a real body. The gate is unchanged either
 * way — an injected registry still has to mark a template approved to send.
 */
export function createSender(registry: TemplateRegistry = webRegistry) {
  const notifier = createNotifier({
    registry,
    transport: providerTransport,
    transportConfigured,
    emailFrom: requiredEmailFrom,
  });

  return {
    async sendEmail(
      msg: EmailMessage & { templateId: string; appointmentId?: string },
    ): Promise<SendResult> {
      return toSendResult(
        await notifier.dispatch({
          templateId: msg.templateId,
          channel: "email",
          to: msg.to,
          subject: msg.subject,
          body: msg.body,
          appointmentId: msg.appointmentId,
        }),
      );
    },
    async sendSms(
      msg: SmsMessage & { templateId: string; appointmentId?: string },
    ): Promise<SendResult> {
      // E.164 guard — nothing may reach messages.create un-normalized (Twilio
      // rejects non-E.164 with 21211). PII rule (#7): the value is never logged.
      const to = normalizePhonePT(msg.to);
      if (!to) {
        console.warn("[reminders] sms skipped (invalid_phone)");
        return { channel: "sms", sandbox: true, id: "skipped:invalid_phone" };
      }
      return toSendResult(
        await notifier.dispatch({
          templateId: msg.templateId,
          channel: "sms",
          to,
          body: msg.body,
          appointmentId: msg.appointmentId,
        }),
      );
    },
  };
}

const defaultSender = createSender();

export const sendEmail = defaultSender.sendEmail;
export const sendSms = defaultSender.sendSms;
