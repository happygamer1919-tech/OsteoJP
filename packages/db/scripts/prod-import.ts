/**
 * THE PRODUCTION ENTRYPOINT. The same import flow, gated by the confirmation
 * phrase instead of by the not-production blocklist.
 *
 * ==========================================================================
 * THIS FILE IS A GATE AND NOTHING ELSE
 * ==========================================================================
 * Every step of the run lives in ./import-core.ts and is shared verbatim with
 * ./rehearsal-import.ts. The dispatch that asked for this file said "identical
 * flow, no other behavioural difference"; sharing the core is the only way to
 * make that true tomorrow as well as today. A copy would let a fix land on the
 * rehearsal path and not on this one, and this is the path that runs once.
 *
 * ==========================================================================
 * THE GATE IS THE PHRASE, AND IT IS READ FROM STDIN. NOT --confirm. NOT ENV.
 * ==========================================================================
 * CLAUDE.md, "Import execution rules": the phrase is
 * `IMPORT FISIOZERO INTO PRODUCTION`, "typed by Ivan once per window".
 *
 * TYPED is the operative word, and it rules out both alternatives:
 *   - `--confirm "<phrase>"` lands in shell history, in the terminal
 *     scrollback, and in `ps` output for the life of the process. Once it is in
 *     history, the next run is an up-arrow, which is precisely the deliberation
 *     the phrase exists to force.
 *   - an env var lands in the env FILE, survives every later shell that sources
 *     it, and is inherited by every child process of this one.
 * Stdin leaves the phrase nowhere. It is read once, compared, and dropped.
 *
 * IT IS NOT ECHOED BACK. Printing it would put it in the scrollback the two
 * bullets above exist to keep it out of, and it would land in the transcript
 * Ivan pastes back.
 *
 * ==========================================================================
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ==========================================================================
 * IT DOES NOT CHECK THAT THE TARGET *IS* PRODUCTION, and that is not an
 * oversight. A guard asserting "this must be prod" would refuse a legitimate
 * dry run against a scratch project and would be one more thing to disable in a
 * hurry. The blocklist protects prod FROM the rehearsal; nothing needs to
 * protect the rehearsal from prod.
 *
 * IT DOES NOT MAKE `--apply` SAFE. The phrase authorises the TARGET. The write
 * itself is still gated inside run-import.mjs, which compares the same phrase
 * against its own CONFIRM_PHRASE and refuses `--apply` without it. Two gates,
 * one phrase, typed once.
 *
 * IVAN RUNS THIS. NO TERMINAL EVER DOES - standing rules 1 and 2 forbid a
 * terminal pointing anything at the production project, and this file exists
 * precisely to reach it.
 *
 * Usage:
 *   pnpm --filter @osteojp/db exec tsx scripts/prod-import.ts \
 *     --delivery <dir> --config <mapping-config.local.json> [--apply]
 *   ... then type the phrase when prompted on stderr.
 *
 * Env (NAMES only): DATABASE_URL
 * Exit: 0 OK · 1 FAILED or refused · 2 BAD_INVOCATION
 */

import { createInterface } from "node:readline";

import { arg, loadRunner, runEntrypoint } from "./import-core";
import { parseProjectRef } from "../seed/seed-guard";

/**
 * The production batch id. FIXED, for the same reason the rehearsal's is: the
 * reconciliation report and the idempotency re-run are both scoped by batch id,
 * so a fresh id per run would give a second `--apply` an empty batch to
 * reconcile - which reports zero of everything and is indistinguishable from
 * the clean no-op that proves the run is repeatable.
 *
 * IT IS THE SAME ID FOR BOTH CLINICS, DELIBERATELY. Linda-a-Velha and Castelo
 * Branco arrive as two separate deliveries and are imported as two runs, but
 * they are ONE migration and they share ONE staging ledger. A per-clinic batch
 * would split the reconciliation in two and hide a cross-clinic total nobody
 * would then compute. Idempotency is unaffected: the ledger's unique key is
 * (tenant, source_system, entity_type, source_id) and the batch id is not in it.
 */
export const PROD_BATCH_ID = "9f0d1a20-0000-4000-8000-000000000001";

/** CLAUDE.md, "Import execution rules", ratified 2026-08-24. */
export const PROD_CONFIRM_PHRASE = "IMPORT FISIOZERO INTO PRODUCTION";

/**
 * Read one line from stdin without echoing it into the scrollback.
 *
 * THE PROMPT GOES TO STDERR so that stdout stays a clean, pasteable transcript.
 * The phrase itself is never printed by this process on any path.
 */
export async function readPhraseFromStdin(
  input: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
  process.stderr.write(
    `\nType the confirmation phrase to authorise this target, then press Enter.\n` +
      `(CLAUDE.md, Import execution rules. It is not echoed and it is not stored.)\n> `,
  );
  const rl = createInterface({ input });
  try {
    for await (const line of rl) return line.trim();
    return "";
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runEntrypoint({
    label: "PRODUCTION",
    defaultBatchId: PROD_BATCH_ID,

    /* THE GATE: the phrase, typed. Not the blocklist. */
    async check({ databaseUrl, exit }) {
      // The ref is PRINTED, not judged. An operator about to write a decade of
      // clinical history should see which project they are pointed at, and a
      // ref is a public identifier that appears in CLAUDE.md - unlike the
      // connection string it came from, which carries a password.
      const ref = parseProjectRef(databaseUrl);
      if (!ref) {
        console.error("SAFETY: could not parse a Supabase project ref from DATABASE_URL.");
        process.exit(exit.FAILED);
      }
      console.log(`target project ref: ${ref}`);
      console.log("THIS ENTRYPOINT HAS NO BLOCKLIST. The phrase below is the only gate.");

      const typed = await readPhraseFromStdin();
      if (typed !== PROD_CONFIRM_PHRASE) {
        // The expected phrase is NOT printed on failure. Printing it turns a
        // refusal into a copy-paste prompt, which is the opposite of a gate.
        console.error("REFUSED - the confirmation phrase did not match.");
        console.error("Nothing was read, nothing was staged, no database was contacted.");
        process.exit(exit.FAILED);
      }
      console.log("phrase accepted.");

      // `--confirm` on the command line is REJECTED rather than ignored, so an
      // operator who reaches for the rehearsal's habit is told, instead of
      // silently running with a phrase this entrypoint never read.
      if (arg("--confirm") !== null) {
        console.error("REFUSED - --confirm is not accepted here; the phrase is typed on stdin.");
        process.exit(exit.BAD_INVOCATION);
      }
    },

    /* The same phrase satisfies run-import.mjs's own --apply gate. Typed once. */
    async confirm() {
      const runner = await loadRunner();
      return runner.CONFIRM_PHRASE;
    },
  }).catch((e: unknown) => {
    console.error(`FATAL: ${(e as Error).name}`);
    process.exit(1);
  });
}
