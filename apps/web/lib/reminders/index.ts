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
import { followUpRunCanResult } from "./follow-up-start";

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
  /** Q-K: the appointment's Terapeuta after the save. No default: every event carries it. */
  practitionerId: string;
  /** Q-N: the save's own marker, made once per save by the caller
   *  (`enqueueRemindersAfterCommit`). Half of the confirmation's duplicate
   *  key, so no default: every event carries it. */
  saveId: string;
  /** No default: every caller must state which occurrence carries the
   *  confirmation, so a new call site cannot silently reintroduce the burst. */
  confirmationEligible: boolean;
  /** BOOK-CONFIRM: true only when this is the acceptance of an online request. */
  acceptedPedido?: boolean;
  /** BOOK-CONFIRM: true only for the occurrence a guest request was linked to. */
  acceptedGuestRequest?: boolean;
  /** Q-K: true only when the save changed the Terapeuta and kept the start and the clinic. */
  therapistChangeOnly?: boolean;
}): Promise<void> {
  await inngest.send({
    name: EVENT_APPOINTMENT_SCHEDULED,
    data: {
      appointmentId: args.appointmentId,
      tenantId: args.tenantId,
      startsAt: args.startsAt.toISOString(),
      practitionerId: args.practitionerId,
      saveId: args.saveId,
      confirmationEligible: args.confirmationEligible,
      // The key is ABSENT unless this is an acceptance, so every other event
      // keeps the exact payload it had before the marker existed.
      ...(args.acceptedPedido === true ? { acceptedPedido: true as const } : {}),
      ...(args.acceptedGuestRequest === true ? { acceptedGuestRequest: true as const } : {}),
      // Q-K: the same rule, for a save that changed the Terapeuta only.
      ...(args.therapistChangeOnly === true ? { therapistChangeOnly: true as const } : {}),
    } satisfies AppointmentScheduledData,
  });
}

/**
 * Emit the appointment/completed event so the follow-up notification can be
 * scheduled. endsAt is included in the payload so the Inngest function can sleep
 * until endsAt + 24 h without a DB read. Called after the DB transaction commits.
 *
 * R37: ONLY WHEN A MESSAGE CAN RESULT. This is the one sender of the event in
 * the application (the Estado save and "Corrigir estado" both reach it), so the
 * cut lives here and no caller can skip it. The switch is read now, at
 * completion (`followUpRunCanResult`, ./follow-up-start.ts): off with the
 * follow-up unapproved starts nothing, canary starts a listed patient's run
 * only, on starts every one. Returns whether the event was sent. The payload
 * is unchanged: the patient id decides here and never rides the event.
 */
export async function enqueueFollowUp(args: {
  appointmentId: string;
  tenantId: string;
  endsAt: Date;
  /** R37: the appointment's patient, for the canary list. null: not read, fails closed. */
  patientId: string | null;
  /** Q-O: true only for a "Corrigir estado" into Concluida: the survey alone. */
  surveyOnly?: boolean;
}): Promise<boolean> {
  if (!followUpRunCanResult({ patientId: args.patientId, surveyOnly: args.surveyOnly === true })) {
    return false;
  }
  await inngest.send({
    name: EVENT_APPOINTMENT_COMPLETED,
    data: {
      appointmentId: args.appointmentId,
      tenantId: args.tenantId,
      endsAt: args.endsAt.toISOString(),
      // ABSENT unless set, so the ordinary Estado path keeps its payload.
      ...(args.surveyOnly === true ? { surveyOnly: true as const } : {}),
    } satisfies AppointmentStatusChangedData,
  });
  return true;
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
