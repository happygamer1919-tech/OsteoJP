/**
 * Shared safety guard for the dev-data seed scripts.
 *
 * A dedicated production Supabase project now exists (CLAUDE.md "Supabase
 * setup": `dfotoodqvmjhbdcxyaxf`, Central EU), so the seeds protect the target
 * two ways:
 *
 *   1. PROD_REFS blocklist — refs that must never be seeded, refused before
 *      the confirmation step and with no opt-in that can override them.
 *   2. SEED_DEV_CONFIRM opt-in — the operator must set SEED_DEV_CONFIRM to the
 *      exact project ref parsed from DATABASE_URL. This forces a deliberate
 *      "I verified this target in the Supabase dashboard" step before any write,
 *      and makes an accidental run (wrong env, wrong shell) refuse by default.
 *
 * The blocklist is the stronger of the two: SEED_DEV_CONFIRM is a guard against
 * an ACCIDENT (a stale shell, the wrong env file), while PROD_REFS is a guard
 * against a DELIBERATE run aimed at the wrong database — setting
 * SEED_DEV_CONFIRM to a blocklisted ref still refuses. Add a ref here whenever a
 * project must never receive dev data.
 */

// Refs that must never be seeded. Seed refuses any ref listed here, ahead of
// (and unaffected by) the SEED_DEV_CONFIRM opt-in.
//   dfotoodqvmjhbdcxyaxf — PRODUCTION (Central EU / Frankfurt), the live clinic
//     database. Holds real patient and clinical data.
export const PROD_REFS: string[] = ["dfotoodqvmjhbdcxyaxf"];

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
 * Resolve and validate the seed target connection string. Reads
 * DATABASE_URL_DEV ?? DATABASE_URL. Exits the process with a nonzero code
 * (never returns) if the target is missing, unparseable, blocklisted, or not
 * confirmed via SEED_DEV_CONFIRM. Returns the validated URL on success.
 */
export function resolveSeedDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL_DEV ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL_DEV or DATABASE_URL is required");
    process.exit(1);
  }

  const ref = parseProjectRef(databaseUrl);
  if (!ref) {
    console.error(
      "SAFETY: could not parse a Supabase project ref from DATABASE_URL.\n" +
        "Verify the target in the Supabase dashboard and point DATABASE_URL at it.",
    );
    process.exit(1);
  }

  if (PROD_REFS.includes(ref)) {
    console.error(`SAFETY: refusing to seed into blocklisted project ref (${ref}).`);
    process.exit(1);
  }

  if (process.env.SEED_DEV_CONFIRM !== ref) {
    console.error(
      `SAFETY: seed target not confirmed. DATABASE_URL points at project "${ref}".\n` +
        "Verify this is the intended target in the Supabase dashboard, then re-run with\n" +
        `  SEED_DEV_CONFIRM=${ref}`,
    );
    process.exit(1);
  }

  return databaseUrl;
}
