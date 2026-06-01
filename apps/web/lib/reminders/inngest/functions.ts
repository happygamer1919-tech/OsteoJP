import {
  inngest,
  EVENT_APPOINTMENT_SCHEDULED,
  EVENT_REMINDER_DUE,
  type AppointmentScheduledData,
  type ReminderDueData,
} from "./client";
import { computeDueReminders, reminderIdempotencyKey } from "../offsets";
import { dispatchReminder } from "../dispatch";

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
    // Exactly-once per (appointment, offset). See offsets.reminderIdempotencyKey.
    idempotency: 'event.data.appointmentId + ":" + event.data.offsetId',
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

export const functions = [scheduleAppointmentReminders, sendAppointmentReminder];
