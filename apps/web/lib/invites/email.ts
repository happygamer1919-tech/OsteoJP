// Staff-invite email send — gated by INVITES_LIVE_SEND, independent of reminders.
//
// W7-01 decoupling: invites previously rode the reminder switch
// (REMINDERS_LIVE_SEND) via lib/reminders/clients.ts sendEmail, so the owner
// could not turn on invite email without also turning on appointment reminders
// (QUESTIONS Q-W6-02-1). This module owns the invite gate outright and
// lib/reminders/clients.ts is deliberately NOT modified, so the two switches
// share no state and reminder behaviour is unchanged.
//
// SUPERSEDED (2026-08-03): the Resend call is no longer duplicated here. The
// original note argued that sharing a send primitive is what coupled the two
// flags. That was true of a shared FLAG READ, not of shared code — the old
// helper hardcoded REMINDERS_LIVE_SEND. @osteojp/notify resolves the flag PER
// TEMPLATE, so this module now routes through the one choke point and the two
// switches still share no state. The flag-independence tests below prove it.
//
// No `server-only` here so the sender is unit-testable under vitest's node env,
// matching lib/reminders/clients.ts. The SDK is imported lazily inside the live
// branch, so the sandbox path never loads it and fires zero network calls.
//
// PII rule (#7): nothing here logs recipient addresses, subjects, or bodies.

import { sendEmail, type EmailMessage, type SendResult } from "@/lib/reminders/clients";
import { INVITE_TEMPLATE } from "@/lib/reminders/notification-registry";

/**
 * Invite live sends are off unless INVITES_LIVE_SEND is exactly "true". Any
 * other value (unset, "false", "1") keeps invites on the temp-password
 * hand-off. Read at call time, not module load, so env flips take effect
 * without re-import. Deliberately does NOT consult REMINDERS_LIVE_SEND.
 */
export function invitesLiveSendEnabled(): boolean {
  return process.env.INVITES_LIVE_SEND === "true";
}

// The from-address is resolved by the choke point (lib/reminders/clients.ts,
// requiredEmailFrom). The former `?? "reminders@osteojp.pt"` fallback is REMOVED:
// the verified Resend identity is on send.osteojp.pt, so the root-domain default
// was a guaranteed send-time rejection wearing a healthy-looking default.

/**
 * Send the staff-invite set-password email. Returns a sandbox result (no
 * network call) when the invite gate is off or the Resend key is absent, which
 * the caller maps to the temporary-password hand-off. Throws only on a real
 * live-send failure, which the caller also degrades to the temp-password path.
 */
export async function sendInviteEmail(msg: EmailMessage): Promise<SendResult> {
  const out = await sendEmail({ ...msg, templateId: INVITE_TEMPLATE.id });
  // Preserve the invite-specific sandbox marker the caller (lib/admin/staff.ts)
  // and its tests key on; the gate's generic marker is channel-shaped.
  return out.sandbox ? { ...out, id: "sandbox:invite" } : out;
}
