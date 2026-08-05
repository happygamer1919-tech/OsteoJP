#!/usr/bin/env node
// Table-existence check after a migration apply. READ ONLY.
//
// WHY THIS EXISTS. `drizzle-kit migrate` prints "[✓] migrations applied
// successfully!" whether or not it applied anything, so its output alone cannot
// distinguish an apply from a no-op. This project has been bitten by that twice:
// the 0049 incident (a plain `git checkout <branch>` left the prod-apply worktree
// on `main`, db:migrate found nothing new, and success was reported for a
// migration that never ran — docs/DECISIONS.md:2215), and the 0038-0041 incident
// before it.
//
// The fix recorded in docs/notifications-work-notes.md after the 0054 apply was:
// "Future apply blocks must ask for a table-existence read instead — a `select`
// naming the tables the migration creates — which distinguishes applied from
// no-op in one command." The 0055 block then asked for a journal read out of git
// instead, which pins the commit but says nothing about the database. The 0056
// block asked for `psql`, which is not installed on the owner's machine.
//
// So this is that check, as a committed script with no external tooling: it uses
// the `postgres` driver packages/db already depends on, and nothing else.
//
// SAFETY, because this is the one script pointed at production:
//   * The transaction is opened READ ONLY, so the server itself refuses any
//     write this script could contain now or later.
//   * It reads pg_catalog only, via to_regclass. It never touches a patient
//     table, so no NIF, phone, email or clinical value can pass through it.
//   * It prints table names and a boolean. It never prints the connection
//     string, and it never logs an environment value.
//
// USAGE, from the repo root with the prod env sourced:
//   pnpm --filter @osteojp/db exec node scripts/check-migration-tables.mjs \
//     patient_otp_codes patient_trusted_devices rate_limit_counters
//
// IT LIVES INSIDE packages/db ON PURPOSE. ESM resolves imports from the
// SCRIPT's own location, not from the working directory, so the same file under
// the repo-root scripts/ could not see `postgres` no matter which package it was
// invoked from. Adding the driver to the root package.json would be a new
// top-level dependency for a one-command check; living next to the package that
// already depends on it costs nothing.
//
// Exit 0 only when EVERY named table exists. Exit 1 names the missing ones, so
// it is usable as a gate and not merely as a report.

// The driver is imported LAZILY, after the argument and environment checks
// below. Imported at the top it resolves before any of them, so running this the
// wrong way produced ERR_MODULE_NOT_FOUND instead of the message that says how
// to run it right — and the safety guards never got the chance to fire.

const tables = process.argv.slice(2).filter(Boolean);
if (tables.length === 0) {
  console.error(
    "usage: check-migration-tables.mjs <table> [<table> ...]\n" +
      "example: check-migration-tables.mjs patient_otp_codes rate_limit_counters",
  );
  process.exit(2);
}

// Reject anything that is not a bare identifier. These names are interpolated
// into a to_regclass argument, so they are validated rather than trusted even
// though they come from argv on the owner's own machine.
const BAD = tables.filter((t) => !/^[a-z_][a-z0-9_]*$/.test(t));
if (BAD.length > 0) {
  console.error(`refusing non-identifier table name(s): ${BAD.join(", ")}`);
  process.exit(2);
}

const DB_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!DB_URL) {
  // Names only. The value is never printed, here or anywhere.
  console.error("Set DATABASE_URL_DIRECT or DATABASE_URL (names only; never paste the value).");
  process.exit(2);
}

let postgres;
try {
  ({ default: postgres } = await import("postgres"));
} catch {
  console.error(
    "could not resolve the `postgres` driver from here.\n" +
      "Run it through the package that depends on it, from the repo root:\n\n" +
      "  pnpm --filter @osteojp/db exec node scripts/check-migration-tables.mjs " +
      tables.join(" "),
  );
  process.exit(2);
}

const sql = postgres(DB_URL, {
  ssl: "require",
  max: 1,
  idle_timeout: 10,
  connect_timeout: 15,
  // The driver must not print the URL on a connection error.
  onnotice: () => {},
});

try {
  const rows = await sql.begin(async (tx) => {
    // Belt and braces: the server refuses writes for the whole transaction.
    await tx.unsafe("set transaction read only");
    return tx`
      select
        t.name,
        to_regclass('public.' || t.name) is not null as exists
      from unnest(${sql.array(tables)}::text[]) as t(name)
      order by t.name
    `;
  });

  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    console.log(`${r.name.padEnd(width)}  ${r.exists ? "EXISTS" : "MISSING"}`);
  }

  const missing = rows.filter((r) => !r.exists).map((r) => r.name);
  if (missing.length > 0) {
    console.error(`\nFAIL: ${missing.length} table(s) missing: ${missing.join(", ")}`);
    console.error("The migration did NOT apply. Do not merge the PR.");
    process.exit(1);
  }
  console.log(`\nOK: all ${rows.length} table(s) present.`);
} catch (err) {
  // Message only. A driver error object can carry the connection string.
  console.error(`query failed: ${err instanceof Error ? err.message : "unknown"}`);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
