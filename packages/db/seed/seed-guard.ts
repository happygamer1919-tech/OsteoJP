/**
 * Shared safety guard for the dev-data seed scripts.
 *
 * OsteoJP currently runs a SINGLE Supabase project. That project is the dev
 * database and also backs the deployed app; a separate production project has
 * not been provisioned yet (a pre-real-data gate). Because there is no
 * dedicated production ref to blocklist by name, these seeds protect the target
 * two ways:
 *
 *   1. PROD_REFS blocklist — refs that must never be seeded. Empty today;
 *      populate it with the production ref the moment that project exists.
 *   2. SEED_DEV_CONFIRM opt-in — the operator must set SEED_DEV_CONFIRM to the
 *      exact project ref parsed from DATABASE_URL. This forces a deliberate
 *      "I verified this target in the Supabase dashboard" step before any write,
 *      and makes an accidental run (wrong env, wrong shell) refuse by default.
 */

// Populate when the separate production Supabase project is provisioned
// (pre-real-data gate); seed refuses any ref listed here.
export const PROD_REFS: string[] = [];

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
