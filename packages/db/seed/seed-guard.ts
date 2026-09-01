/**
 * Shared safety guard for the dev-data seed scripts.
 *
 * ==========================================================================
 * THE PRIMARY GATE IS NOW POSITIVE, AND THE BLOCKLIST IS BEHIND IT
 * ==========================================================================
 * PERF-02 Task 1. `assertLocalTarget` (./local-target) runs FIRST and admits a
 * target only by affirmatively recognising an allowed local host. Everything
 * else is refused — including a production project nobody has listed yet, which
 * is the case a blocklist cannot see and calls safe. The reasoning, and the
 * three recorded fail-open incidents behind it, are in `local-target.ts`.
 *
 * THREE GATES NOW, IN THIS ORDER:
 *
 *   1. assertLocalTarget — the target host must BE one of the allowed local
 *      hosts. Positive identification. Nothing else reaches step 2.
 *   2. PROD_REFS blocklist — kept, and it is not redundant. It is unreachable
 *      while the allowlist holds, and that is exactly why it stays: the day
 *      somebody widens `ALLOWED_LOCAL_HOSTS`, the blocklist is the thing that
 *      still refuses the live clinic. A guard removed because it is currently
 *      unreachable is a guard missing the day the code above it changes.
 *   3. SEED_DEV_CONFIRM opt-in — the operator must name the target. This is a
 *      guard against an ACCIDENT (a stale shell, the wrong env file) rather
 *      than against a wrong target, which step 1 already settled.
 *
 * WHY LOCAL-ONLY IS NOT A RESTRICTION. `docs/QUESTIONS.md` line 518 records the
 * owner's verification that `ufbkzbyghvxtosyrkgjq` "DOES NOT EXIST and never
 * did", and the comment below records that the one remaining non-production
 * project is retired. There is no remote database left for a dev seed to write
 * to. `.github/workflows/db-tests.yml:54` already runs the whole DB-gated suite
 * against `127.0.0.1:54322`.
 *
 * NOT WIRED HERE, AND IT IS A DELIBERATE EXCLUSION: `seed/form-templates.ts` and
 * `seed/roles.ts` do not call this function. They are CONFIGURATION seeds the
 * owner runs against production on purpose (the template catalogue and the
 * permission roles), so a local-only gate would break a documented owner
 * workflow. They carry no target guard of their own; that gap is carded rather
 * than closed by breaking the workflow.
 */

import { assertLocalTarget } from "./local-target";

// Refs that must never be seeded. Seed refuses any ref listed here, ahead of
// (and unaffected by) the SEED_DEV_CONFIRM opt-in.
//   dfotoodqvmjhbdcxyaxf — PRODUCTION (Central EU / Frankfurt), the live clinic
//     database. Holds real patient and clinical data.
//   jaxmkwoxjcgzkwxgbayx — the RETIRED old prod (CLAUDE.md "Supabase setup":
//     "do not target it"). Blocklisted precisely BECAUSE it is retired: a stale
//     connection string in an old env file, shell history, or runbook still
//     points here, and a project nobody watches is the one where a wrong seed
//     goes unnoticed. Retired is a reason to add a ref, not to omit one.
export const PROD_REFS: string[] = ["dfotoodqvmjhbdcxyaxf", "jaxmkwoxjcgzkwxgbayx"];

/**
 * Parse the Supabase project ref from a connection string. Handles both the
 * pooler form (username `postgres.<ref>@...pooler.supabase.com`) and the direct
 * form (host `db.<ref>.supabase.co`). Returns null if no ref can be parsed.
 */
export function parseProjectRef(databaseUrl: string): string | null {
  // Pooler: username is postgres.<ref>, terminated by ':' (password) or '@' (host).
  const pooler = databaseUrl.match(/postgres\.([a-z0-9]{20})(?=[:@])/i);
  if (pooler) return pooler[1] ?? null;
  // Direct: host is db.<ref>.supabase.co
  const direct = databaseUrl.match(/db\.([a-z0-9]{20})\.supabase\.(?:co|com)/i);
  if (direct) return direct[1] ?? null;
  return null;
}

/**
 * GATE 2 AS A PURE FUNCTION, so it is testable independently of the gate above
 * it. Returns the blocklisted ref this URL names, or null.
 *
 * IT IS EXPORTED FOR EXACTLY THAT REASON. Gate 1 refuses every production URL
 * before gate 2 is reached, so a test that drives a production URL through
 * `resolveSeedDatabaseUrl` proves gate 1 and says nothing about gate 2. The
 * blocklist would then be untested from the day the allowlist landed, and the
 * first sign of that would be somebody widening `ALLOWED_LOCAL_HOSTS` and
 * discovering the second gate had rotted. This keeps it pinned.
 */
export function blocklistedRef(databaseUrl: string): string | null {
  const ref = parseProjectRef(databaseUrl);
  return ref && PROD_REFS.includes(ref) ? ref : null;
}

/**
 * Resolve and validate the seed target connection string. Reads
 * DATABASE_URL_DEV ?? DATABASE_URL. Exits the process with a nonzero code
 * (never returns) if the target is missing, NOT AFFIRMATIVELY LOCAL,
 * blocklisted, or not confirmed via SEED_DEV_CONFIRM. Returns the validated URL
 * on success.
 */
export function resolveSeedDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL_DEV or DATABASE_URL is required");
    process.exit(1);
  }

  // GATE 1, POSITIVE. Exits 1 unless the host IS an allowed local target. A ref
  // that cannot be parsed is no longer a refusal on its own, because a local
  // connection string has no Supabase ref to parse — this gate is what makes
  // that safe.
  assertLocalTarget(databaseUrl, process.env.DATABASE_URL_DEV ? "DATABASE_URL_DEV" : "DATABASE_URL");

  // GATE 2, the blocklist. Unreachable while gate 1 holds, kept deliberately —
  // see the header. It never depends on gate 1 having run.
  const blocked = blocklistedRef(databaseUrl);
  if (blocked) {
    console.error(`SAFETY: refusing to seed into blocklisted project ref (${blocked}).`);
    process.exit(1);
  }
  const ref = parseProjectRef(databaseUrl);

  // GATE 3, the opt-in. The token is the project ref when the URL has one and
  // the HOST otherwise, so a local target is confirmable at all. The message
  // below always prints the exact value to set, so it is never a guess.
  const token = ref ?? new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
  if (process.env.SEED_DEV_CONFIRM !== token) {
    console.error(
      `SAFETY: seed target not confirmed. DATABASE_URL points at "${token}".\n` +
        "Verify this is the intended target, then re-run with\n" +
        `  SEED_DEV_CONFIRM=${token}`,
    );
    process.exit(1);
  }

  return databaseUrl;
}
