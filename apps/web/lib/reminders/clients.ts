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
  createNotifier,
  liveSendEnabled as flagEnabled,
  type Channel,
  type SendOutcome,
  type TemplateRegistry,
  type Transport,
} from "@osteojp/notify";
import { webRegistry } from "./notification-registry";
import { normalizePhonePT } from "./phone";

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
function requiredEmailFrom(): string {
  const from = process.env.REMINDERS_EMAIL_FROM;
  if (!from || from.trim() === "") {
    throw new Error(
      "reminders/email: REMINDERS_EMAIL_FROM is required and has no default. " +
        "Set it to the verified Resend identity on send.osteojp.pt.",
    );
  }
  return from;
}

function twilioSender(): string | undefined {
  return process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID;
}

/** Credential presence only. Never constructs a client, never logs a value. */
function transportConfigured(channel: Channel): boolean {
  if (channel === "email") {
    return !!process.env.RESEND_API_KEY && !!process.env.REMINDERS_EMAIL_FROM;
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
