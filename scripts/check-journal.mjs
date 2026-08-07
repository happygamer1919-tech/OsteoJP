#!/usr/bin/env node
// Drizzle migration journal drift check (zero-dependency, no DB access).
//
// The migration journal (packages/db/migrations/meta/_journal.json) once
// drifted from the .sql files on disk. This asserts, purely from the
// filesystem, that the two can never silently diverge again:
//   1. Every packages/db/migrations/*.sql file has a matching journal entry,
//      keyed on tag == filename minus ".sql".
//   2. Every journal entry has a matching .sql file.
//   3. The journal `idx` order matches the on-disk numeric filename order
//      (files are zero-padded `NNNN_slug.sql`, so lexical sort == numeric).
//
// Exits non-zero with a clear diff on any mismatch. Deliberately dependency-
// free (only node:fs / node:path) so it runs in CI before any tooling install.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "packages/db/migrations");
const JOURNAL = path.join(MIGRATIONS_DIR, "meta/_journal.json");

function fail(lines) {
  console.error("\n✗ Migration journal drift detected:\n");
  for (const l of lines) console.error(`    ${l}`);
  console.error(
    "\nReconcile packages/db/migrations/meta/_journal.json with the .sql files on disk.",
  );
  process.exit(1);
}

function main() {
  if (!statSync(JOURNAL, { throwIfNoEntry: false })) {
    fail([`journal not found at ${path.relative(ROOT, JOURNAL)}`]);
  }

  // On-disk .sql tags, in numeric filename order.
  const fileTags = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.slice(0, -".sql".length))
    .sort();

  // Journal entries, in declared idx order.
  const journal = JSON.parse(readFileSync(JOURNAL, "utf8"));
  const entries = [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);
  const journalTags = entries.map((e) => e.tag);

  const fileSet = new Set(fileTags);
  const journalSet = new Set(journalTags);

  const problems = [];

  // 1. .sql files with no journal entry.
  for (const tag of fileTags) {
    if (!journalSet.has(tag)) problems.push(`${tag}.sql on disk has NO journal entry`);
  }

  // 2. Journal entries with no .sql file.
  for (const tag of journalTags) {
    if (!fileSet.has(tag)) problems.push(`journal entry "${tag}" has NO matching .sql file`);
  }

  // 3. idx contiguity: idx values must be 0..N-1 with no gaps/dupes.
  entries.forEach((e, i) => {
    if (e.idx !== i) problems.push(`journal idx out of sequence: entry "${e.tag}" has idx ${e.idx}, expected ${i}`);
  });

  // 3b. `when` MUST STRICTLY INCREASE, and this is the check whose absence let
  //     migration 0058 be applied as a silent no-op against production.
  //
  //     drizzle-orm/pg-core/dialect.js:62 decides what is pending with
  //         Number(lastDbMigration.created_at) < migration.folderMillis
  //     where folderMillis IS the journal's `when` (migrator.js:22), and
  //     created_at is the `when` of the last row in __drizzle_migrations. So a
  //     new entry whose `when` is LOWER than the previously applied one is
  //     considered already in the past: drizzle skips it, applies nothing, and
  //     still prints "migrations applied successfully".
  //
  //     That is the 0049 failure mode, and it recurred on 0058 because a
  //     journal entry was hand-appended with a real-world timestamp
  //     (2026-08-07) while the file's own convention is a synthetic series
  //     stepping +100000000 per entry, already far in the future. Counts, idx
  //     contiguity and filename order all reconciled; only the ordering of
  //     `when` was wrong, and nothing checked it.
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const cur = entries[i];
    if (!(cur.when > prev.when)) {
      problems.push(
        `journal "when" is not strictly increasing: "${cur.tag}" has when=${cur.when}, ` +
          `which is not greater than "${prev.tag}" when=${prev.when}. ` +
          `drizzle-kit would treat "${cur.tag}" as already applied and skip it silently. ` +
          `Use ${prev.when + 100000000} to follow this file's convention.`,
      );
    }
  }

  // 4. Order match: journal idx order must equal on-disk numeric order.
  //    (Only meaningful once sets match, but reported independently for clarity.)
  if (problems.length === 0) {
    for (let i = 0; i < fileTags.length; i++) {
      if (fileTags[i] !== journalTags[i]) {
        problems.push(
          `order mismatch at position ${i}: file "${fileTags[i]}" vs journal "${journalTags[i]}"`,
        );
      }
    }
  }

  if (problems.length > 0) fail(problems);

  console.log(
    `✓ Migration journal reconciled: ${fileTags.length} .sql files match ${journalTags.length} journal entries in order.`,
  );
}

main();
