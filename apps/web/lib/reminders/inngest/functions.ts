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
import { dispatchReminder, dispatchConfirmation, dispatchSurvey, dispatchNoShow } from "../dispatch";
// SWEEP-03: the reminder sweep, in shadow. Declared in ./sweep.ts, named here.
import { sweepDueReminders } from "./sweep";
// SWEEP-47: what a reminder job does while the sweep is the sender.
import { sweepSends } from "../sweep-mode";
import { dispatchAfterTheSweep, type BackstopStep } from "./backstop";

// Inngest functions for appointment reminders (SDK v4 API).
//
// Two-stage design:
//   1. scheduleAppointmentReminders — on appointment/scheduled, compute which
//      offsets are still in the future and fan out one appointment/reminder.due
//      event per offset (carrying its absolute send time).
//   2. sendAppointmentReminder — on appointment/reminder.due, sleep until the
//      send time, then dispatch. Idempotency (REMINDER_IDEMPOTENCY_KEY below)
//      makes the same reminder fire exactly once even if the event is
//      DELIVERED more than once. That key is why Stream E needs no sent-log
//      table (per the build constraints). A second SAVE of the appointment is
//      a different case; see "A save that does NOT change the time" below.
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
//
// --- A save that does NOT change the time (INC, 2026-10-07) -------------------
//
// Point 2 above assumed that an identical sendAt can only be a duplicate
// DELIVERY. It can also be a second SAVE. The edit panel routes a change of
// therapist, clinic or duration through rescheduleAppointment, which re-emits
// appointment/scheduled with the start it already had; bringing a visit back
// from Cancelada does the same. Point 1 then cancelled the sleeping run, the
// replacement carried the SAME idempotency key, and Inngest drops a repeated key
// for 24 hours. Net: no reminder, no ledger row, no error. The same happened to
// a visit moved away and moved back within a day (the first key was reused).
//
// Measured on the Inngest dev server (inngest-cli 1.46.0, SDK 4.5.0) with this
// file's settings, 22 appointments per pattern, the second save 0 to 6 s after
// the first:
//                      before                    now
//   saved once         22 sent                   22 sent
//   same start again   17 LOST, 5 sent           22 sent
//   moved later        17 sent, 5 sent TWICE     22 sent, at the new time
//   moved earlier      17 sent, 5 sent TWICE     22 sent, at the new time
//   moved and back     16 LOST, 4 TWICE, 2 sent  22 sent, at the last time
// (The doubles were the old AND the new time both going out: a cancel event that
// arrives within about a second of a run being created does not reach it.)
//
// Three settings, each closing one hole:
//   a. THE KEY CARRIES THE EMIT. `scheduledBy` is the id of the
//      appointment/scheduled event the reminder was fanned out from, so every
//      save gets a run of its own, and a duplicate delivery of ONE fan-out still
//      dedupes.
//   b. ONE LIVE RUN PER REMINDER, NEWEST WINS (`singleton`, mode cancel, keyed on
//      appointment + offset + channel). This is what makes (a) safe: when the
//      cancel event misses a run that was created a moment earlier, the newer
//      run starting cancels it. Without it, (a) turns the lost reminder into a
//      double one.
//   c. THE FAN-OUT WAITS 2 s PER APPOINTMENT (`debounce`). Two saves closer than
//      that collapse into the last one. "Newest wins" is decided by which RUN
//      starts last, and without the pause two saves a few milliseconds apart
//      could start their runs in the opposite order (measured: 3 of 42 kept the
//      older time).
// cancelOn stays: it is what removes a run created under the old settings, which
// carries no singleton key.
//
// TWO LIMITS, the first reasoned and the second measured:
//   - "Newest" means the run that STARTS last. A fan-out held back longer than
//     the gap between two saves (a retried step, a cold start) could start
//     after the later save's and win with the older time. Reasoned, not
//     reproduced: it did not occur with saves 2 s or more apart. Before these
//     settings the same race sent both.
//   - NEVER REPLAY a reminder.due event from before this deploy in the Inngest
//     dashboard. Its run, if still asleep, was created under the old key and
//     holds no singleton key, so the replay would start a second run beside it
//     and the patient would get the reminder twice (measured: 4 of 4).
export const REMINDER_SUPERSEDE_CANCEL_ON = [
  {
    event: EVENT_APPOINTMENT_SCHEDULED,
    if: "event.data.appointmentId == async.data.appointmentId && event.data.tenantId == async.data.tenantId",
  },
];

// CHANNEL IS PART OF THIS KEY. Without it, two channels at the same offset and
// send instant collapse into one Inngest run and the second is silently dropped —
// no error, no log, no run. See reminderIdempotencyKey in ../offsets.ts.
//
// `scheduledBy` IS PART OF THIS KEY (setting a above): one run per reminder PER
// SAVE. A run created before the field existed has none, and Inngest evaluated
// its key when it was created; the dev server starts an event without the field
// normally (measured), which covers an event in flight across the deploy.
export const REMINDER_IDEMPOTENCY_KEY =
  'event.data.appointmentId + ":" + event.data.offsetId + ":" + event.data.channel + ":" + event.data.sendAt + ":" + event.data.scheduledBy';

/** Setting b: one live run per reminder, and a newer one cancels the older. */
export const REMINDER_SINGLETON = {
  key: 'event.data.appointmentId + ":" + event.data.offsetId + ":" + event.data.channel',
  mode: "cancel",
} as const;

/** Setting c: the fan-out of one appointment waits this long for a later save. */
export const REMINDER_SCHEDULE_DEBOUNCE = {
  key: "event.data.appointmentId",
  period: "2s",
} as const;

/**
 * What a reminder says it was scheduled by: the id of the appointment/scheduled
 * event. Inngest gives every received event an id, so two saves never share
 * one. The timestamp is the fallback and keeps the value from ever being
 * empty; two events with neither would share "ts:0", which degrades to the old
 * behaviour (a dropped duplicate), never to a second reminder.
 *
 * Exported for direct testing.
 */
export function reminderScheduledBy(event: { id?: string; ts?: number }): string {
  if (typeof event.id === "string" && event.id.length > 0) return event.id;
  return `ts:${event.ts ?? 0}`;
}

export const scheduleAppointmentReminders = inngest.createFunction(
  {
    id: "schedule-appointment-reminders",
    triggers: [{ event: EVENT_APPOINTMENT_SCHEDULED }],
    // Setting c: two saves of one appointment within 2 s fan out once, from the
    // last. See "A save that does NOT change the time" above.
    debounce: REMINDER_SCHEDULE_DEBOUNCE,
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
          channel: d.channel,
          sendAt: d.sendAt.toISOString(),
          scheduledBy: reminderScheduledBy(event),
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
    // One run per (appointment, offset, channel, send instant, SAVE). sendAt and
    // scheduledBy in the key let every re-schedule become a fresh run while a
    // duplicate delivery of the same fan-out still dedupes.
    idempotency: REMINDER_IDEMPOTENCY_KEY,
    // And only the newest of those runs stays alive.
    singleton: REMINDER_SINGLETON,
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId, offsetId, channel, sendAt } =
      event.data as ReminderDueData;

    // Durable wait until the reminder is due. Survives restarts/redeploys.
    await step.sleepUntil("wait-until-due", new Date(sendAt));

    // SWEEP-47. While the sweep is the sender (REMINDERS_SWEEP_MODE is exactly
    // "send") this job is the backstop: it waits for the sweep, then asks. See
    // ./backstop.ts, where those steps are written and why they are not here.
    // With the switch off this block is skipped and the rest is the job of
    // today, word for word.
    if (sweepSends()) {
      const afterTheSweep = await dispatchAfterTheSweep(step as unknown as BackstopStep, event.data as ReminderDueData);
      return {
        key: reminderIdempotencyKey(appointmentId, offsetId, channel),
        ...afterTheSweep,
      };
    }

    const outcome = await step.run("dispatch", () =>
      dispatchReminder(tenantId, appointmentId, offsetId, channel),
    );

    return {
      key: reminderIdempotencyKey(appointmentId, offsetId, channel),
      ...outcome,
    };
  },
);

/* ================================================================== */
/* Confirmation — fires immediately on appointment/scheduled            */
/* ================================================================== */

// Q-N (strategy's ruling of 2026-10-22): THE KEY IS THE APPOINTMENT AND THE
// SAVE. `saveId` is an opaque random id made once per save, on the server,
// by enqueueRemindersAfterCommit (lib/scheduling/reminders.ts), and carried
// by every event that save emits. So:
//   - a second DELIVERY of one event (Inngest's at-least-once delivery, or a
//     retried send of the same payload) repeats the key and is dropped;
//   - a second SAVE has a key of its own and runs, whatever start and
//     therapist it carries. A change BACK to an earlier start or therapist
//     inside 24 hours (Terapeuta A to B and back to A, or 10:00 to 15:00 and
//     back to 10:00) now sends its confirmation, so the patient's last
//     message names the booking they hold.
// Before Q-N the key was appointment + start + therapist (Q-K), and before
// that appointment + start. Both dropped that return as a duplicate.
//
// THE KEY IS NOT WHAT STOPS AN IDENTICAL RE-SAVE, and never was: Inngest
// forgets a key after 24 hours. The save decides.
// lib/scheduling/move-confirmation.ts makes a save that kept the start, the
// clinic AND the therapist carry no confirmation, so its event is not
// confirmation-eligible and starts no run here.
//
// AN EVENT WITHOUT `saveId`. Every appointment/scheduled event the
// APPLICATION sends carries one: lib/reminders/index.ts requires it. The
// events of the owner-run scripts packages/db/scripts/
// inc-1007-rearm-reminders-emit.mjs and obs-05-backfill-emit.mjs do not, and
// they send `confirmationEligible: false`, so the trigger's `if` filter below
// stops them and they never start a confirmation run. IF such an event did
// reach this key, every marker-less event of one appointment would share one
// key (the appointment and an absent field) for 24 hours. That could drop a
// second marker-less event, never an application one: an application key
// ends in a fresh uuid, which no absent field reads as. NOT VERIFIED: what
// Inngest itself makes of the absent field (an empty string, "null", or a
// failed evaluation); the SDK documents no default-value syntax for this
// expression (inngest 4.5.0, components/InngestFunction.d.ts), so none is
// used. A future script that sends a confirmation-eligible event must send a
// fresh `saveId` per save.
//
// THIS IS A SETTING, NOT CODE: it is live only after the owner presses Resync
// on the Inngest app (Apps, osteojp-reminders, Resync). Until then Inngest
// keeps the key it stored at the last sync, and a change back to an earlier
// start or therapist inside 24 hours is still dropped.
export const CONFIRMATION_IDEMPOTENCY_KEY =
  'event.data.appointmentId + ":confirmation:" + event.data.saveId';

/**
 * Series burst guard. A 10-session recurring booking emits 10
 * appointment/scheduled events (one per occurrence, which is what keeps reminder
 * scheduling and reschedule supersession per-occurrence), but the patient made
 * ONE booking and gets ONE confirmation.
 *
 * The filter is on the TRIGGER, not inside the handler, so the nine suppressed
 * occurrences never start a run at all — no wasted invocations, and the run
 * history reads as one confirmation rather than one success plus nine no-ops.
 *
 * Which occurrence is eligible is decided upstream in
 * lib/scheduling/reminders.ts (earliest start instant wins).
 */
export const CONFIRMATION_TRIGGER_FILTER = "event.data.confirmationEligible == true";

export const sendAppointmentConfirmation = inngest.createFunction(
  {
    id: "send-appointment-confirmation",
    triggers: [{ event: EVENT_APPOINTMENT_SCHEDULED, if: CONFIRMATION_TRIGGER_FILTER }],
    idempotency: CONFIRMATION_IDEMPOTENCY_KEY,
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId, acceptedPedido, acceptedGuestRequest, therapistChangeOnly } =
      event.data as AppointmentScheduledData;
    const outcome = await step.run("dispatch-confirmation", () =>
      // BOOK-CONFIRM: the acceptance marker travels from the event to the
      // dispatch. `=== true`, so a payload without the key (every reschedule,
      // create and uncancel) reads as false and keeps today's confirmation.
      dispatchConfirmation(tenantId, appointmentId, {
        acceptedPedido: acceptedPedido === true,
        acceptedGuestRequest: acceptedGuestRequest === true,
        // Q-K: the same rule for the therapist-only marker, which narrows the
        // channels and never widens them.
        therapistChangeOnly: therapistChangeOnly === true,
      }),
    );
    return { appointmentId, ...outcome };
  },
);

/* ================================================================== */
/* Follow-up — sleeps 24 h after appointment ends, then fires          */
/* ================================================================== */

// SAT-01. The step now calls `dispatchSurvey`, which reads the survey's switch
// first: off (the default) it is `dispatchFollowUp`, exactly as before; canary
// or on, the satisfaction survey goes instead (../dispatch.ts).
//
// NOTHING INNGEST STORES CHANGED: the id, the trigger, the idempotency key and
// the two step names are the ones the function has always had, so no Resync is
// owed, and a run that went to sleep before this code wakes into it. Asserted
// in ./functions.test.ts.
//
// Q-O. A "Corrigir estado" into Concluida emits this same event with
// `surveyOnly: true` (strategy's ruling of 2026-10-22), so the same 24 hour
// wait applies to it, and the same issue door applies the 60-day rule. The
// flag makes the dispatch send the survey or nothing: never the follow-up.
// Still no option changed, so still no Resync.

export const sendFollowUpNotification = inngest.createFunction(
  {
    id: "send-follow-up-notification",
    triggers: [{ event: EVENT_APPOINTMENT_COMPLETED }],
    idempotency: 'event.data.appointmentId + ":follow_up"',
  },
  async ({ event, step }) => {
    const { appointmentId, tenantId, endsAt, surveyOnly } =
      event.data as AppointmentStatusChangedData;
    const sendAt = new Date(new Date(endsAt).getTime() + 24 * 60 * 60_000);
    await step.sleepUntil("wait-24h-after-visit", sendAt);
    const outcome = await step.run("dispatch-follow-up", () =>
      // Q-O: `=== true`, so every event without the flag (the ordinary Estado
      // path, and every run asleep from before it) reads as false.
      dispatchSurvey(tenantId, appointmentId, { surveyOnly: surveyOnly === true }),
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
  sweepDueReminders,
];
