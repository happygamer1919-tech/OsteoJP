/**
 * Shared env preload for the seed:dev chain.
 *
 * `tsx` (unlike `drizzle-kit`, which loads the cwd `.env` itself) does NOT
 * auto-load `packages/db/.env`, so a seed run historically required the operator
 * to manually source it. `loadSeedEnv()` closes that gap: it preloads
 * `packages/db/.env` with Node's built-in loader (the migrate-equivalent, no new
 * dependency), so a live run needs only `SEED_DEV_CONFIRM` exported from the shell.
 *
 * GUARD SEMANTICS (must not weaken — see seed-guard.ts):
 *   `SEED_DEV_CONFIRM` must stay a DELIBERATE shell opt-in and must never become
 *   satisfiable from the `.env` file. Two safeguards, both here:
 *     1. Capture the shell-supplied `SEED_DEV_CONFIRM` BEFORE the preload, and
 *        restore exactly that value after — so a preload can never inject or alter
 *        it. (Node's loader already does not override an existing env var; this is
 *        the explicit, tamper-evident belt-and-suspenders.)
 *     2. Refuse to run if `packages/db/.env` defines `SEED_DEV_CONFIRM` at all —
 *        exit non-zero so the file can't be used to pre-confirm the target.
 *
 * Never prints `.env` contents or any connection string.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// packages/db/.env — resolved from this module's location, so it is found
// regardless of the process cwd (mirrors how drizzle-kit finds its cwd `.env`).
const ENV_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");

let loaded = false;

/** Preload packages/db/.env into process.env, keeping SEED_DEV_CONFIRM shell-only.
 *  Idempotent — safe to call once per process from any seed entrypoint. */
export function loadSeedEnv(): void {
  if (loaded) return;
  loaded = true;

  // (1) Capture the operator-supplied guard value BEFORE any preload runs.
  const shellSeedConfirm = process.env.SEED_DEV_CONFIRM;

  if (existsSync(ENV_PATH)) {
    // (2) The guard may never be pre-satisfied by the file. Detect the KEY only
    // (never read/print the value) and refuse if present.
    const definesGuard = readFileSync(ENV_PATH, "utf8")
      .split(/\r?\n/)
      .some((line) => /^\s*(?:export\s+)?SEED_DEV_CONFIRM\s*=/.test(line));
    if (definesGuard) {
      console.error(
        "SAFETY: packages/db/.env must not define SEED_DEV_CONFIRM.\n" +
          "The seed guard is a deliberate shell opt-in — export it from your shell,\n" +
          "never from the .env file. Remove SEED_DEV_CONFIRM from packages/db/.env.",
      );
      process.exit(1);
    }

    // Migrate-equivalent preload. Node's loader does NOT override vars already
    // present in the environment, so a shell-exported DATABASE_URL still wins.
    process.loadEnvFile(ENV_PATH);
  }

  // Restore the captured shell value verbatim, so SEED_DEV_CONFIRM is provably
  // shell-origin regardless of anything the preload touched.
  if (shellSeedConfirm === undefined) {
    delete process.env.SEED_DEV_CONFIRM;
  } else {
    process.env.SEED_DEV_CONFIRM = shellSeedConfirm;
  }
}
