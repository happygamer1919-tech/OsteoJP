// Email (Resend) + SMS (Twilio) send wrappers — sandbox-first.
//
// Hard rule for Stream E: NO LIVE SENDS. These wrappers default to sandbox mode
// and only touch the network when REMINDERS_LIVE_SEND === "true" AND the
// provider keys are present. In sandbox they render-and-return a simulated
// result without importing or constructing the SDK at all — which is what lets
// the unit tests assert that zero network calls fire.
//
// No `server-only` here so the senders are unit-testable under vitest's node
// env. The SDKs are imported lazily inside the live branch, so the sandbox path
// never loads them.
//
// PII rule (#7): nothing here logs recipient addresses, phone numbers, names,
// or message bodies. Only non-identifying metadata (channel, sandbox flag).

import { normalizePhonePT } from "./phone";

export type SendChannel = "email" | "sms";

export type SendResult = {
  channel: SendChannel;
  /** true when no network call was made (sandbox / disabled). */
  sandbox: boolean;
  /** Provider message id when live; a synthetic "sandbox" marker otherwise. */
  id: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export type SmsMessage = {
  to: string;
  body: string;
};

/**
 * Live sends are off unless REMINDERS_LIVE_SEND is exactly "true". Any other
 * value (unset, "false", "1", "sandbox") keeps us in sandbox mode. Read at call
 * time, not module load, so tests and env flips take effect without re-import.
 */
export function liveSendEnabled(): boolean {
  return process.env.REMINDERS_LIVE_SEND === "true";
}

/** Why a send was suppressed in dry-run. Used only for the intent log. */
type DryRunReason = "live_send_disabled" | "missing_provider_config";

/**
 * Log the INTENT of a suppressed (dry-run) send. PII rule (#7): channel + reason
 * only — never the recipient, subject, or body. This is the "logs intent
 * instead of sending" behaviour that makes the default safe and observable.
 */
function logDryRun(channel: SendChannel, reason: DryRunReason): void {
  console.info(`[reminders] dry-run: ${channel} not sent (${reason})`);
}

function fromEmail(): string {
  // Pending Resend domain verification — see docs/dns-records-pending.md. Never
  // hardcode a verified sender; read from env so prod can flip without a deploy.
  return process.env.REMINDERS_EMAIL_FROM ?? "reminders@osteojp.pt";
}

/* ================================================================== */
/* Email — Resend (EU)                                                 */
/* ================================================================== */

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!liveSendEnabled()) {
    logDryRun("email", "live_send_disabled");
    return { channel: "email", sandbox: true, id: "sandbox:email" };
  }
  if (!apiKey) {
    logDryRun("email", "missing_provider_config");
    return { channel: "email", sandbox: true, id: "sandbox:email" };
  }

  // Lazy import: only loaded on the live path, never in sandbox/tests.
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: fromEmail(),
    to: msg.to,
    subject: msg.subject,
    text: msg.body,
  });
  if (error) {
    throw new Error(`reminders/email: Resend send failed (${error.name})`);
  }
  return { channel: "email", sandbox: false, id: data?.id ?? "unknown" };
}

/* ================================================================== */
/* SMS — Twilio                                                        */
/* ================================================================== */

export async function sendSms(msg: SmsMessage): Promise<SendResult> {
  // E.164 guard — nothing may reach messages.create un-normalized (Twilio
  // rejects non-E.164 with 21211). The dispatch layer already skips-and-logs
  // with ids; this is defense-in-depth for any other caller. PII rule (#7):
  // the rejected value is never logged.
  const to = normalizePhonePT(msg.to);
  if (!to) {
    console.warn("[reminders] sms skipped (invalid_phone)");
    return { channel: "sms", sandbox: true, id: "skipped:invalid_phone" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!liveSendEnabled()) {
    logDryRun("sms", "live_send_disabled");
    return { channel: "sms", sandbox: true, id: "sandbox:sms" };
  }
  if (!sid || !token || !from) {
    logDryRun("sms", "missing_provider_config");
    return { channel: "sms", sandbox: true, id: "sandbox:sms" };
  }

  const { default: twilio } = await import("twilio");
  const client = twilio(sid, token);
  const result = await client.messages.create({
    to,
    from,
    body: msg.body,
  });
  return { channel: "sms", sandbox: false, id: result.sid };
}
