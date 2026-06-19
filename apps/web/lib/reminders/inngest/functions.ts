import {
  inngest,
  EVENT_APPOINTMENT_SCHEDULED,
  EVENT_REMINDER_DUE,
  EVENT_APPOINTMENT_COMPLETED,
  EVENT_APPOINTMENT_NOSHOW,
  type AppointmentScheduledData,
  type ReminderDueData,
  type AppointmentStatusChangedData,
} from "./client";
import { computeDueReminders, reminderIdempotencyKey } from "../offsets";
import { dispatchReminder, dispatchConfirmation, dispatchFollowUp, dispatchNoShow } from "../dispatch";

// Inngest functions for appointment reminders (SDK v4 API).
//
// Two-stage design:
//   1. scheduleAppointmentReminders — on appointment/scheduled, compute which
//      offsets are still in the future and fan out one appointment/reminder.due
//      event per offset (carrying its absolute send time).
//   2. sendAppointmentReminder — on appointment/reminder.due, sleep until the
//      send time, then dispatch. Idempotency is keyed on appointment id +
//      offset, so the same reminder fires exactly once even if the event is
//      delivered/enqueued multiple times. That key is why Stream E needs no
//      sent-log table (per the build constraints).
//
// The v4 SDK does not type `event.data` from the client, so each handler
// narrows it to the payload type declared in client.ts.

// --- Reschedule supersession --------------------------------------------------
//
// A reschedule re-emits appointment/scheduled for the SAME appointment id with a
// new startsAt. Two things must hold so the patient gets exactly the new-time
// reminder and not the old:
//
//   1. CANCEL the in-flight (sleeping) send run(s) for that appointment. The
//      durable wait lives in sendAppointmentReminder; cancelOn on the NEW
//      appointment/scheduled event tears those runs down. Matched on appointment
//      id AND tenant id — appointment ids are globally unique uuids, but the
//      tenant_id guard makes the cross-tenant impossibility explicit.
//   2. ALLOW the new run. The idempotency key includes the send instant, so a new
//      schedule (different sendAt) is a distinct run, while duplicate DELIVERY of
//      the same schedule (identical sendAt) still dedupes — exactly-once per
//      (appointment, offset, send instant). This is what keeps Stream E free of a
//      sent-log table while still surviving reschedules.
//
// cancelOn matches the sleeping run's own trigger (`event` = appointment/reminder.due)
// against the incoming cancel event (`async` = appointment/scheduled).
export const REMINDER_SUPERSEDE_CANCEL_ON = [
  {
    event: EVENT_APPOINTMENT_SCHEDULED,
    if: "event.data.appointmentId == async.data.appointmentId && event.data.tenantId == async.data.tenantId",
  },
];

export const REMINDER_IDEMPOTENCY_KEY =
  'event.data.appointmentId + ":" + event.data.offsetId + ":" + event.data.sendAt';

export const scheduleAppointmentReminders = inngest.createFunction(
  {
    id: "schedule-appointment-reminders",
    triggers: [{ event: EVENT_APPOINTMENT_SCHEDULED }],
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId, startsAt } =
      event.data as AppointmentScheduledData;
    const due = computeDueReminders(new Date(startsAt), new Date());

    if (due.length === 0) {
      return { scheduled: 0, appointmentId };
    }

    await step.sendEvent(
      "fan-out-reminders",
      due.map((d) => ({
        name: EVENT_REMINDER_DUE,
        data: {
          appointmentId,
          tenantId,
          offsetId: d.offsetId,
          sendAt: d.sendAt.toISOString(),
        } satisfies ReminderDueData,
      })),
    );

    return { scheduled: due.length, appointmentId };
  },
);

export const sendAppointmentReminder = inngest.createFunction(
  {
    id: "send-appointment-reminder",
    triggers: [{ event: EVENT_REMINDER_DUE }],
    // Reschedule supersession: a new appointment/scheduled for this appointment
    // cancels this sleeping run, so the old time never fires. See above.
    cancelOn: REMINDER_SUPERSEDE_CANCEL_ON,
    // Exactly-once per (appointment, offset, send instant). sendAt in the key lets
    // a reschedule (new instant) become a fresh run while duplicate delivery of
    // the same schedule still dedupes.
    idempotency: REMINDER_IDEMPOTENCY_KEY,
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId, offsetId, sendAt } =
      event.data as ReminderDueData;

    // Durable wait until the reminder is due. Survives restarts/redeploys.
    await step.sleepUntil("wait-until-due", new Date(sendAt));

    const outcome = await step.run("dispatch", () =>
      dispatchReminder(tenantId, appointmentId, offsetId),
    );

    return {
      key: reminderIdempotencyKey(appointmentId, offsetId),
      ...outcome,
    };
  },
);

/* ================================================================== */
/* Confirmation — fires immediately on appointment/scheduled            */
/* ================================================================== */

// Idempotency includes startsAt so a reschedule (new time → new event with
// different startsAt) sends a fresh confirmation while duplicate delivery of
// the same event still dedupes.
export const CONFIRMATION_IDEMPOTENCY_KEY =
  'event.data.appointmentId + ":confirmation:" + event.data.startsAt';

export const sendAppointmentConfirmation = inngest.createFunction(
  {
    id: "send-appointment-confirmation",
    triggers: [{ event: EVENT_APPOINTMENT_SCHEDULED }],
    idempotency: CONFIRMATION_IDEMPOTENCY_KEY,
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId } = event.data as AppointmentScheduledData;
    const outcome = await step.run("dispatch-confirmation", () =>
      dispatchConfirmation(tenantId, appointmentId),
    );
    return { appointmentId, ...outcome };
  },
);

/* ================================================================== */
/* Follow-up — sleeps 24 h after appointment ends, then fires          */
/* ================================================================== */

export const sendFollowUpNotification = inngest.createFunction(
  {
    id: "send-follow-up-notification",
    triggers: [{ event: EVENT_APPOINTMENT_COMPLETED }],
    idempotency: 'event.data.appointmentId + ":follow_up"',
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId, endsAt } =
      event.data as AppointmentStatusChangedData;
    const sendAt = new Date(new Date(endsAt).getTime() + 24 * 60 * 60_000);
    await step.sleepUntil("wait-24h-after-visit", sendAt);
    const outcome = await step.run("dispatch-follow-up", () =>
      dispatchFollowUp(tenantId, appointmentId),
    );
    return { appointmentId, ...outcome };
  },
);

/* ================================================================== */
/* No-show — fires immediately when appointment is marked no_show      */
/* ================================================================== */

export const sendNoShowNotification = inngest.createFunction(
  {
    id: "send-no-show-notification",
    triggers: [{ event: EVENT_APPOINTMENT_NOSHOW }],
    idempotency: 'event.data.appointmentId + ":no_show"',
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId } = event.data as AppointmentStatusChangedData;
    const outcome = await step.run("dispatch-no-show", () =>
      dispatchNoShow(tenantId, appointmentId),
    );
    return { appointmentId, ...outcome };
  },
);

export const functions = [
  scheduleAppointmentReminders,
  sendAppointmentReminder,
  sendAppointmentConfirmation,
  sendFollowUpNotification,
  sendNoShowNotification,
];
