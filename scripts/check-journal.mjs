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
