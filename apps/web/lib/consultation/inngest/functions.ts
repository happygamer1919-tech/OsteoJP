import { inngest } from "./client";
import { attemptFire, recordOutcome } from "../fire-attempt";
import { listDueCandidates, listOverCeiling, SCAN_LIMIT } from "../consultation-store";
import { isDue } from "../retry-policy";

// The retry scanner. Wakes on a cron, reads pending consultations, re-fires the
// ones whose backoff has elapsed.
//
// WHY A CRON SCAN AND NOT AN EVENT. The failure this recovers from is "the fire
// did not land". Announcing that with an event and retrying on the event puts
// the recovery behind the same class of delivery this is recovering from — and
// worse, an event lost during a redeploy would leave a row pending with nothing
// scheduled to look at it ever again. The row IS the queue. A scan finds work
// that was written before the process that wrote it died.
//
// EVERY WRITE IS KEYED BY ROW ID and every consultation is handled
// independently, so one bad row cannot stop the batch.

/**
 * When the scanner wakes: every 2 hours from 08:00 to 20:00 Lisbon, 7 wakes a
 * day (08, 10, 12, 14, 16, 18, 20), the same form as the reminder sweep's cron.
 *
 * R27 (strategy, on SOLO's R12 proposal). It was every 5 minutes, about 8,640
 * wakes and 25,900 executions a month at 3 executions a wake (the run plus its
 * two read steps), which kept the app unsynced. At 7 wakes a day it is about 210
 * wakes and 630 executions a month, plus one step per real retry.
 *
 * WHAT IT COSTS IN SPEED: a backoff now ends at the next wake, so a failed send
 * is retried up to 2 hours after its backoff (up to 12 hours overnight, 13 on
 * the night the clocks go back) instead of within 5 minutes. The 7-day audio
 * bound still holds with that rounding: inngest/schedule.test.ts walks the
 * worst case over a whole year of wakes.
 */
export const RETRY_CRON = "TZ=Europe/Lisbon 0 8-20/2 * * *";

export const retryPendingConsultationFires = inngest.createFunction(
  {
    id: "retry-pending-consultation-fires",
    triggers: [{ cron: RETRY_CRON }],
    // One scan at a time. Two overlapping ticks would both read the same pending
    // row (nothing is claimed at read time) and fire it twice. The partner would
    // answer the second with a 409 and no duplicate record would be created —
    // the idempotency key holds — but it would burn two attempts against the
    // ceiling for one delivery and put a spurious 409 in their logs.
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const now = new Date();

    // Sweep first: rows that are over the ceiling but still pending. They exist
    // only if a needs_attention write was lost mid-tick, and while they sit
    // there they are invisible in BOTH directions — never retried (over the
    // ceiling) and never surfaced (not needs_attention).
    const stranded = await step.run("sweep-over-ceiling", async () => {
      const rows = await listOverCeiling();
      for (const row of rows) {
        await recordOutcome(row, { verdict: "retry", attempt: row.attemptCount, error: "ceiling" }, now);
      }
      return rows.length;
    });

    const candidates = await step.run("read-pending", () => listDueCandidates());

    // NO SILENT CAP. If the scan filled its window there is more work than one
    // tick can see, and that is a fact worth a line rather than a number that
    // quietly means "some".
    if (candidates.length === SCAN_LIMIT) {
      console.warn(
        `[consultation] retry scan hit SCAN_LIMIT=${SCAN_LIMIT}; more pending rows exist than this tick read`,
      );
    }

    // THE STEP BOUNDARY IS A JSON BOUNDARY. `step.run` memoises its return
    // value as JSON, so anything that was a Date in the driver is an ISO string
    // here. listDueCandidates already hands back that shape deliberately; the
    // policy works in Dates, so the conversion happens once, in the open.
    const due = candidates.filter((row) =>
      isDue(
        {
          attemptCount: row.attemptCount,
          lastAttemptAt: row.lastAttemptAt === null ? null : new Date(row.lastAttemptAt),
        },
        now,
      ),
    );
    if (due.length === 0) {
      return { scanned: candidates.length, due: 0, delivered: 0, stillPending: 0, stranded };
    }

    let delivered = 0;
    let stillPending = 0;

    for (const row of due) {
      // One step per consultation: a throw isolates to that row and Inngest
      // retries that step alone, rather than replaying the whole batch and
      // re-firing consultations that already succeeded in this tick.
      const verdict = await step.run(`fire-${row.id}`, async () => {
        // attemptCount is the number of attempts ALREADY made, so this one is
        // the next. The same number goes into the payload as `attempt` and into
        // the row, so the two can never disagree.
        const outcome = await attemptFire(row, row.attemptCount + 1);
        await recordOutcome(row, outcome, now);
        return outcome.verdict;
      });
      if (verdict === "delivered") delivered += 1;
      else stillPending += 1;
    }

    return { scanned: candidates.length, due: due.length, delivered, stillPending, stranded };
  },
);

export const functions = [retryPendingConsultationFires];
