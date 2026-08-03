// Approval ledger for apps/api. One body, two channels, both unapproved.
//
// Patient activation (lib/auth/activation.ts) delivers a Supabase recovery link
// that sets the patient's first password. It is patient-facing copy JP has never
// seen, so it registers approved:false and the gate refuses it regardless of
// REMINDERS_LIVE_SEND.
//
// It is also currently DEAD CODE: `sendPatientActivation` has no caller (grep,
// and docs/handoff/WAVE-12-CLOSE-20260727.md:78). It is deliberately NOT in the
// JP approval packet — a dead template must not consume a clinical owner's
// review. See docs/notifications-work-notes.md: it grants a session by design,
// which conflicts with Decision D and the one-action-token ruling, and it is a
// candidate for outright deletion during the AUTH work. Not this lane's call.

import { buildRegistry, type TemplateEntry } from "@osteojp/notify";
import { getStrings, DEFAULT_LOCALE } from "@osteojp/i18n";

const ACTIVATION_BODY = getStrings(DEFAULT_LOCALE)["patientActivation.smsBody"];

function unapprovedActivation(id: string, channel: "email" | "sms"): TemplateEntry {
  return {
    id,
    channel,
    audience: "patient",
    triggerEvent: "patient/activation.requested",
    body: `${ACTIVATION_BODY}\n\n<set-password link>`,
    liveSendFlag: "REMINDERS_LIVE_SEND",
    approved: false,
    approvedBy: null,
    approvedAt: null,
  };
}

export const ACTIVATION_TEMPLATES: readonly TemplateEntry[] = [
  unapprovedActivation("patient.activation.sms", "sms"),
  unapprovedActivation("patient.activation.email", "email"),
] as const;

export const apiRegistry = buildRegistry(ACTIVATION_TEMPLATES);
