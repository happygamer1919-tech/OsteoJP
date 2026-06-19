// @/lib/reminders — Stream E appointment reminders (build only; sandbox sends).
//
// Public surface:
//   - enqueueAppointmentReminders: fire the appointment/scheduled event so the
//     Inngest functions fan out + send. Call this from the scheduling layer
//     after an appointment is created or rescheduled.
//   - pure helpers re-exported for callers/tests.

import {
  inngest,
  EVENT_APPOINTMENT_SCHEDULED,
  EVENT_APPOINTMENT_COMPLETED,
  EVENT_APPOINTMENT_NOSHOW,
  type AppointmentScheduledData,
  type AppointmentStatusChangedData,
} from "./inngest/client";

export { REMINDER_OFFSETS, computeDueReminders, reminderIdempotencyKey } from "./offsets";
export {
  renderEmail,
  renderSms,
  renderConfirmationEmail,
  renderConfirmationSms,
  renderFollowUpEmail,
  renderFollowUpSms,
  renderNoShowEmail,
  renderNoShowSms,
  assertSmsCompliant,
} from "./templates";
export type {
  ReminderContext,
  ReminderOffsetId,
  NotificationKind,
  FollowUpContext,
  NoShowContext,
} from "./templates";
export { resolveLocale } from "./locale";

/**
 * Enqueue reminders for an appointment. Thin wrapper over inngest.send — the
 * computation of which offsets are still due happens inside the
 * scheduleAppointmentReminders function, keeping this call cheap and the policy
 * in one place.
 *
 * tenantId comes from the caller's tenant-scoped context. No reminder is sent
 * here; this only emits an event.
 */
export async function enqueueAppointmentReminders(args: {
  appointmentId: string;
  tenantId: string;
  startsAt: Date;
}): Promise<void> {
  await inngest.send({
    name: EVENT_APPOINTMENT_SCHEDULED,
    data: {
      appointmentId: args.appointmentId,
      tenantId: args.tenantId,
      startsAt: args.startsAt.toISOString(),
    } satisfies AppointmentScheduledData,
  });
}

/**
 * Emit the appointment/completed event so the follow-up notification can be
 * scheduled. endsAt is included in the payload so the Inngest function can sleep
 * until endsAt + 24 h without a DB read. Called after the DB transaction commits.
 */
export async function enqueueFollowUp(args: {
  appointmentId: string;
  tenantId: string;
  endsAt: Date;
}): Promise<void> {
  await inngest.send({
    name: EVENT_APPOINTMENT_COMPLETED,
    data: {
      appointmentId: args.appointmentId,
      tenantId: args.tenantId,
      endsAt: args.endsAt.toISOString(),
    } satisfies AppointmentStatusChangedData,
  });
}

/**
 * Emit the appointment/noshow event so the no-show notification fires. Called
 * after the DB transaction commits. No sleep: the notification goes out as soon
 * as the Inngest function picks up the event.
 */
export async function enqueueNoShow(args: {
  appointmentId: string;
  tenantId: string;
  endsAt: Date;
}): Promise<void> {
  await inngest.send({
    name: EVENT_APPOINTMENT_NOSHOW,
    data: {
      appointmentId: args.appointmentId,
      tenantId: args.tenantId,
      endsAt: args.endsAt.toISOString(),
    } satisfies AppointmentStatusChangedData,
  });
}
