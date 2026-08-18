// SMS (Twilio) + email (Resend) adapters for apps/api.
//
// TRANSPORT ONLY. Every gating decision belongs to the choke point in
// @osteojp/notify: registered + approved template, live-send flag exactly "true",
// provider configured, valid recipient. This module supplies the provider calls
// and the env reads, and makes no policy — the same shape as
// apps/web/lib/reminders/clients.ts, so there is exactly one gate in the platform
// and no second implementation to drift.
//
// The only body this app can send is patient activation, and it is registered
// approved:false (registry.ts), so every call here is refused before an SDK is
// constructed until JP approves it.
//
// No `server-only`: unit-testable under vitest's node env. SDKs are imported
// lazily inside the live path only.
//
// PII rule (#7): nothing here logs recipient phone/email or message bodies.

import {
  createNotifier,
  liveSendEnabled as flagEnabled,
  warnNotificationEnv,
  type Channel,
  type SendOutcome,
  type TemplateRegistry,
  type Transport,
} from "@osteojp/notify";
import { apiRegistry } from "./registry";
import { normalizePhonePT } from "./phone";

/**
 * REMINDERS_LIVE_SEND ALONE, and the omission is deliberate rather than an
 * oversight: apps/api has no invite path at all, so demanding INVITES_EMAIL_FROM
 * here would fail on a variable this app can never use.
 */
const API_LIVE_SEND_FLAGS = ["REMINDERS_LIVE_SEND"] as const;

// INC-12, 2026-08-18: this was `assertNotificationEnv([...])` and it threw at
// module evaluation. The same shape as apps/web/lib/reminders/clients.ts, and it
// moved for the same reason: a throw here takes down every route that
// transitively imports the adapters, none of which send anything.
//
// The assertion now runs inside createNotifier().dispatch. What remains here is
// the deploy-time signal, logged once per process, names only. It is not the
// check and nothing relies on it - see the long note in the apps/web twin.
warnNotificationEnv("apps/api/lib/notify/clients", API_LIVE_SEND_FLAGS);

export type SendChannel = Channel;

export type SendResult = {
  channel: SendChannel;
  /** true when no network call was made (suppressed by any gate). */
  sandbox: boolean;
  id: string;
};

export type SmsMessage = { to: string; body: string };
export type EmailMessage = { to: string; subject: string; body: string };

export function liveSendEnabled(): boolean {
  return flagEnabled("REMINDERS_LIVE_SEND");
}

/**
 * REQUIRED — no fallback. The previous default was `no-reply@osteojp.pt`, a
 * root-domain address Resend rejects because the verified identity lives on
 * send.osteojp.pt. Same class as the two fallbacks removed in apps/web.
 */
function requiredEmailFrom(): string {
  const from = process.env.REMINDERS_EMAIL_FROM;
  if (!from || from.trim() === "") {
    throw new Error(
      "patient-activation/email: REMINDERS_EMAIL_FROM is required and has no default. " +
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
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!);
    const { data, error } = await resend.emails.send({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    if (error) throw new Error(`patient-activation/email: Resend send failed (${error.name})`);
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
 * Bind the adapters to a registry. Production uses `apiRegistry`; tests inject a
 * fixture so the TRANSPORT behaviour (sender resolution, E.164, error
 * propagation) stays testable without approving a real body or weakening the
 * gate. The gate itself is unchanged either way — an injected registry still has
 * to mark a template approved for anything to send.
 */
export function createSender(registry: TemplateRegistry = apiRegistry) {
  const notifier = createNotifier({
    registry,
    transport: providerTransport,
    transportConfigured,
    emailFrom: requiredEmailFrom,
    // INC-12: the env assertion the module scope used to run.
    envFlags: API_LIVE_SEND_FLAGS,
  });

  return {
    async sendSms(msg: SmsMessage & { templateId: string }): Promise<SendResult> {
      // E.164 guard — nothing may reach messages.create un-normalized (Twilio
      // rejects non-E.164 with 21211). PII rule (#7): the value is never logged.
      const to = normalizePhonePT(msg.to);
      if (!to) {
        console.warn("[patient-activation] sms skipped (invalid_phone)");
        return { channel: "sms", sandbox: true, id: "skipped:invalid_phone" };
      }
      return toSendResult(
        await notifier.dispatch({ templateId: msg.templateId, channel: "sms", to, body: msg.body }),
      );
    },
    async sendEmail(msg: EmailMessage & { templateId: string }): Promise<SendResult> {
      return toSendResult(
        await notifier.dispatch({
          templateId: msg.templateId,
          channel: "email",
          to: msg.to,
          subject: msg.subject,
          body: msg.body,
        }),
      );
    },
  };
}

const defaultSender = createSender();

export const sendSms = defaultSender.sendSms;
export const sendEmail = defaultSender.sendEmail;
