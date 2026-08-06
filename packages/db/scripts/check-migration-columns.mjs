#!/usr/bin/env node
// Column-existence check after a migration apply. READ ONLY.
//
// SIBLING OF check-migration-tables.mjs, and it exists because 0057 was the
// first migration on this project that creates NO TABLE. It adds one column and
// backfills it, so a table-existence read would have passed before the migration
// ran and proven nothing at all — the exact class of false green that script was
// written to end.
//
// The binding rule recorded after the 0056 apply
// (docs/notifications-work-notes.md) is that every apply block ends with a
// committed verification script naming what that migration created. For a
// column-only migration that script is this one. The 0057 apply was verified
// with a BESPOKE INLINE SCRIPT instead, which worked and was then deleted, so
// the verification could not be re-run by anyone else — see the 0057 evidence
// section for that failure written up in full.
//
// SAFETY, identical posture to the table checker because it is pointed at the
// same database:
//   * READ ONLY transaction, so the server refuses any write.
//   * Reads information_schema only. Never touches a patient table, so no NIF,
//     phone, email or clinical value can pass through it.
//   * Prints identifiers and booleans. Never the connection string, never an
//     environment value.
//
// USAGE, from the repo root with the prod env sourced:
//   pnpm --filter @osteojp/db exec node scripts/check-migration-columns.mjs \
//     services.patient_bookable
//
// Exit 0 only when EVERY named column exists. Exit 1 names the missing ones.

const args = process.argv.slice(2).filter(Boolean);
if (args.length === 0) {
  console.error(
    "usage: check-migration-columns.mjs <table>.<column> [<table>.<column> ...]\n" +
      "example: check-migration-columns.mjs services.patient_bookable",
  );
  process.exit(2);
}

// Validated, not trusted, exactly as the table checker validates its argv.
const BAD = args.filter((a) => !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(a));
if (BAD.length > 0) {
  console.error(`refusing non-identifier argument(s): ${BAD.join(", ")}`);
  console.error("expected <table>.<column>, lowercase identifiers only");
  process.exit(2);
}
const pairs = args.map((a) => {
  const [table, column] = a.split(".");
  return { table, column };
});

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
      "  pnpm --filter @osteojp/db exec node scripts/check-migration-columns.mjs " +
      args.join(" "),
  );
  process.exit(2);
}

const sql = postgres(DB_URL, {
  ssl: "require",
  max: 1,
  idle_timeout: 10,
  connect_timeout: 15,
  onnotice: () => {},
});

try {
  const rows = await sql.begin(async (tx) => {
    await tx.unsafe("set transaction read only");
    return tx`
      select
        p.table_name,
        p.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        (c.column_name is not null) as exists
      from unnest(
             ${sql.array(pairs.map((p) => p.table))}::text[],
             ${sql.array(pairs.map((p) => p.column))}::text[]
           ) as p(table_name, column_name)
      left join information_schema.columns c
        on c.table_schema = 'public'
       and c.table_name = p.table_name
       and c.column_name = p.column_name
      order by p.table_name, p.column_name
    `;
  });

  const label = (r) => `${r.table_name}.${r.column_name}`;
  const width = Math.max(...rows.map((r) => label(r).length));
  for (const r of rows) {
    const detail = r.exists
      ? `EXISTS  ${r.data_type}, ${r.is_nullable === "NO" ? "not null" : "nullable"}` +
        (r.column_default ? `, default ${r.column_default}` : "")
      : "MISSING";
    console.log(`${label(r).padEnd(width)}  ${detail}`);
  }

  const missing = rows.filter((r) => !r.exists).map(label);
  if (missing.length > 0) {
    console.error(`\nFAIL: ${missing.length} column(s) missing: ${missing.join(", ")}`);
    console.error("The migration did NOT apply. Do not merge the PR.");
    process.exit(1);
  }
  console.log(`\nOK: all ${rows.length} column(s) present.`);
} catch (err) {
  console.error(`query failed: ${err instanceof Error ? err.message : "unknown"}`);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
