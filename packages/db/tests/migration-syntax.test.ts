import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Guard against a migration that cannot PARSE.
//
// Why this exists. 0052 shipped with one header line missing its closing `*/`.
// Postgres NESTS block comments, so that single unclosed `/*` swallowed the
// entire rest of the file and the migration failed to apply with a bare
// "syntax error at or near" pointing into prose. It cost two CI jobs to find
// and it would have failed identically on the prod apply.
//
// No test in this repo would have caught it: the unit suites never read
// migration SQL, and the DB-gated suites only fail AFTER a full Supabase stack
// has started, which is slow and buries the cause under a stack trace.
//
// This is deliberately a cheap STATIC check, not a parser. It catches the
// specific, silent, high-cost mistake - unbalanced delimiters - in
// milliseconds, without a database.
//
// PARKED MIGRATIONS ARE CHECKED TOO (SR-62 PU-4). A file in
// `migrations-pending/` is promoted by a RENAME ONLY, so its body is final the
// day it is authored. Checking it only after promotion would find an unclosed
// comment on the promotion branch, which is the late moment this guard exists
// to avoid.

const DB = join(__dirname, "..");
const MIGRATIONS = join(DB, "migrations");
const PENDING = join(DB, "migrations-pending");

/** Paths relative to packages/db: every numbered migration, then every parked one. */
function migrationFiles(): string[] {
  const sqlIn = (dir: string, rel: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".sql"))
          .sort()
          .map((f) => join(rel, f))
      : [];
  return [...sqlIn(MIGRATIONS, "migrations"), ...sqlIn(PENDING, "migrations-pending")];
}

/**
 * Count block-comment delimiters, raw.
 *
 * The first version of this tried to skip delimiters inside string literals, by
 * tracking quotes. That broke immediately: migration headers are English prose,
 * and an apostrophe in "the agenda's query" (0016) flipped the tracker so every
 * later delimiter was ignored. It reported eight known-good, already-applied
 * migrations as broken.
 *
 * Raw counting is correct here and was verified empirically: all 52 migrations
 * balance, 51 of which are PROVEN good by having applied to prod. Cleverness
 * that produces false alarms is worse than none, because a guard people learn
 * to dismiss protects nothing.
 */
function countDelimiters(sql: string): { open: number; close: number } {
  return {
    open: (sql.match(/\/\*/g) ?? []).length,
    close: (sql.match(/\*\//g) ?? []).length,
  };
}

describe("migration files parse-guard", () => {
  const files = migrationFiles();

  it("guards against a vacuous pass: migrations were actually found", () => {
    expect(files.filter((f) => f.startsWith("migrations/")).length).toBeGreaterThan(40);
  });

  it.each(files)("%s has balanced block-comment delimiters", (file) => {
    const sql = readFileSync(join(DB, file), "utf-8");
    const { open, close } = countDelimiters(sql);

    expect(
      open,
      `${file}: ${open} '/*' vs ${close} '*/'. Postgres NESTS block comments, so ` +
        `one unclosed '/*' swallows the rest of the file and the migration fails ` +
        `to apply with a syntax error pointing at prose.`,
    ).toBe(close);
  });

  it.each(files)("%s has balanced dollar-quote delimiters", (file) => {
    const sql = readFileSync(join(DB, file), "utf-8");
    // A function body opened with $$ and never closed fails the same way.
    expect(
      (sql.match(/\$\$/g) ?? []).length % 2,
      `${file}: odd number of '$$' delimiters - a function body is unterminated.`,
    ).toBe(0);
  });
});
