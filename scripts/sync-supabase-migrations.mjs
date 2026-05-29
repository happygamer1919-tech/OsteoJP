#!/usr/bin/env node
// Sync drizzle migrations -> supabase/migrations for Supabase branching.
//
// Why this exists
//   Source of truth for schema is drizzle-kit: `packages/db/migrations/*.sql`
//   (tracked by `meta/_journal.json`, applied in prod via `pnpm db:migrate`).
//   Supabase *branching* does NOT run drizzle — when a PR opens, Supabase
//   builds the ephemeral DB branch by applying `supabase/migrations/*.sql`
//   (ordered by the numeric version prefix) followed by `supabase/seed.sql`.
//   There is no config knob to point Supabase at the drizzle directory, so the
//   exact same SQL must also exist under `supabase/migrations/`.
//
//   Rather than maintain two hand-written copies, this script mirrors the
//   drizzle `.sql` files (byte-for-byte) into `supabase/migrations/`. The
//   drizzle filenames (`0000_*.sql` .. `NNNN_*.sql`) double as Supabase
//   migration versions ("0000".."NNNN"), which sort correctly and are tracked
//   in `supabase_migrations.schema_migrations` on each branch.
//
// Usage
//   node scripts/sync-supabase-migrations.mjs           # write/update copies
//   node scripts/sync-supabase-migrations.mjs --check   # CI: fail if drifted
//
// Run the plain form after every `pnpm db:generate`. CI runs --check to block
// any PR where the two directories have diverged (see
// .github/workflows/supabase-branch-sync.yml).

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(repoRoot, "packages", "db", "migrations");
const DEST = join(repoRoot, "supabase", "migrations");
const checkOnly = process.argv.includes("--check");

const HEADER =
  "-- AUTO-GENERATED — DO NOT EDIT.\n" +
  "-- Mirror of packages/db/migrations/%FILE% for Supabase branching.\n" +
  "-- Edit the drizzle source, then run: node scripts/sync-supabase-migrations.mjs\n\n";

function sqlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

const srcFiles = sqlFiles(SRC);
if (srcFiles.length === 0) {
  console.error(`No .sql migrations found in ${SRC}`);
  process.exit(1);
}

const expected = new Map();
for (const file of srcFiles) {
  const body = readFileSync(join(SRC, file), "utf8");
  expected.set(file, HEADER.replace("%FILE%", file) + body);
}

if (checkOnly) {
  const problems = [];
  const destFiles = new Set(sqlFiles(DEST));
  for (const [file, content] of expected) {
    const path = join(DEST, file);
    if (!existsSync(path)) {
      problems.push(`missing: supabase/migrations/${file}`);
    } else if (readFileSync(path, "utf8") !== content) {
      problems.push(`drifted: supabase/migrations/${file}`);
    }
    destFiles.delete(file);
  }
  for (const stale of destFiles) problems.push(`orphan:  supabase/migrations/${stale}`);

  if (problems.length > 0) {
    console.error("supabase/migrations is out of sync with packages/db/migrations:");
    for (const p of problems) console.error("  " + p);
    console.error("\nFix: node scripts/sync-supabase-migrations.mjs && git add supabase/migrations");
    process.exit(1);
  }
  console.log(`supabase/migrations in sync (${expected.size} files).`);
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });
// Drop any stale mirror not present in source.
for (const file of sqlFiles(DEST)) {
  if (!expected.has(file)) rmSync(join(DEST, file));
}
for (const [file, content] of expected) {
  writeFileSync(join(DEST, file), content);
}
console.log(`Synced ${expected.size} migration(s) -> supabase/migrations.`);
