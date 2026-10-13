import { getDbAdmin, listTenantIdsForRetention } from "@osteojp/db";
import { inngest } from "./client";
import { SWEEP_CRON, runReminderSweep, type SweepStep } from "../sweep";

/**
 * SWEEP-03: the reminder sweep's scheduled function. IN SHADOW: a pass writes
 * down what it would hand to the dispatcher and hands nothing over. What a
 * pass takes, and why it can send nothing, is in ../sweep.ts.
 *
 * ==========================================================================
 * NOT LIVE AT MERGE
 * ==========================================================================
 * The scheduler learns a function's trigger when the app is SYNCED, and this
 * app (`osteojp-reminders`) is synced by hand: Apps, osteojp-reminders, Resync.
 * Until then this cron is expected not to fire. That expectation is MEASURED
 * for a changed setting (CLAUDE.md, 2026-10-07) and NOT ESTABLISHED for a new
 * function: ../../guest-intake/inngest/retention.ts says a function added to
 * this endpoint is scheduled by the next deploy with no dashboard step. Either
 * way it is safe: a pass that does run writes rows of the sweep's own two
 * tables (reminder_claims, reminder_sweep_passes) and nothing else.
 *
 * ITS OWN FILE, registered through the list in ./functions.ts. A frozen test
 * reads that file's `createFunction` blocks and their triggers, and the served
 * route's list is pinned too, so the function is declared here and only named
 * there.
 *
 * ONE RUN AT A TIME, NO RETRIES. A pass that fails is not run again: the next
 * one is 15 minutes away and reads the database afresh. Two overlapping passes
 * would both be correct (each tenant's pass takes a lock and reads the other's
 * rows) and would only split one pass's counts over two heartbeats.
 *
 * LISTING THE TENANTS IS THE ONE READ ACROSS TENANTS, and it is the read the
 * retention cron already makes: ids only, on the owning connection, through
 * the one function packages/db has for it. Everything after it runs per
 * tenant, inside the reminder job's own tenant context (../context.ts), where
 * the owning connection is never used. Whether this cron may use that listing
 * is a question for strategy, reported with this change; the pass itself takes
 * the lister as an argument.
 */
export const sweepDueReminders = inngest.createFunction(
  {
    id: "sweep-due-reminders",
    triggers: [{ cron: SWEEP_CRON }],
    concurrency: { limit: 1 },
    retries: 0,
  },
  async ({ step, runId }) => {
    // `step.run` memoises its result as JSON. Every value that crosses it here
    // is a string array, a number or a boolean, so nothing changes shape.
    const runner: SweepStep = <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as unknown as Promise<T>;
    return runReminderSweep({
      step: runner,
      passId: runId,
      listTenantIds: () => listTenantIdsForRetention(getDbAdmin()),
    });
  },
);
