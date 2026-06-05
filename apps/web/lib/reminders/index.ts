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
  type AppointmentScheduledData,
} from "./inngest/client";

export { REMINDER_OFFSETS, computeDueReminders, reminderIdempotencyKey } from "./offsets";
export { renderEmail, renderSms, assertSmsCompliant } from "./templates";
export type { ReminderContext, ReminderOffsetId } from "./templates";
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
