#!/usr/bin/env node
// Pending-migration count, read BEFORE `drizzle-kit migrate` runs. READ ONLY.
//
// WHY THIS EXISTS. `drizzle-kit migrate` prints "migrations applied
// successfully!" whether or not it applied anything. check-migration-tables.mjs
// catches that AFTER the fact, by proving the table is absent. This one catches
// it BEFORE: it answers "how many migrations does the database consider
// pending", so a no-op is refused at the door instead of being discovered from
// its own aftermath.
//
// This project has now hit the silent no-op three times:
//   * 0038-0041, and 0049 (docs/DECISIONS.md:2215), where a plain
//     `git checkout <branch>` left the apply worktree on `main`, so the new
//     migration was not on disk at all.
//   * 0058, where the file WAS on disk and the checkout WAS correct, but the
//     journal entry had been hand-appended with a `when` LOWER than the
//     previously applied migration's. drizzle decides what is pending with
//     `Number(lastDbMigration.created_at) < migration.folderMillis`
//     (drizzle-orm/pg-core/dialect.js:62), where folderMillis IS the journal's
//     `when` (migrator.js:22). A lower `when` reads as already applied.
//
// The two causes look identical from the migrate output and are distinguished
// by exactly this check: the first shows the migration missing from the journal
// on disk, the second shows it present but not pending.
//
// SAFETY, because this is pointed at production:
//   * The transaction is opened READ ONLY, so the server itself refuses any
//     write this script could contain now or later.
//   * It reads drizzle's own bookkeeping table and nothing else. It never
//     touches a patient table, so no NIF, phone, email or clinical value can
//     pass through it.
//   * It prints migration tags and integers. It never prints the connection
//     string and never logs an environment value.
//
// USAGE, from the repo root with the prod env sourced:
//   pnpm --filter @osteojp/db exec node scripts/check-pending-migrations.mjs 1
//
// The argument is the EXPECTED pending count. Exit 0 only when the actual count
// matches it, so this is a gate and not merely a report.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JOURNAL = path.join(HERE, "..", "migrations", "meta", "_journal.json");

const expectedRaw = process.argv[2];
if (expectedRaw === undefined || !/^\d+$/.test(expectedRaw)) {
  console.error(
    "usage: check-pending-migrations.mjs <expected-pending-count>\n" +
      "  e.g. check-pending-migrations.mjs 1",
  );
  process.exit(2);
}
const expected = Number(expectedRaw);

// Same resolution order as drizzle.config.ts, so this checks the SAME database
// `drizzle-kit migrate` is about to touch. Name only; the value is never read
// into a log or an error message.
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "check-pending-migrations: neither DATABASE_URL_DIRECT nor DATABASE_URL is set. " +
      "Source the environment first.",
  );
  process.exit(2);
}

// Lazy import, after the argument and environment checks, so running this the
// wrong way prints the usage rather than ERR_MODULE_NOT_FOUND.
const { default: postgres } = await import("postgres");

const journal = JSON.parse(readFileSync(JOURNAL, "utf8"));
const entries = [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);

const sql = postgres(url, { prepare: false, max: 1 });
let failed = false;
try {
  const rows = await sql.begin(async (tx) => {
    await tx`set transaction read only`;
    // drizzle's own bookkeeping. created_at holds the journal `when` of each
    // applied migration (dialect.js:67 inserts folderMillis into it).
    return tx`select created_at
                from drizzle.__drizzle_migrations
               order by created_at desc
               limit 1`;
  });

  const lastApplied = rows[0] ? Number(rows[0].created_at) : null;
  // The exact predicate drizzle uses, restated here so the two cannot disagree
  // about what "pending" means.
  const pending = entries.filter((e) => lastApplied === null || lastApplied < e.when);

  console.log(`last applied "when" in the database: ${lastApplied ?? "(none)"}`);
  console.log(`journal entries on disk:             ${entries.length}`);
  console.log(`pending:                             ${pending.length}`);
  for (const e of pending) console.log(`  PENDING  ${e.tag}  when=${e.when}`);

  if (pending.length !== expected) {
    failed = true;
    console.error(`\nFAIL: expected ${expected} pending migration(s), found ${pending.length}.`);
    if (pending.length === 0 && entries.length > 0) {
      const last = entries[entries.length - 1];
      console.error(
        `The newest journal entry is "${last.tag}" with when=${last.when}, and the database's ` +
          `last applied "when" is ${lastApplied}. ` +
          (lastApplied !== null && last.when <= lastApplied
            ? `Because ${last.when} is NOT GREATER than ${lastApplied}, drizzle-kit will treat it ` +
              `as already applied, apply nothing, and still print success. Fix the journal "when" ` +
              `so it is strictly greater, then re-run.`
            : `Check that the apply worktree is on the right commit.`),
      );
    }
    console.error("Do NOT run drizzle-kit migrate.");
  } else {
    console.log("\nOK: the pending set is exactly what was expected.");
  }
} finally {
  await sql.end();
}

process.exit(failed ? 1 : 0);
