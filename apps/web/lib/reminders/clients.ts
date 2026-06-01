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
  if (!liveSendEnabled() || !apiKey) {
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
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!liveSendEnabled() || !sid || !token || !from) {
    return { channel: "sms", sandbox: true, id: "sandbox:sms" };
  }

  const { default: twilio } = await import("twilio");
  const client = twilio(sid, token);
  const result = await client.messages.create({
    to: msg.to,
    from,
    body: msg.body,
  });
  return { channel: "sms", sandbox: false, id: result.sid };
}
