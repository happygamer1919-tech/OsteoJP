import { functions } from "./functions";
// INTAKE-01: the guest intake retention cron rides this already-synced endpoint
// (see lib/guest-intake/inngest/retention.ts for why it is not its own app).
import { purgeExpiredGuestIntakesDaily } from "@/lib/guest-intake/inngest/retention";

/**
 * R6: THE ONE LIST OF FUNCTIONS THE osteojp-reminders APP SERVES.
 *
 * `/api/inngest` hands exactly this array to `serve()`, and `/api/inngest/deployed`
 * reports its length, so the count a deploy says it serves and the functions it
 * registers on a sync cannot drift apart. The auto-sync workflow
 * (.github/workflows/inngest-auto-sync.yml) compares that length with the count
 * scripts/inngest-expected-functions.mjs reads from this file at the deployed
 * commit.
 */
export const servedFunctions = [...functions, purgeExpiredGuestIntakesDaily];
