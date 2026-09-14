// COMMS-01 (owner dispatch 2026-09-14, BL-2): how one reminder_dispatches row
// reads on Lembretes SMS.
//
// Pure module: no DB, no `server-only`, no env. Every rule a receptionist reads
// off the page is a table test here rather than a claim in a component.

import { normalizePhonePT } from "@osteojp/notify";

import { s } from "@/lib/i18n";

import { FEE_NOTICE_TEMPLATE_ID } from "./fee-notice";
import { REMINDER_OFFSETS } from "./offsets";

/* ================================================================== */
/* Type of message, from template_id                                  */
/* ================================================================== */

/**
 * 0075 ruled that the notification KIND is derived from `template_id` and never
 * stored beside it, so this is the one place that derivation lives.
 *
 * `unknown` IS A REAL VALUE, not a fallback that pretends to know. A template id
 * this function has never seen renders with its raw id in the label, so a new
 * body added by copy work shows up on the page as unrecognised instead of being
 * filed under the nearest familiar kind (PORTAL-REHYDRATE 1.3).
 */
export type ReminderLogKind =
  | "reminder_24h"
  | "reminder_48h"
  | "reminder_fee"
  | "confirmation"
  | "follow_up"
  | "no_show"
  | "unknown";

export function kindOf(templateId: string): ReminderLogKind {
  // The fee id STARTS like a 24h reminder id, so it is matched first.
  if (templateId === FEE_NOTICE_TEMPLATE_ID) return "reminder_fee";
  const reminder = /^reminder\.(\d+h)\.(sms|email)$/.exec(templateId);
  if (reminder) {
    if (reminder[1] === "24h") return "reminder_24h";
    if (reminder[1] === "48h") return "reminder_48h";
    return "unknown";
  }
  if (/^confirmation\.(sms|email)$/.test(templateId)) return "confirmation";
  if (/^follow_up\.(sms|email)$/.test(templateId)) return "follow_up";
  if (/^no_show\.(sms|email)$/.test(templateId)) return "no_show";
  return "unknown";
}

export function kindLabel(kind: ReminderLogKind, templateId: string): string {
  switch (kind) {
    case "reminder_24h":
      return s["remindersLog.kindReminder24h"];
    case "reminder_48h":
      return s["remindersLog.kindReminder48h"];
    case "reminder_fee":
      return s["remindersLog.kindReminderFee"];
    case "confirmation":
      return s["remindersLog.kindConfirmation"];
    case "follow_up":
      return s["remindersLog.kindFollowUp"];
    case "no_show":
      return s["remindersLog.kindNoShow"];
    case "unknown":
      return s["remindersLog.kindUnknown"].replace("{id}", templateId);
  }
}

/* ================================================================== */
/* When it was due - DERIVED, never recorded                          */
/* ================================================================== */

/**
 * THE SCHEDULED TIME IS CALCULATED, AND THE COLUMN HEADER SAYS SO.
 *
 * Nothing in the database records the moment a reminder was scheduled: the
 * `appointment/scheduled` event lives only in Inngest, and `reminder_dispatches`
 * is written at send time (docs/QUESTIONS.md > Q-COMMS-01-1). So this re-applies
 * the rule each kind is scheduled by, to the appointment AS IT IS NOW:
 *
 *   reminder 24h / 48h   appointment start minus the offset (REMINDER_OFFSETS,
 *                        the same table `computeDueReminders` reads)
 *   follow-up            appointment end plus 24 h (sendFollowUpNotification)
 *   confirmation, no-show  sent at once on the event; there is no due time
 *
 * WHAT IT CANNOT KNOW: an appointment rescheduled after its reminder went out
 * shows the due time of the NEW start. A recorded schedule row is the only cure.
 */
export const FOLLOW_UP_DELAY_MS = 24 * 60 * 60_000;

export type ScheduledFor = { kind: "at"; at: Date } | { kind: "immediate" } | { kind: "unknown" };

function offsetMs(id: string): number | null {
  const o = REMINDER_OFFSETS.find((x) => x.id === id);
  return o ? o.minutesBefore * 60_000 : null;
}

export function scheduledFor(
  kind: ReminderLogKind,
  appointment: { startsAt: Date; endsAt: Date },
): ScheduledFor {
  const before = (id: string): ScheduledFor => {
    const ms = offsetMs(id);
    return ms === null ? { kind: "unknown" } : { kind: "at", at: new Date(appointment.startsAt.getTime() - ms) };
  };
  switch (kind) {
    case "reminder_24h":
    case "reminder_fee":
      return before("24h");
    case "reminder_48h":
      return before("48h");
    case "follow_up":
      return { kind: "at", at: new Date(appointment.endsAt.getTime() + FOLLOW_UP_DELAY_MS) };
    case "confirmation":
    case "no_show":
      return { kind: "immediate" };
    case "unknown":
      return { kind: "unknown" };
  }
}

/* ================================================================== */
/* Estado                                                              */
/* ================================================================== */

/** Provider statuses that mean the patient did not get the message. */
export const FAILED_PROVIDER_STATUSES = ["undelivered", "failed"] as const;

/**
 * Every suppression reason the dispatch path can write, with its sentence.
 *
 * `send_refused` is LEGACY: until COMMS-01 both the invalid-number and the
 * landline skip wrote it, so an old row genuinely cannot say which, and its
 * label says exactly that. New rows carry `invalid_phone` or `landline`.
 */
const REASON_LABEL: Readonly<Record<string, string>> = {
  invalid_phone: s["remindersLog.reason.invalid_phone"],
  landline: s["remindersLog.reason.landline"],
  send_refused: s["remindersLog.reason.send_refused"],
  sandbox: s["remindersLog.reason.sandbox"],
  channels_off: s["remindersLog.reason.channels_off"],
  lead_time_off: s["remindersLog.reason.lead_time_off"],
  channel_not_for_offset: s["remindersLog.reason.channel_not_for_offset"],
  no_contact: s["remindersLog.reason.no_contact"],
  status: s["remindersLog.reason.status"],
  unconfirmed: s["remindersLog.reason.unconfirmed"],
  origin: s["remindersLog.reason.origin"],
  body_refused: s["remindersLog.reason.body_refused"],
  patient_deleted: s["remindersLog.reason.patient_deleted"],
  not_found: s["remindersLog.reason.not_found"],
};

export const KNOWN_SUPPRESSION_REASONS: readonly string[] = Object.keys(REASON_LABEL);

/**
 * An unrecognised reason is shown WITH its code, labelled as unrecognised. Never
 * the raw code alone - that is the `?? e.kind` instance of 1.3, an English enum
 * on a pt-PT screen - and never the nearest known sentence.
 */
export function reasonLabel(code: string | null): string {
  if (code !== null && Object.prototype.hasOwnProperty.call(REASON_LABEL, code)) {
    return REASON_LABEL[code]!;
  }
  return s["remindersLog.reason.unknown"].replace("{code}", code ?? "—");
}

export type ReminderLogStatus = {
  key: "sent" | "delivered" | "undelivered" | "provider_error" | "suppressed" | "unknown";
  tone: "success" | "neutral" | "warning" | "error";
  label: string;
};

export function statusOf(row: {
  outcome: string;
  providerStatus: string | null;
  suppressionReason: string | null;
}): ReminderLogStatus {
  switch (row.outcome) {
    case "provider_error":
      return { key: "provider_error", tone: "error", label: s["remindersLog.statusProviderError"] };
    case "suppressed":
      return {
        key: "suppressed",
        tone: "warning",
        label: s["remindersLog.statusSuppressed"].replace("{reason}", reasonLabel(row.suppressionReason)),
      };
    case "sent":
      if (row.providerStatus === "delivered") {
        return { key: "delivered", tone: "success", label: s["remindersLog.statusDelivered"] };
      }
      if ((FAILED_PROVIDER_STATUSES as readonly string[]).includes(row.providerStatus ?? "")) {
        return { key: "undelivered", tone: "error", label: s["remindersLog.statusUndelivered"] };
      }
      // queued, sent, accepted, or no callback yet: handed over, fate unknown.
      return { key: "sent", tone: "neutral", label: s["remindersLog.statusSent"] };
    default:
      // 0075's CHECK admits three outcomes. A fourth is a schema change this
      // page has not been told about, and it says so rather than guessing.
      return {
        key: "unknown",
        tone: "warning",
        label: s["remindersLog.statusUnknown"].replace("{code}", row.outcome),
      };
  }
}

/** The "Só falhas" rule. The query applies the same predicate in SQL. */
export function isFailure(row: { outcome: string; providerStatus: string | null }): boolean {
  return (
    row.outcome === "provider_error" ||
    (FAILED_PROVIDER_STATUSES as readonly string[]).includes(row.providerStatus ?? "")
  );
}

/* ================================================================== */
/* Telephone                                                           */
/* ================================================================== */

/**
 * The patient's CURRENT number, normalised where the reminder path could
 * normalise it, as stored otherwise. It is NOT a record of the number the
 * message went to: 0075 stores no recipient, so a number edited after the send
 * shows the new value. The column header says "atual" for that reason.
 */
export function phoneForDisplay(raw: string | null): string {
  if (!raw || raw.trim() === "") return "—";
  return normalizePhonePT(raw) ?? raw;
}
