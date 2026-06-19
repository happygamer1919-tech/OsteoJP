import { Inngest } from "inngest";
import type { ReminderOffsetId } from "../templates";

// Inngest client for Stream E reminders.
//
// Keys are read from env by the Inngest SDK itself (INNGEST_EVENT_KEY /
// INNGEST_SIGNING_KEY). In local dev the Inngest Dev Server needs neither. We
// never hardcode keys here.
//
// Event-data shapes. The Inngest v4 SDK does not register these on the client
// (it dropped the `schemas` option), so functions narrow `event.data` to these
// types explicitly. Both payloads carry ids + instants only — no PII.

export type AppointmentScheduledData = {
  appointmentId: string;
  tenantId: string;
  startsAt: string; // ISO-8601 UTC
};

export type ReminderDueData = {
  appointmentId: string;
  tenantId: string;
  offsetId: ReminderOffsetId;
  sendAt: string; // ISO-8601 UTC
};

/** Payload for status-change events (completed / no_show). endsAt is carried so
 *  the follow-up function can sleep until endsAt + 24 h without a DB read. */
export type AppointmentStatusChangedData = {
  appointmentId: string;
  tenantId: string;
  endsAt: string; // ISO-8601 UTC
};

export const EVENT_APPOINTMENT_SCHEDULED = "appointment/scheduled" as const;
export const EVENT_REMINDER_DUE = "appointment/reminder.due" as const;
export const EVENT_APPOINTMENT_COMPLETED = "appointment/completed" as const;
export const EVENT_APPOINTMENT_NOSHOW = "appointment/noshow" as const;

export const inngest = new Inngest({ id: "osteojp-reminders" });
