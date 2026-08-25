/**
 * THE REHEARSAL ENTRYPOINT. The import flow, gated to a NON-PRODUCTION target.
 *
 * ==========================================================================
 * THIS FILE IS A GATE AND NOTHING ELSE
 * ==========================================================================
 * Every step of the run - reading the delivery, the adapter, the resolvers, the
 * transaction, the exit code - lives in ./import-core.ts and is shared verbatim
 * with ./prod-import.ts. The two entrypoints differ in EXACTLY ONE THING, which
 * is the block below.
 *
 * That is deliberate. A copied flow would let a fix land on one path and not the
 * other, and the one that would be discovered late is production, on the single
 * night the clinic cannot repeat the extraction.
 *
 * IVAN RUNS THIS. NO TERMINAL DOES. CLAUDE.md, "Patient data isolation";
 * standing rules 1 and 2.
 *
 * Usage:
 *   pnpm --filter @osteojp/db exec tsx scripts/rehearsal-import.ts \
 *     --delivery <dir> --config <mapping-config.local.json> [MODE]
 *
 * Exit: 0 OK · 1 FAILED or refused · 2 BAD_INVOCATION
 */

import { arg, runEntrypoint } from "./import-core";
import { PROD_REFS, parseProjectRef } from "../seed/seed-guard";

export {
  attachmentMapping,
  buildResolvers,
  isUuid,
  livePipeline,
  locationResolution,
  readCheckpoint,
  readDelivery,
} from "./import-core";

/**
 * The rehearsal batch id. A CONSTANT, and both halves of that matter.
 *
 * IT IS A UUID BECAUSE THE COLUMN IS. `migration_staging_rows.batch_id` is
 * `uuid NOT NULL`, not free text; a readable label is rejected at INSERT.
 *
 * IT IS FIXED BECAUSE THE IDEMPOTENCY PROOF DEPENDS ON IT. Reconciliation is
 * scoped by batch id, so a fresh id per run would give the second `--apply` an
 * EMPTY batch to reconcile - which reports zero of everything and looks exactly
 * like the clean no-op the rehearsal is trying to prove.
 */
export const REHEARSAL_BATCH_ID = "1e4ea5a1-0000-4000-8000-000000000001";

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runEntrypoint({
    label: "rehearsal",
    defaultBatchId: REHEARSAL_BATCH_ID,

    /* THE GATE: refuse production, from the ONE blocklist. */
    check({ databaseUrl, exit }) {
      const ref = parseProjectRef(databaseUrl);
      if (!ref) {
        console.error("SAFETY: could not parse a Supabase project ref from DATABASE_URL.");
        process.exit(exit.FAILED);
      }
      if (PROD_REFS.includes(ref)) {
        console.error(`SAFETY: refusing to run against blocklisted project ref (${ref}).`);
        process.exit(exit.FAILED);
      }
      console.log(`target project ref: ${ref}   (not on the ${PROD_REFS.length}-entry blocklist)`);
    },

    /* The phrase comes from the command line here. Production does NOT do this
     * - see prod-import.ts for why stdin is the only acceptable source there. */
    confirm() {
      return arg("--confirm");
    },
  }).catch((e: unknown) => {
    console.error(`FATAL: ${(e as Error).name}`);
    process.exit(1);
  });
}
