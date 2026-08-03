// Shared vocabulary for the notification choke point.
//
// Every outbound patient- or staff-facing message in the platform passes through
// `dispatch()` in gate.ts. These are the types that gate speaks.

export type Channel = "email" | "sms";

/** Who the message is written for. Drives the approval policy, not the routing. */
export type Audience = "patient" | "staff";

/**
 * Why a send did not reach a provider. Ordered here the same way the gate
 * evaluates them, most decisive first — see `dispatch()`.
 */
export type SuppressionReason =
  | "template_unapproved"
  | "live_send_disabled"
  | "missing_provider_config"
  | "invalid_recipient";

/** The env var that arms live sending for a given template's stream. */
export type LiveSendFlag = "REMINDERS_LIVE_SEND" | "INVITES_LIVE_SEND";

export type SendOutcome =
  | {
      sent: false;
      sandbox: true;
      reason: SuppressionReason;
      templateId: string;
      channel: Channel;
      /** Synthetic marker; never a provider id. */
      id: string;
    }
  | {
      sent: true;
      sandbox: false;
      templateId: string;
      channel: Channel;
      /** Provider message id. */
      id: string;
    };

export type EmailPayload = {
  to: string;
  from: string;
  subject: string;
  body: string;
};

export type SmsPayload = {
  to: string;
  body: string;
};

/**
 * The provider seam. Production wires the Twilio/Resend adapters; tests wire the
 * in-memory sink (sink.ts). The gate never imports a provider SDK itself, which
 * is what lets the suppression tests assert that zero network calls happen.
 */
export type Transport = {
  sendEmail(msg: EmailPayload): Promise<{ id: string }>;
  sendSms(msg: SmsPayload): Promise<{ id: string }>;
};
