#!/usr/bin/env node
/**
 * WHICH MIGRATIONS ARE APPLIED ON PRODUCTION. READ ONLY.
 *
 * ==========================================================================
 * WHY THIS EXISTS: AN ORDERING SENTENCE WAS READ AS A STATUS
 * ==========================================================================
 * On 2026-09-10 this lane reported the apply queue as "0082 -> 0083 -> 0084"
 * and told the owner that work was blocked behind 0082. 0082 HAD BEEN APPLIED
 * THE DAY BEFORE. The word "unapplied" came from a board card's TITLE -
 * PACK-06a's "Authored, NOT applied, queues behind 0082" - and its evidence,
 * "DO NOT APPLY BEFORE 0082". Both are ordering statements ABOUT 0083. Neither
 * says anything about 0082's own state, and "do not apply 0083 before 0082" is
 * trivially satisfied once 0082 is applied.
 *
 * Nothing was read that could have contradicted it: no journal query, and the
 * SR-51 card that would have carried the fact did not exist for 0082.
 *
 * So: a command that answers the question directly, from the database.
 *
 * ==========================================================================
 * IDENTITY IS THE FILE HASH, NEVER `id`
 * ==========================================================================
 * `drizzle.__drizzle_migrations.id` is a SERIAL - how many migrations have been
 * applied - not the migration's number. The two stopped coinciding at the
 * 0076/0077 gap: on production today id 80 IS tag 0082. So every row is
 * resolved by matching its `hash` against the sha256 of each migration FILE on
 * the current ref. A renamed or edited file cannot satisfy it.
 *
 * ==========================================================================
 * `created_at` IS NOT A CLOCK READING
 * ==========================================================================
 * It is the migration's synthetic journal `when`. Rendering it as a timestamp
 * produces August dates for migrations applied in September. It is an ORDERING
 * KEY and this script never prints it as a time.
 *
 * ==========================================================================
 * USAGE
 * ==========================================================================
 *   node --env-file=~/osteojp-secrets/new-prod.env \
 *     packages/db/scripts/read-applied-migrations.mjs
 *
 * SELECTs one table. No writes, no DDL, safe to interrupt. It REFUSES any
 * connection string whose ref is not the production project, so it cannot be
 * pointed somewhere by accident - and pointing it at a lane would answer about
 * `supabase_migrations.schema_migrations` anyway, which is a different journal
 * (standing rule 7: this repo has two appliers and two journals).
 */
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const PROD_REF = "dfotoodqvmjhbdcxyaxf";
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

if (!url) {
  console.error("no DATABASE_URL_DIRECT / DATABASE_URL in the environment");
  process.exit(2);
}
if (!url.includes(PROD_REF)) {
  console.error(
    `REFUSED: this script reads drizzle.__drizzle_migrations, which only production uses. ` +
      `The target's ref is not ${PROD_REF}. A local lane is migrated by \`supabase db reset\` ` +
      `and records in supabase_migrations.schema_migrations instead, so the answer here would ` +
      `be an error rather than a smaller truth.`,
  );
  process.exit(2);
}

const dir = new URL("../migrations/", import.meta.url).pathname;
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const fileByHash = new Map(
  files.map((f) => [createHash("sha256").update(readFileSync(join(dir, f))).digest("hex"), f]),
);

const sql = postgres(url, { prepare: false, max: 1 });
try {
  const rows = await sql`select id, hash from drizzle.__drizzle_migrations order by id`;
  const appliedFiles = new Set();
  const orphans = [];
  for (const r of rows) {
    const f = fileByHash.get(r.hash);
    if (f) appliedFiles.add(f);
    else orphans.push(r);
  }

  console.log(`journal rows on production: ${rows.length}\n`);
  console.log("every migration file on this ref:");
  let pending = 0;
  for (const f of files) {
    const applied = appliedFiles.has(f);
    if (!applied) pending += 1;
    console.log(`  ${applied ? "APPLIED    " : "NOT APPLIED"}  ${f}`);
  }

  console.log(`\npending on this ref: ${pending}`);
  if (orphans.length > 0) {
    // A journal row whose hash matches no file on this ref. Either the ref is
    // behind production, or a file was edited after it was applied - and those
    // are very different problems, so it says the count rather than guessing.
    console.log(
      `\njournal rows with NO matching file on this ref: ${orphans.length}\n` +
        `  Either this checkout is behind production, or an applied file was edited.\n` +
        `  ids: ${orphans.map((o) => o.id).join(", ")}`,
    );
  } else {
    console.log("journal rows with no matching file on this ref: 0");
  }
} finally {
  await sql.end();
}
