// EVERY MIGRATION FROM 0100 ON STARTS BY BOUNDING ITS OWN LOCK WAIT AND RUN TIME.
//
// The lead's ruling of 2026-10-01, option (b): "SET LOCAL at the top of every
// migration from 0100, gate-enforced". Dispatch S-1001-A, B2: "SET LOCAL
// lock_timeout and statement_timeout at the top of every migration numbered 0100
// or higher; the gate refuses a file without them."
//
// WHY SET LOCAL IN THE FILE, AND NOT ON THE SESSION. drizzle-kit migrate runs the
// whole pending set inside ONE transaction (drizzle-orm pg-core dialect.migrate:
// session.transaction, then tx.execute per `--> statement-breakpoint` chunk), so
// a SET LOCAL at the top of a file holds for the rest of that transaction, through
// any pooler. The session route does not reach production: postgres.js ignores
// PGOPTIONS, and Supabase's session pooler forwards only search_path from a
// client's startup options (measured for #1510's observer, which printed "NOT
// APPLIED"). Under the Supabase CLI in CI each file runs in its own implicit
// transaction: SET LOCAL there prints a 25P01 WARNING, not an error, and still
// holds for the rest of the file (R4 round 1 measured both).
//
// THE VALUES. They are the lead's to change: one line here, in a GATE-CHANGE once
// the manifest freezes this file.
//   statement_timeout '60s', FROM THE SITTINGS. The time from the last pre-apply
//     transcript to the applied marker, read from the sittings' file mtimes on the
//     apply machine (one-second resolution, so a reading of N s means under
//     N + 1 s): 0094 4 s (2026-09-29), 0095 7 s (2026-09-29), and 3 s each for
//     0096, 0097, 0098 and 0099 (2026-09-30 and 2026-10-01). Each envelope holds
//     node's start, the connection, drizzle-kit and every statement, 0098's index
//     build over 117,314 ledger rows included, so no statement ran 8 s. 60 s is
//     about seven and a half times that bound: a margin chosen, not measured. A table rewrite, a backfill UPDATE or a
//     constraint validation on the largest table is what could outgrow it.
//   lock_timeout '5s', A JUDGMENT, NOT A MEASUREMENT. Nothing in those sittings
//     measured a lock wait. A migration that cannot take its lock in 5 s fails,
//     the transaction rolls back and nothing is applied, rather than queueing
//     behind a long transaction while every query on that table queues behind IT.
//     While it waits, a client whose own statement_timeout is under 5 s can fail
//     instead of waiting (Supabase's documented default for `anon` is 3 s; this
//     project's role settings were not read): one more reason sittings run while
//     the clinics are closed.
//   statement_timeout bounds each statement; lock_timeout bounds each attempt to
//     take a lock, so a statement taking several locks can wait up to 5 s on each.
//     Neither limits how long the locks taken are held: all are held until the
//     single COMMIT of the pending set.
//
// WHAT IS REFUSED, BEYOND A MISSING LINE, in any letter case. A later statement
// whose text names either setting (SET, RESET, set_config, ALTER ROLE/DATABASE/
// FUNCTION ... SET, UPDATE pg_settings, an EXECUTEd string; it also refuses a
// string literal that merely names one, which is loud and harmless); RESET ALL
// anywhere, inside a DO body or an EXECUTEd string included, and every DISCARD; and all transaction control (BEGIN, COMMIT,
// ROLLBACK, END, ABORT, START TRANSACTION, SAVEPOINT, RELEASE, PREPARE
// TRANSACTION). Some of these undo a bound or end the transaction that carries
// them (RESET ALL, DISCARD ALL, COMMIT, ROLLBACK, END, ABORT, PREPARE
// TRANSACTION); the rest only warn or do nothing inside drizzle's one transaction
// (BEGIN, SAVEPOINT, RELEASE, the narrower DISCARDs). None has a place in a
// migration, so the rule refuses them all rather than reason about each. A
// migration that needs a longer bound for one statement asks the lead for a
// ruled exception; it does not override the bound silently.
// WHAT NO STATIC RULE CAN SEE: the match is on the text as written, so a setting
// name built at run time (concatenation, format()) is not seen, and neither is a
// name spelled with escapes anywhere, an EXECUTEd string included: a top-level
// SET U&"..." name, or an E'' or U&'' literal passed to set_config. Review is
// what catches those; this rule makes the plain and the accidental forms impossible.
//
// WHAT IS IN SCOPE, FAILING CLOSED. In packages/db/migrations: every `.sql` file
// (any case) whose leading number is 100 or more, or that has no leading number at
// all; and every `.sql` file there must carry the strict name NNNN_lowercase.sql,
// so a name the scope rule might misread is refused rather than skipped. In
// packages/db/migrations-pending: every `.sql` file, and no subfolder. A symbolic
// link in either folder is refused: drizzle would read the file it points at,
// wherever that is. Files
// numbered below 0100 are NOT changed and NOT checked for the lines: they are
// applied, and their bytes are what every apply document pins.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMOTED_DIR = "packages/db/migrations";
const PENDING_DIR = "packages/db/migrations-pending";
const FIRST = 100;
const STRICT_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

export const LOCK_TIMEOUT = "5s";
export const STATEMENT_TIMEOUT = "60s";
export const REQUIRED = Object.freeze([
  `SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`,
  `SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}';`,
]);

const isSql = (file) => file.toLowerCase().endsWith(".sql");

/** The leading number of a migration file name, or null when it has none. */
export function numberOf(file) {
  const m = /^(\d+)_/.exec(file);
  return m ? Number(m[1]) : null;
}

/** Whether the lines are required: any pending .sql; a promoted .sql numbered 100 or more, or not numbered at all. */
export function inScope(dir, file) {
  if (!isSql(file)) return false;
  if (dir === PENDING_DIR) return true;
  const n = numberOf(file);
  return n === null || n >= FIRST;
}

/** drizzle's chunk separator. drizzle-orm's migrator splits each file on this literal text, wherever it stands. */
const MARKER = "--> statement-breakpoint";

/**
 * The statements of a SQL file, as the applier reads it. First the file is split
 * on drizzle's marker exactly as drizzle-orm's migrator splits it: on the literal
 * text, wherever it stands, so SQL after a marker on the same line is the start of
 * the next chunk and RUNS (it is not a comment). Then each chunk is scanned as
 * Postgres reads it: line comments, ended by LF or a lone CR as Postgres ends them; NESTED block comments (Postgres nests them);
 * single-quoted strings ('' escapes); E'' strings (backslash escapes too);
 * double-quoted names; dollar quotes, $$ or $tag$, opened only where a `$` does
 * not follow an identifier character (`a$$` is a name, not a quote); a carriage
 * return as whitespace; split on `;` outside quotes; whitespace collapsed; empty
 * statements dropped; each ending in its own `;`.
 */
export function statementsOf(sql) {
  return sql.split(MARKER).flatMap((chunk) => scanChunk(chunk));
}

const IDENT = /[A-Za-z0-9_$\u0080-\uffff]/;

/** The statements of one chunk, scanned as Postgres reads them (see statementsOf). */
function scanChunk(sql) {
  const stmts = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  const push = () => {
    const s = cur.replace(/\s+/g, " ").trim();
    if (s !== "") stmts.push(`${s};`);
    cur = "";
  };
  while (i < n) {
    const c = sql[i];
    const d = sql[i + 1];
    if (c === "-" && d === "-") {
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      cur += " ";
      continue;
    }
    if (c === "/" && d === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      cur += " ";
      continue;
    }
    const prev = i > 0 ? sql[i - 1] : "";
    if ((c === "E" || c === "e") && d === "'" && !IDENT.test(prev)) {
      let j = i + 2;
      while (j < n) {
        if (sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      const end = j < 0 ? n : j + 1;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "$" && !IDENT.test(prev)) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const j = sql.indexOf(m[0], i + m[0].length);
        const end = j < 0 ? n : j + m[0].length;
        cur += sql.slice(i, end);
        i = end;
        continue;
      }
    }
    if (c === ";") {
      push();
      i++;
      continue;
    }
    cur += c === "\r" ? " " : c;
    i++;
  }
  push();
  return stmts;
}

const TOUCHES_A_BOUND = /\b(lock_timeout|statement_timeout)\b/i;
const UNDOES_SETTINGS = /\bRESET\s+ALL\b|^DISCARD\b/i;
const TRANSACTION_CONTROL = /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START\s+TRANSACTION|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION)\b/i;

/** Why a migration in scope fails the rule, or [] when it passes. */
export function timeoutProblems(sql) {
  const stmts = statementsOf(sql);
  const problems = [];
  REQUIRED.forEach((want, i) => {
    if (stmts[i] !== want) {
      problems.push(`statement ${i + 1} must be exactly ${want} and is ${stmts[i] === undefined ? "missing" : stmts[i]}`);
    }
  });
  stmts.forEach((s, i) => {
    if (i >= REQUIRED.length && TOUCHES_A_BOUND.test(s)) {
      problems.push(`statement ${i + 1} touches lock_timeout or statement_timeout after the top: ${s.slice(0, 80)}`);
    }
    if (UNDOES_SETTINGS.test(s)) problems.push(`statement ${i + 1} is RESET ALL or DISCARD, which has no place in a migration: ${s.slice(0, 80)}`);
    if (TRANSACTION_CONTROL.test(s)) {
      problems.push(`statement ${i + 1} is transaction control, which has no place inside drizzle's one transaction: ${s.slice(0, 80)}`);
    }
  });
  return problems;
}

/** Every problem under `root`, as [path, problems], for each file the rule reads. */
export function scan(root) {
  const out = [];
  for (const entry of readdirSync(join(root, PROMOTED_DIR), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) {
      out.push([`${PROMOTED_DIR}/${entry.name}`, ["a symbolic link in the migrations folder: drizzle would read the file it points at"]]);
      continue;
    }
    if (!entry.isFile() || !isSql(entry.name)) continue;
    const problems = [];
    if (!STRICT_NAME.test(entry.name)) problems.push(`the name is not NNNN_lowercase.sql, so the scope rule could misread it`);
    if (inScope(PROMOTED_DIR, entry.name)) problems.push(...timeoutProblems(readFileSync(join(root, PROMOTED_DIR, entry.name), "utf8")));
    if (problems.length > 0 || inScope(PROMOTED_DIR, entry.name)) out.push([`${PROMOTED_DIR}/${entry.name}`, problems]);
  }
  for (const entry of readdirSync(join(root, PENDING_DIR), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) {
      out.push([`${PENDING_DIR}/${entry.name}`, ["a symbolic link in migrations-pending: the file it points at would be promoted unread"]]);
      continue;
    }
    if (entry.isDirectory()) {
      out.push([`${PENDING_DIR}/${entry.name}/`, ["a subfolder in migrations-pending: pending files sit flat, where this rule reads them"]]);
      continue;
    }
    if (!isSql(entry.name)) continue;
    out.push([`${PENDING_DIR}/${entry.name}`, timeoutProblems(readFileSync(join(root, PENDING_DIR, entry.name), "utf8"))]);
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

/** Run `fn` against a scratch repository root holding the two migration folders. */
function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), "migration-timeouts-"));
  try {
    mkdirSync(join(root, PROMOTED_DIR, "meta"), { recursive: true });
    mkdirSync(join(root, PENDING_DIR), { recursive: true });
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("every migration in scope starts with the two SET LOCAL lines and undoes neither, and every promoted name is strict", () => {
  const scanned = scanRepository();
  const failing = scanned.filter(([, p]) => p.length > 0).map(([f, p]) => `${f}: ${p.join("; ")}`);
  assert.deepEqual(failing, [], `a migration fails the rule:\n${failing.join("\n")}`);
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
  assert.ok(timeoutProblems(`SELECT 1;\n${GOOD}`).length >= 2, "the lines after another statement are not at the top");
  assert.equal(timeoutProblems(GOOD.replace(`'${LOCK_TIMEOUT}'`, "'0'")).length, 1, "lock_timeout 0 disables it");
  assert.equal(timeoutProblems(GOOD.replace(`'${STATEMENT_TIMEOUT}'`, "'0'")).length, 1, "statement_timeout 0 disables it");
  assert.equal(timeoutProblems(GOOD.replace("SET LOCAL lock_timeout", "SET lock_timeout")).length, 1, "a session SET outlives the transaction");
  assert.ok(timeoutProblems(GOOD.replace(REQUIRED[0], `-- ${REQUIRED[0]}`)).length >= 2, "commented out");
  assert.ok(timeoutProblems(GOOD.replace(REQUIRED[0], `/* ${REQUIRED[0]} */`)).length >= 2, "inside a block comment");
});

test("CONTROL: a later statement that undoes a bound, or any transaction control, is refused", () => {
  for (const later of [
    "SET LOCAL lock_timeout = 0;",
    "SET statement_timeout = 0;",
    "RESET lock_timeout;",
    "SET LOCAL statement_timeout TO DEFAULT;",
    "SELECT set_config('lock_timeout', '0', true);",
    "DO $$ BEGIN EXECUTE 'SET LOCAL statement_timeout = 0'; END $$;",
    "RESET ALL;",
    "DISCARD ALL;",
    "COMMIT;",
    "BEGIN;",
    "ROLLBACK;",
    "END;",
    "START TRANSACTION;",
    "SAVEPOINT s1;",
  ]) {
    assert.equal(timeoutProblems(`${GOOD}\n--> statement-breakpoint\n${later}`).length, 1, `not refused after the top: ${later}`);
  }
});

test("CONTROL: comments the old stripper misread are read as Postgres reads them", () => {
  // Postgres nests block comments, so neither SET inside runs: refused.
  assert.ok(timeoutProblems(`/* outer /* inner */ ${REQUIRED.join("\n")} */\n${GOOD.split("\n").slice(6).join("\n")}`).length >= 2);
  // A `/*` inside a line comment opens nothing; the ALTER runs before the lines: refused.
  const hidden = ["-- reads packages/db/migrations/*", "ALTER TABLE public.example ADD COLUMN x int;", "-- apps/*/", GOOD].join("\n");
  assert.ok(timeoutProblems(hidden).length >= 2, "an ALTER before the lines, between two line comments holding /* and */");
  // A `--` inside a string opens no comment, so the SET after it on the same line runs: refused.
  const quoted = `${GOOD}\n--> statement-breakpoint\nCOMMENT ON TABLE public.example IS 'x -- y'; SET statement_timeout = 0;`;
  assert.equal(timeoutProblems(quoted).length, 1, "a SET hidden behind a -- inside a string");
});

test("CONTROL: SQL after a breakpoint marker on the same line runs in drizzle, so it is read, not skipped", () => {
  // drizzle-orm's migrator splits on the literal marker; the rest of that line is the next chunk.
  assert.equal(timeoutProblems(`${GOOD}\n--> statement-breakpoint RESET ALL;`).length, 1, "a RESET ALL after a marker on its line");
  assert.ok(timeoutProblems(`--> statement-breakpoint ALTER TABLE public.example ADD COLUMN x int;\n${GOOD}`).length >= 2, "an ALTER before the lines, after a marker on its line");
  assert.deepEqual(statementsOf(`SELECT 1;--> statement-breakpoint SELECT 2;`), ["SELECT 1;", "SELECT 2;"]);
});

test("CONTROL: each quoting form is read as Postgres reads it, so nothing after it hides", () => {
  const after = (tail) => timeoutProblems(`${GOOD}\n--> statement-breakpoint\n${tail}`).length;
  // An E'' string whose backslash escapes a quote: the string ends at the real quote, and the COMMIT after it is seen.
  assert.equal(after("COMMENT ON TABLE public.example IS E'it\\'s'; COMMIT;"), 1, "COMMIT after an E'' string with an escaped quote");
  // A $ inside a name opens no dollar quote, so the COMMIT between two such names is seen.
  assert.equal(after("SELECT 1 AS x$$; COMMIT; SELECT 1 AS y$$;"), 1, "COMMIT between names ending in $$");
  // A -- inside a double-quoted name opens no comment, so the COMMIT after it is seen.
  assert.equal(after('CREATE TABLE public."a--b" (id int); COMMIT;'), 1, "COMMIT after a double-quoted name holding --");
  // A tagged dollar quote holds its own ; and keywords: the body is one statement and is not refused.
  assert.equal(after("DO $fn$ BEGIN RAISE NOTICE 'a; b'; END $fn$;"), 0, "a $fn$ body with ; and BEGIN/END inside");
  // ...and the statement after a tagged dollar quote is seen.
  assert.equal(after("DO $fn$ BEGIN PERFORM 1; END $fn$; COMMIT;"), 1, "COMMIT after a $fn$ body");
});

test("CONTROL: letter case does not matter to the refusals, and every transaction-control word is refused", () => {
  const after = (tail) => timeoutProblems(`${GOOD}\n--> statement-breakpoint\n${tail}`).length;
  for (const tail of ["commit;", "Reset All;", "discard plans;", "abort;", "release s1;", "prepare transaction 'x';", "Start Transaction;", "savepoint s1;", "set local LOCK_TIMEOUT = 0;"]) {
    assert.equal(after(tail), 1, `not refused: ${tail}`);
  }
  // The two lines themselves are matched exactly, case included: a lowercase line at the top is refused.
  assert.equal(timeoutProblems(GOOD.replace(REQUIRED[0], REQUIRED[0].toLowerCase())).length, 1, "a lowercase first line");
});

test("CONTROL: the gaps R4 round 3 named are closed", () => {
  const after = (tail) => timeoutProblems(`${GOOD}\n--> statement-breakpoint\n${tail}`).length;
  // Postgres ends a line comment at a lone CR too, so the COMMIT after it runs: refused.
  assert.equal(after("-- a note\rCOMMIT;"), 1, "a COMMIT after a comment ended by a lone CR");
  // RESET ALL reverts both bounds wherever it runs: inside a DO body, or an EXECUTEd string.
  assert.equal(after("DO $$ BEGIN RESET ALL; END $$;"), 1, "RESET ALL inside a DO body");
  assert.equal(after("DO $$ BEGIN EXECUTE 'RESET ALL'; END $$;"), 1, "RESET ALL in an EXECUTEd string");
  // A setting changed by something other than SET is refused by its name.
  assert.equal(after("ALTER ROLE authenticated SET statement_timeout = 0;"), 1, "ALTER ROLE ... SET");
  assert.equal(after("UPDATE pg_settings SET setting = '0' WHERE name = 'lock_timeout';"), 1, "UPDATE pg_settings");
  // U&'' strings and U&"" names use the same quote-doubling rule, so what follows them is seen.
  assert.equal(after("SELECT U&'d\\0061t\\+000061'; COMMIT;"), 1, "COMMIT after a U&'' string");
  assert.equal(after('CREATE TABLE public.U&"d\\0061t" (id int); COMMIT;'), 1, "COMMIT after a U&\"\" name");
  withRoot((root) => {
    writeFileSync(join(root, PROMOTED_DIR, "no_number.sql"), "REVOKE MAINTAIN ON public.example FROM authenticated;");
    writeFileSync(join(root, PROMOTED_DIR, "10000_five_digits.sql"), "REVOKE MAINTAIN ON public.example FROM authenticated;");
    const result = Object.fromEntries(scan(root));
    assert.equal(result[`${PROMOTED_DIR}/no_number.sql`].length, 3, "an unnumbered file is read: its name and both missing lines");
    assert.equal(result[`${PROMOTED_DIR}/10000_five_digits.sql`].length, 3, "a five-digit file is read: its name and both missing lines");
  });
});

test("CONTROL: a symbolic link in either folder is refused, whatever it points at", () => {
  withRoot((root) => {
    const target = join(root, "elsewhere.sql");
    writeFileSync(target, GOOD);
    symlinkSync(target, join(root, PROMOTED_DIR, "0100_linked.sql"));
    symlinkSync(target, join(root, PENDING_DIR, "NEXT-AFTER-0100_linked.sql"));
    const result = Object.fromEntries(scan(root));
    assert.equal(result[`${PROMOTED_DIR}/0100_linked.sql`].length, 1);
    assert.equal(result[`${PENDING_DIR}/NEXT-AFTER-0100_linked.sql`].length, 1);
  });
});

test("GREEN: comments, blank lines, breakpoints, CRLF, quotes and spacing around correct lines are accepted", () => {
  const spaced = GOOD.replace(REQUIRED[0], `SET   LOCAL\n  lock_timeout = '${LOCK_TIMEOUT}' ;  -- bound the lock wait`);
  assert.deepEqual(timeoutProblems(`/* a block comment first */\n${spaced}`), []);
  assert.deepEqual(timeoutProblems(`;\n${GOOD}`), [], "an empty statement before the lines changes nothing the server runs");
  assert.deepEqual(timeoutProblems(`-- see packages/db/migrations/*\n${GOOD}\n/* a later block comment */`), [], "a /* inside a header line comment");
  assert.deepEqual(timeoutProblems(GOOD.replace(/\n/g, "\r\n")), [], "CRLF line endings");
  assert.deepEqual(timeoutProblems(`${GOOD}\n--> statement-breakpoint\nCOMMENT ON TABLE public.example IS 'a; b -- c /* d';`), [], "quotes holding ; -- and /*");
  assert.deepEqual(
    timeoutProblems(`${GOOD}\n--> statement-breakpoint\nREVOKE MAINTAIN ON public.a FROM authenticated; REVOKE MAINTAIN ON public.b FROM authenticated;`),
    [],
    "two real statements in one chunk, as drizzle runs a chunk with several statements",
  );
});

test("SCOPE: names fail closed, pending files are read flat, and nothing below 0100 is checked for the lines", () => {
  assert.equal(inScope(PROMOTED_DIR, "0100_maintain_revoke.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "0123_some_change.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "0100_SAT-01_bookings.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "0100_x.SQL"), true);
  assert.equal(inScope(PROMOTED_DIR, "10000_x.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "no_number.sql"), true);
  assert.equal(inScope(PROMOTED_DIR, "0099_revoke_truncate_trigger_references.sql"), false);
  assert.equal(inScope(PROMOTED_DIR, "0000_empty_runaways.sql"), false);
  assert.equal(inScope(PENDING_DIR, "NEXT-AFTER-0099_maintain_revoke.sql"), true);
  assert.equal(inScope(PENDING_DIR, "README.md"), false);
  assert.equal(inScope(PROMOTED_DIR, "meta"), false);
  // The newest applied migration lacks the lines, and the rule leaves it alone.
  const applied = readFileSync(join(ROOT, PROMOTED_DIR, "0099_revoke_truncate_trigger_references.sql"), "utf8");
  assert.ok(timeoutProblems(applied).length >= 2, "0099 does not carry the lines (it is applied and pinned)");
  assert.equal(scanRepository().some(([f]) => f.endsWith("/0099_revoke_truncate_trigger_references.sql")), false);
});

test("CONTROL: the scan reads both folders, refuses loose names and pending subfolders, and passes a good 0100", () => {
  withRoot((root) => {
    writeFileSync(join(root, PROMOTED_DIR, "0099_applied.sql"), "REVOKE TRUNCATE ON public.example FROM authenticated;");
    writeFileSync(join(root, PROMOTED_DIR, "0100_good.sql"), GOOD);
    writeFileSync(join(root, PROMOTED_DIR, "0101_SAT-01_bad.sql"), GOOD);
    writeFileSync(join(root, PROMOTED_DIR, "0102_upper.SQL"), "REVOKE MAINTAIN ON public.example FROM authenticated;");
    writeFileSync(join(root, PENDING_DIR, "NEXT-AFTER-0102_bad.sql"), "REVOKE MAINTAIN ON public.example FROM authenticated;");
    writeFileSync(join(root, PENDING_DIR, "README.md"), "not a migration");
    mkdirSync(join(root, PENDING_DIR, "nested"));
    const result = Object.fromEntries(scan(root));
    assert.deepEqual(Object.keys(result).sort(), [
      `${PENDING_DIR}/NEXT-AFTER-0102_bad.sql`,
      `${PENDING_DIR}/nested/`,
      `${PROMOTED_DIR}/0100_good.sql`,
      `${PROMOTED_DIR}/0101_SAT-01_bad.sql`,
      `${PROMOTED_DIR}/0102_upper.SQL`,
    ]);
    assert.deepEqual(result[`${PROMOTED_DIR}/0100_good.sql`], []);
    assert.equal(result[`${PROMOTED_DIR}/0101_SAT-01_bad.sql`].length, 1, "a good body under a loose name is refused for the name");
    assert.equal(result[`${PROMOTED_DIR}/0102_upper.SQL`].length, 3, "the name, and both missing lines");
    assert.equal(result[`${PENDING_DIR}/NEXT-AFTER-0102_bad.sql`].length, 2);
    assert.equal(result[`${PENDING_DIR}/nested/`].length, 1);
  });
});
