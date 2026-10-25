import { dispatchReminder, type DispatchOutcome } from "../dispatch";
import type { ReminderDueData } from "./client";

/**
 * SWEEP-47. WHAT A SLEEPING REMINDER JOB DOES WHILE THE SWEEP IS THE SENDER.
 *
 * ==========================================================================
 * THE JOBS ALREADY ASLEEP ARE THE BACKSTOP, NOT THE SENDER
 * ==========================================================================
 * Every appointment saved until now has a job asleep at the scheduler for each
 * of its reminders (send-appointment-reminder, ./functions.ts), and saves go on
 * creating them. Turning the sweep on does not remove one of them. So while
 * the send switch is on (../sweep-mode.ts) a job that wakes at its reminder's
 * time does not send at once:
 *
 *   1. IT WAITS 20 MINUTES MORE. The sweep passes every 15 minutes, so by then
 *      a working sweep has taken the reminder.
 *   2. THEN IT ASKS THE DISPATCHER, which takes the claim (closed,
 *      ../reminder-claim.ts). If the sweep sent the reminder, or holds it, the
 *      answer is `claim_held` and the job ends having sent nothing. If the
 *      sweep is not running, there is no claim, and the job sends: 20 minutes
 *      late, where without it the reminder would not go at all.
 *   3. IF THE VISIT WAS MOVED LATER the dispatcher answers `not_due` with the
 *      new time (a move in the patient portal emits no event, so nothing
 *      cancelled this job). The job sleeps to that time plus the same 20
 *      minutes and asks again, at most MOVED_MARK_WAITS times.
 *
 * So a claim the sweep took is how the owner can tell the two apart: while the
 * sweep works every claim says `sweep`, and a claim that says `run` is a
 * reminder the sweep missed.
 *
 * ==========================================================================
 * EVERY STEP HERE HAS A NAME OF ITS OWN, AND THAT IS THE ROLLBACK
 * ==========================================================================
 * The scheduler stores a finished step under its name and never runs it twice.
 * The job of today has one step that sends, named `dispatch`. NOTHING IN THIS
 * FILE USES THAT NAME. So a job that waited here, was told `not_due`, slept
 * again, and wakes after the switch was turned OFF (or after this file was
 * reverted) finds no stored `dispatch`: it runs today's step and sends. Had it
 * reused the name, it would be handed its stored `not_due` and end silent.
 * That the hosted scheduler ignores stored steps a run no longer asks for is
 * NOT ESTABLISHED here; backstop.test.ts holds this file's half of it.
 *
 * ==========================================================================
 * ITS OWN FILE, AND WHAT THAT COSTS
 * ==========================================================================
 * A frozen test (G1 in scripts/inc-1007-rearm-reminders-emit.test.mjs)
 * projects what one saved appointment costs at the scheduler. It counts the
 * `step.` calls of the reminder block in ./functions.ts up to the send
 * switch's branch, then the ones written here, the moved-mark loop counted
 * MOVED_MARK_WAITS times: 3 to 11 steps a reminder while the switch is on,
 * 26 executions an event at most (ruling Q-F, 2026-10-18). The re-arm
 * script's constant is 26 to match. Adding a step here moves that count, and
 * the frozen test says so.
 *
 * NO OPTION OF THE FUNCTION CHANGES. Its trigger, key, singleton and cancelOn
 * are what they were, so this needs no Resync.
 */

/** How long a job that woke at its reminder's time leaves the sweep to take it. */
export const SWEEP_HEAD_START_MS = 20 * 60_000;

/** How many times one job follows a visit that was moved later. */
export const MOVED_MARK_WAITS = 4;

/** The part of the scheduler's `step` this file uses. */
export type BackstopStep = {
  sleepUntil: (id: string, at: Date) => Promise<unknown>;
  run: (id: string, fn: () => Promise<DispatchOutcome>) => Promise<unknown>;
};

/**
 * The reminder job's steps AFTER it woke at its reminder's time, while the
 * sweep is the sender. Returns what the dispatcher last answered.
 *
 * The dispatcher is called as the job of today calls it: four arguments, the
 * taker left to its default (`run`), the clock its own.
 */
export async function dispatchAfterTheSweep(step: BackstopStep, data: ReminderDueData): Promise<DispatchOutcome> {
  const { appointmentId, tenantId, offsetId, channel, sendAt } = data;
  const ask = () => dispatchReminder(tenantId, appointmentId, offsetId, channel);

  await step.sleepUntil("wait-for-the-sweep", new Date(new Date(sendAt).getTime() + SWEEP_HEAD_START_MS));
  let outcome = (await step.run("dispatch-after-the-sweep", ask)) as DispatchOutcome;

  for (let n = 1; n <= MOVED_MARK_WAITS; n++) {
    if (outcome.dispatched || outcome.reason !== "not_due" || !outcome.dueAt) break;
    const due = new Date(outcome.dueAt);
    if (Number.isNaN(due.getTime())) break;
    await step.sleepUntil(`wait-for-the-moved-mark-${n}`, new Date(due.getTime() + SWEEP_HEAD_START_MS));
    outcome = (await step.run(`dispatch-after-the-moved-mark-${n}`, ask)) as DispatchOutcome;
  }
  return outcome;
}
