import { getDbAdmin } from "@osteojp/db";
import { inngest } from "@/lib/reminders/inngest/client";
import { runGuestIntakeRetention, type StepRunner } from "../retention";

/**
 * INTAKE-01 - the daily retention cron for guest clinical intakes.
 *
 * WHY IT RIDES THE REMINDERS APP AT /api/inngest rather than a sixth Inngest
 * app with its own client and route. A new app is only live once it is synced
 * to Inngest; an unsynced app's cron simply never fires, and nothing on this
 * side would notice. `/api/inngest` is the endpoint already registered and
 * running every day, so a function added to it is scheduled on the next deploy
 * with no dashboard step. The function id is its own, so its runs are separate
 * in the dashboard.
 *
 * 03:30 Lisbon, once a day. Seven days is the rule; a daily sweep means an
 * intake lives at most seven days and one tick. The hour is chosen to sit away
 * from the reminder traffic and from midnight, when the clock changes twice a
 * year.
 *
 * ONE RUN AT A TIME. Two overlapping ticks would both be correct (the function
 * locks the rows it deletes) but would audit nothing twice and report half the
 * count each, which is a confusing log for no gain.
 */
export const GUEST_INTAKE_RETENTION_CRON = "TZ=Europe/Lisbon 30 3 * * *";

export const purgeExpiredGuestIntakesDaily = inngest.createFunction(
  {
    id: "purge-expired-guest-intakes",
    triggers: [{ cron: GUEST_INTAKE_RETENTION_CRON }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    // `step.run` memoises its result as JSON. Every value that crosses it here
    // is a boolean, a string array or a number, so nothing changes shape.
    const runner: StepRunner = <T>(id: string, fn: () => Promise<T>) =>
      step.run(id, fn) as unknown as Promise<T>;
    return runGuestIntakeRetention(getDbAdmin(), { step: runner });
  },
);
