// Staff-invite email send — gated by INVITES_LIVE_SEND, independent of reminders.
//
// W7-01 decoupling: invites previously rode the reminder switch
// (REMINDERS_LIVE_SEND) via lib/reminders/clients.ts sendEmail, so the owner
// could not turn on invite email without also turning on appointment reminders
// (QUESTIONS Q-W6-02-1). This module owns the invite gate outright and
// lib/reminders/clients.ts is deliberately NOT modified, so the two switches
// share no state and reminder behaviour is unchanged.
//
// The ~12 lines of Resend call below are intentionally duplicated rather than
// hoisted into a shared helper: sharing the send primitive is what coupled the
// two flags in the first place, and the whole point of this loop is that
// flipping one switch can never move the other. Resend stays the single email
// vendor (no new vendor).
//
// No `server-only` here so the sender is unit-testable under vitest's node env,
// matching lib/reminders/clients.ts. The SDK is imported lazily inside the live
// branch, so the sandbox path never loads it and fires zero network calls.
//
// PII rule (#7): nothing here logs recipient addresses, subjects, or bodies.

import type { EmailMessage, SendResult } from "@/lib/reminders/clients";

/**
 * Invite live sends are off unless INVITES_LIVE_SEND is exactly "true". Any
 * other value (unset, "false", "1") keeps invites on the temp-password
 * hand-off. Read at call time, not module load, so env flips take effect
 * without re-import. Deliberately does NOT consult REMINDERS_LIVE_SEND.
 */
export function invitesLiveSendEnabled(): boolean {
  return process.env.INVITES_LIVE_SEND === "true";
}

/** Why an invite send was suppressed. Used only for the intent log. */
type DryRunReason = "live_send_disabled" | "missing_provider_config";

function logDryRun(reason: DryRunReason): void {
  console.info(`[invites] dry-run: email not sent (${reason})`);
}

function fromEmail(): string {
  // The verified osteojp.pt sender. Shared with reminders by design: it is the
  // Resend from-address, not a switch. Never hardcode a verified sender.
  return process.env.REMINDERS_EMAIL_FROM ?? "reminders@osteojp.pt";
}

/**
 * Send the staff-invite set-password email. Returns a sandbox result (no
 * network call) when the invite gate is off or the Resend key is absent, which
 * the caller maps to the temporary-password hand-off. Throws only on a real
 * live-send failure, which the caller also degrades to the temp-password path.
 */
export async function sendInviteEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!invitesLiveSendEnabled()) {
    logDryRun("live_send_disabled");
    return { channel: "email", sandbox: true, id: "sandbox:invite" };
  }
  if (!apiKey) {
    logDryRun("missing_provider_config");
    return { channel: "email", sandbox: true, id: "sandbox:invite" };
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
    throw new Error(`invites/email: Resend send failed (${error.name})`);
  }
  return { channel: "email", sandbox: false, id: data?.id ?? "unknown" };
}
