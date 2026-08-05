// The approval ledger for every body apps/web can send.
//
// Co-located with the copy it governs (templates.ts is this file's neighbour) so
// a body and its approval state are read together. Bodies are IMPORTED, never
// re-authored here: the registry cannot drift from what actually sends.
//
// Ten patient-facing reminder bodies, APPROVED BY JP 2026-08-03.
//
// Source: JP's written reply of 2026-08-03, a BLANKET approval of all ten bodies
// exactly as they appear in docs/notifications-approval-packet.md. Recorded here
// and in docs/notifications-work-notes.md. Not an inference from silence, not a
// verbal relay: a written blanket approval of the packet as shipped.
//
// STILL OPEN, and it does not block these ten: JP has not chosen between the
// SHIPPED 24h SMS body (approved here) and variant A from the packet. If he later
// picks variant A, that new body enters this registry `approved: false` and goes
// through the gate like any other copy change. Approving these ten does not
// pre-approve a replacement for one of them.
//
// Nothing sends regardless while REMINDERS_LIVE_SEND is not exactly "true".
// Approval removes ONE of the two gates; the kill switch is the other.
//
// Patient activation registers separately in apps/api and remains UNAPPROVED: it
// was deliberately excluded from JP's packet as dead code.
//
// RULING (owner, 2026-08-03), recorded here so it is not relitigated: the staff
// invite email is grandfathered approved. It is staff-facing, not patient-facing,
// it shipped and has been in production use since before this registry existed,
// and blocking it would break staff onboarding for no safety gain. `approvedBy`
// records that fact rather than naming a human who never signed anything.
//
// RULING (owner, 2026-08-03): each entry carries its OWN liveSendFlag. The prior
// design note in lib/invites/email.ts argued that sharing a send primitive is
// what coupled INVITES_LIVE_SEND to REMINDERS_LIVE_SEND. That was true of a
// shared FLAG READ, not of shared code. With the flag resolved per template, the
// two switches share a code path and no state, which lib/invites/email.test.ts
// proves unmodified.

import { buildRegistry, type TemplateEntry } from "@osteojp/notify";
import {
  EMAIL,
  SMS,
  CONFIRMATION_EMAIL,
  CONFIRMATION_SMS,
  FOLLOW_UP_EMAIL,
  FOLLOW_UP_SMS,
  NO_SHOW_EMAIL,
  NO_SHOW_SMS,
} from "./templates";

// Trigger events, mirrored from lib/reminders/inngest/client.ts. Duplicated as
// literals rather than imported so this module stays free of the Inngest client
// (which reads env at construction) and can be imported by tests and by the
// approval-packet generator.
const EV_SCHEDULED = "appointment/scheduled";
const EV_REMINDER_DUE = "appointment/reminder.due";
const EV_COMPLETED = "appointment/completed";
const EV_NOSHOW = "appointment/noshow";

/** JP's blanket approval of the packet, 2026-08-03. One date, one approver. */
const JP_APPROVAL = { approvedBy: "JP", approvedAt: "2026-08-03" } as const;

/**
 * The registered body is the pt-PT one — pt-PT is DEFAULT_LOCALE and the only
 * locale the clinic operates in. The EN mirror of each template is covered by the
 * same approval decision; approving PT approves its EN counterpart, which the
 * packet states explicitly and JP approved on that basis.
 */
function patientTemplate(
  id: string,
  channel: "email" | "sms",
  triggerEvent: string,
  body: string,
): TemplateEntry {
  return {
    id,
    channel,
    audience: "patient",
    triggerEvent,
    body,
    liveSendFlag: "REMINDERS_LIVE_SEND",
    approved: true,
    ...JP_APPROVAL,
  };
}

/**
 * WF-02 (2026-08-05): the 48h email body was amended, and it carries its OWN
 * approval date rather than moving the shared one.
 *
 * WHAT CHANGED AND WHY. The body read "Para remarcar ou cancelar"; the link it
 * offers is signed `confirm_cancel` (dispatch.ts) and the landing page renders a
 * confirm CTA, so confirming was built, tested and enforced server-side — and
 * never mentioned to the patient. WF-02 makes the 48h email the ONLY channel
 * that can deliver confirm before launch (the token does not fit one SMS segment
 * and no short-link scheme is being built pre-launch), so a channel that never
 * said so meant confirm effectively did not ship. JP approved amending this one
 * line, relayed by the owner on 2026-08-05.
 *
 * WHY A SEPARATE CONSTANT INSTEAD OF BUMPING JP_APPROVAL. That const is shared
 * by all ten bodies. Moving it to 2026-08-05 would re-date nine bodies JP
 * approved on 2026-08-03 and did not look at again, which would quietly destroy
 * the audit trail this field exists to keep. One body changed; one date moves.
 */
const JP_APPROVAL_48H_EMAIL = { approvedBy: "JP", approvedAt: "2026-08-05" } as const;

/** The ten patient-facing reminder bodies. Nine approved by JP 2026-08-03; the
 *  48h email re-approved 2026-08-05 for the WF-02 amendment above. */
export const REMINDER_TEMPLATES: readonly TemplateEntry[] = [
  {
    ...patientTemplate("reminder.48h.email", "email", EV_REMINDER_DUE, EMAIL["48h"].pt.body),
    ...JP_APPROVAL_48H_EMAIL,
  },
  patientTemplate("reminder.48h.sms", "sms", EV_REMINDER_DUE, SMS["48h"].pt),
  patientTemplate("reminder.24h.email", "email", EV_REMINDER_DUE, EMAIL["24h"].pt.body),
  patientTemplate("reminder.24h.sms", "sms", EV_REMINDER_DUE, SMS["24h"].pt),
  patientTemplate("confirmation.email", "email", EV_SCHEDULED, CONFIRMATION_EMAIL.pt.body),
  patientTemplate("confirmation.sms", "sms", EV_SCHEDULED, CONFIRMATION_SMS.pt),
  patientTemplate("follow_up.email", "email", EV_COMPLETED, FOLLOW_UP_EMAIL.pt.body),
  patientTemplate("follow_up.sms", "sms", EV_COMPLETED, FOLLOW_UP_SMS.pt),
  patientTemplate("no_show.email", "email", EV_NOSHOW, NO_SHOW_EMAIL.pt.body),
  patientTemplate("no_show.sms", "sms", EV_NOSHOW, NO_SHOW_SMS.pt),
] as const;

/**
 * Staff invite. Grandfathered per the ruling above. Its body is composed at the
 * call site from i18n keys (lib/admin/staff.ts), so the registered body records
 * the composition rather than a literal.
 */
export const INVITE_TEMPLATE: TemplateEntry = {
  id: "staff.invite.email",
  channel: "email",
  audience: "staff",
  triggerEvent: "admin/staff.invited",
  body: "i18n: admin.invite.email.intro + set-password link + admin.invite.email.outro",
  liveSendFlag: "INVITES_LIVE_SEND",
  approved: true,
  approvedBy: "pre-registry shipment (in production use before this registry existed)",
  approvedAt: "2026-08-03",
};

export const WEB_TEMPLATES: readonly TemplateEntry[] = [
  ...REMINDER_TEMPLATES,
  INVITE_TEMPLATE,
];

export const webRegistry = buildRegistry(WEB_TEMPLATES);
