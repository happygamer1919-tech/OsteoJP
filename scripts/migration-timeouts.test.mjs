// EVERY MIGRATION FROM 0100 ON STARTS BY BOUNDING ITS OWN LOCK WAIT AND RUN TIME.
//
// The lead's ruling of 2026-10-01, option (b): "SET LOCAL at the top of every
// migration from 0100, gate-enforced". Dispatch S-1001-A, B2: "SET LOCAL
// lock_timeout and statement_timeout at the top of every migration numbered 0100
// or higher; the gate refuses a file without them."
//
// WHY SET LOCAL IN THE FILE, AND NOT ON THE SESSION. drizzle-kit migrate runs the
// whole pending set inside ONE transaction (drizzle-orm pg-core dialect.migrate:
// session.transaction, then tx.execute per statement), so a SET LOCAL at the top
// of a file holds for the rest of that transaction, through any pooler. The
// session route does not reach production: postgres.js ignores PGOPTIONS, and
// Supabase's session pooler forwards only search_path from a client's startup
// options (measured for #1510's observer, which printed "NOT APPLIED").
//
// THE VALUES, PROPOSED FROM WHAT THE SITTINGS SHOWED. In each of the 0096, 0097,
// 0098 and 0099 sittings of 2026-09-30 and 2026-10-01, the time from the last
// pre-apply transcript to the end of /tmp/NNNN-apply.out was 3 s (file mtimes,
// one-second resolution). That envelope holds node's start, the connection,
// drizzle-kit and every statement of the migration, 0098's index build over
// 117,314 ledger rows included, so no single statement ran longer than 3 s. The
// 0094 and 0095 transcripts were no longer on the apply machine to read.
//   lock_timeout '5s': a migration that cannot take its lock in 5 s fails, the
//     transaction rolls back and nothing is applied, rather than queueing behind
//     a long transaction while every clinic query queues behind IT;
//   statement_timeout '60s': twenty times the longest whole apply observed, so a
//     table that grows several-fold still fits, and a runaway statement is cut.
// They are the lead's to change. A change is one line here, in a GATE-CHANGE
// once the manifest freezes this file.
//
// WHAT IS IN SCOPE. A promoted migration whose number is 0100 or higher, and
// every pending migration (each one is promoted at a number above 0099). Files
// numbered below 0100 are NOT touched and NOT checked: they are applied, and
// their bytes are what every apply document pins.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMOTED_DIR = "packages/db/migrations";
const PENDING_DIR = "packages/db/migrations-pending";
const FIRST = 100;

export const LOCK_TIMEOUT = "5s";
export const STATEMENT_TIMEOUT = "60s";
export const REQUIRED = Object.freeze([
  `SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`,
  `SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}';`,
]);

/** The number a promoted migration file carries, or null when it carries none. */
export function numberOf(file) {
  const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
  return m ? Number(m[1]) : null;
}

/** Whether the rule applies: a promoted file numbered 0100 or higher, or any pending .sql file. */
export function inScope(dir, file) {
  if (!file.endsWith(".sql")) return false;
  if (dir === PENDING_DIR) return true;
  const n = numberOf(file);
  return n !== null && n >= FIRST;
}

/**
 * The first `count` statements of a migration, normalised: comments, drizzle's
 * `--> statement-breakpoint` markers and blank lines removed, whitespace collapsed,
 * each statement ending in its own `;`.
 */
export function leadingStatements(sql, count) {
  const code = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  return code
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s !== "")
    .slice(0, count)
    .map((s) => `${s};`);
}

/** Why a migration in scope fails the rule, or [] when it passes. */
export function timeoutProblems(sql) {
  const head = leadingStatements(sql, REQUIRED.length);
  const problems = [];
  REQUIRED.forEach((want, i) => {
    if (head[i] !== want) {
      problems.push(`statement ${i + 1} must be exactly ${want} and is ${head[i] === undefined ? "missing" : head[i]}`);
    }
  });
  return problems;
}

/** Every migration file in scope under `root`, as [path, problems]. */
export function scan(root) {
  const out = [];
  for (const dir of [PROMOTED_DIR, PENDING_DIR]) {
    for (const file of readdirSync(join(root, dir)).sort()) {
      if (!inScope(dir, file)) continue;
      out.push([`${dir}/${file}`, timeoutProblems(readFileSync(join(root, dir, file), "utf8"))]);
    }
  }
  return out;
}
const scanRepository = () => scan(ROOT);

const GOOD = [
  "-- 0100: a header comment, as every migration carries one.",
  "",
  `SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`,
  "--> statement-breakpoint",
  `SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}';`,
  "--> statement-breakpoint",
  "REVOKE MAINTAIN ON public.example FROM authenticated;",
].join("\n");

test("every migration numbered 0100 or higher, and every pending one, starts with the two SET LOCAL lines", () => {
  const scanned = scanRepository();
  const failing = scanned.filter(([, p]) => p.length > 0).map(([f, p]) => `${f}: ${p.join("; ")}`);
  assert.deepEqual(failing, [], `a migration in scope does not bound its own lock wait and run time:\n${failing.join("\n")}`);
  // The PROFILE, printed rather than asserted: today no file is in scope, so this
  // arm passes on an empty set and the CONTROL arms below are what prove it bites.
  console.log(`migration-timeouts: ${scanned.length} file(s) in scope: ${scanned.map(([f]) => f).join(", ") || "none yet"}`);
});

test("CONTROL: a 0100 migration without the lines is refused, and with them it passes", () => {
  assert.deepEqual(timeoutProblems(GOOD), []);
  assert.equal(timeoutProblems("REVOKE MAINTAIN ON public.example FROM authenticated;").length, 2);
});

test("CONTROL: each way of getting the lines wrong is refused", () => {
  const without = (i) => GOOD.split("\n").filter((_, k) => k !== i).join("\n");
  assert.equal(timeoutProblems(without(2)).length, 2, "lock_timeout missing: statement 1 is statement_timeout, statement 2 is the REVOKE");
  assert.equal(timeoutProblems(without(4)).length, 1, "statement_timeout missing");
  const swapped = GOOD.replace(REQUIRED[0], "@@").replace(REQUIRED[1], REQUIRED[0]).replace("@@", REQUIRED[1]);
  assert.equal(timeoutProblems(swapped).length, 2, "the two lines in the wrong order");
  assert.equal(timeoutProblems(`SELECT 1;\n${GOOD}`).length, 2, "the lines after another statement are not at the top");
  assert.equal(timeoutProblems(GOOD.replace(`'${LOCK_TIMEOUT}'`, "'0'")).length, 1, "lock_timeout 0 disables it");
  assert.equal(timeoutProblems(GOOD.replace(`'${STATEMENT_TIMEOUT}'`, "'0'")).length, 1, "statement_timeout 0 disables it");
  assert.equal(timeoutProblems(GOOD.replace("SET LOCAL lock_timeout", "SET lock_timeout")).length, 1, "a session SET outlives the transaction");
  assert.equal(timeoutProblems(GOOD.replace(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`, `-- SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`)).length, 2, "commented out");
  assert.equal(timeoutProblems(GOOD.replace(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`, `/* SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'; */`)).length, 2, "inside a block comment");
});

test("GREEN: comments, blank lines, breakpoint markers, a stray empty statement and extra spacing around the lines are accepted", () => {
  const spaced = GOOD.replace(REQUIRED[0], `SET   LOCAL\n  lock_timeout = '${LOCK_TIMEOUT}' ;  -- bound the lock wait`);
  assert.deepEqual(timeoutProblems(`/* a block comment first */\n${spaced}`), []);
  assert.deepEqual(timeoutProblems(`;\n${GOOD}`), [], "an empty statement before the lines changes nothing the server runs");
});

test("CONTROL: the scan reads BOTH folders, so a pending file without the lines is refused before it is promoted", () => {
  const root = mkdtempSync(join(tmpdir(), "migration-timeouts-"));
  try {
    mkdirSync(join(root, PROMOTED_DIR), { recursive: true });
    mkdirSync(join(root, PENDING_DIR), { recursive: true });
    writeFileSync(join(root, PROMOTED_DIR, "0099_applied.sql"), "REVOKE TRUNCATE ON public.example FROM authenticated;");
    writeFileSync(join(root, PROMOTED_DIR, "0100_good.sql"), GOOD);
    writeFileSync(join(root, PENDING_DIR, "NEXT-AFTER-0100_bad.sql"), "REVOKE MAINTAIN ON public.example FROM authenticated;");
    writeFileSync(join(root, PENDING_DIR, "README.md"), "not a migration");
    const result = scan(root);
    assert.deepEqual(result.map(([f]) => f), [`${PROMOTED_DIR}/0100_good.sql`, `${PENDING_DIR}/NEXT-AFTER-0100_bad.sql`]);
    assert.deepEqual(result[0][1], []);
    assert.equal(result[1][1].length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("SCOPE: 0100 and above and every pending file are in scope; 0000 to 0099 are not, and 0099 is untouched", () => {
  assert.equal(inScope(PROMOTED_DIR, "0100_maintain_revoke.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "0123_some_change.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "0099_revoke_truncate_trigger_references.sql"), false);
  assert.equal(inScope(PROMOTED_DIR, "0000_empty_runaways.sql"), false);
  assert.equal(inScope(PENDING_DIR, "NEXT-AFTER-0099_maintain_revoke.sql"), true);
  assert.equal(inScope(PENDING_DIR, "README.md"), false);
  assert.equal(inScope(PROMOTED_DIR, "meta"), false);
  // The newest applied migration lacks the lines, and the rule leaves it alone.
  const applied = readFileSync(join(ROOT, PROMOTED_DIR, "0099_revoke_truncate_trigger_references.sql"), "utf8");
  assert.equal(timeoutProblems(applied).length, 2, "0099 does not carry the lines (it is applied and pinned)");
  assert.equal(scanRepository().some(([f]) => f.endsWith("/0099_revoke_truncate_trigger_references.sql")), false);
});
