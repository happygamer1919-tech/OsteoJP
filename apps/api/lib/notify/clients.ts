// SMS (Twilio) + email (Resend) send wrappers — sandbox-first.
//
// Mirrors apps/web/lib/reminders/clients.ts and reuses the SAME channel config
// (REMINDERS_LIVE_SEND + the provider env), so patient activation does NOT block
// on Twilio being live: with REMINDERS_LIVE_SEND !== "true" (the default) or
// missing provider keys, these render-and-return a sandbox result WITHOUT
// importing or constructing any SDK — zero network calls. The mechanism is fully
// built; only the live send is gated.
//
// No `server-only`: unit-testable under vitest's node env. SDKs are imported
// lazily inside the live branch only.
//
// PII rule (#7): nothing here logs recipient phone/email or message bodies — only
// non-identifying metadata (channel, sandbox flag).

export type SendChannel = "email" | "sms";

export type SendResult = {
  channel: SendChannel;
  /** true when no network call was made (sandbox / disabled). */
  sandbox: boolean;
  id: string;
};

/**
 * Live sends are off unless REMINDERS_LIVE_SEND is exactly "true" — the same flag
 * the staff reminder + invite paths read, so the platform has ONE send switch.
 * Read at call time so tests/env flips take effect without re-import.
 */
export function liveSendEnabled(): boolean {
  return process.env.REMINDERS_LIVE_SEND === "true";
}

type DryRunReason = "live_send_disabled" | "missing_provider_config";

function logDryRun(channel: SendChannel, reason: DryRunReason): void {
  console.info(`[patient-activation] dry-run: ${channel} not sent (${reason})`);
}

export type SmsMessage = { to: string; body: string };
export type EmailMessage = { to: string; subject: string; body: string };

export async function sendSms(msg: SmsMessage): Promise<SendResult> {
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
  const result = await client.messages.create({ to: msg.to, from, body: msg.body });
  return { channel: "sms", sandbox: false, id: result.sid };
}

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

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.REMINDERS_EMAIL_FROM ?? "no-reply@osteojp.pt";
  const { data, error } = await resend.emails.send({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.body,
  });
  if (error) throw new Error(`patient-activation/email: Resend send failed (${error.name})`);
  return { channel: "email", sandbox: false, id: data?.id ?? "unknown" };
}
