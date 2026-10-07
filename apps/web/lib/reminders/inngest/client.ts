import { Inngest } from "inngest";
import type { ReminderOffsetId } from "../templates";
import type { Channel } from "@osteojp/notify";

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
  /**
   * True for exactly ONE occurrence per booking action. A recurring series is one
   * booking from the patient's point of view, so it earns one confirmation, not
   * one per session. Occurrences 2..n still emit this event (that is what keeps
   * reminder scheduling and reschedule supersession per-occurrence) but carry
   * false, and send-appointment-confirmation filters on it at the TRIGGER, so the
   * suppressed occurrences never start a run at all.
   */
  confirmationEligible: boolean;
  /**
   * BOOK-CONFIRM. Present, and `true`, ONLY when this event is reception (or
   * the patient's own SMS reply) ACCEPTING an online booking request. The four
   * acceptance emitters set it (lib/scheduling/pedido-acceptance.ts,
   * `acceptedPedidoTarget`); a create, a reschedule and an uncancel leave the
   * key out altogether, so their payload is the one it has always been.
   *
   * It is how the confirmation dispatch tells an acceptance from a reschedule
   * of a portal appointment: both arrive as `appointment/scheduled` for a
   * `confirmed`, portal-origin row, and nothing on the row distinguishes them.
   */
  acceptedPedido?: true;
  /**
   * BOOK-CONFIRM, the public-form path (S-1004-A, R40). Present, and `true`,
   * ONLY on the event for the appointment reception booked FOR a guest request
   * and that the booking action linked to it (`acceptedGuestRequestTarget`,
   * lib/scheduling/guest-link.ts). The appointment is a staff booking, so
   * without this the confirmation dispatch stops at its origin gate. With it
   * the dispatch READS the link row and only then sends: the marker is a
   * request to look, never the authority.
   */
  acceptedGuestRequest?: true;
};

export type ReminderDueData = {
  appointmentId: string;
  tenantId: string;
  offsetId: ReminderOffsetId;
  /** The single channel this reminder goes out on. Part of the idempotency key. */
  channel: Channel;
  sendAt: string; // ISO-8601 UTC
  /**
   * The id of the `appointment/scheduled` event this reminder was fanned out
   * from. Part of the idempotency key, so EVERY save that re-schedules gets a
   * run of its own (see REMINDER_IDEMPOTENCY_KEY in ./functions.ts). Optional
   * in the type only because runs created before this field existed are still
   * asleep in Inngest; every event emitted now carries it.
   */
  scheduledBy?: string;
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
