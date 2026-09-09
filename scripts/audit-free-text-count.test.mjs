// The audit free-text sweep: READ ONLY, COUNTS ONLY, and its definition of
// "free text" is the SAME ONE THE CODE ENFORCES.
//
// ===========================================================================
// WHY A TEST FOR A .sql FILE
// ===========================================================================
// It is pasted into a PRODUCTION SQL console by a person who does not read SQL,
// and nobody runs it until the one morning it matters. Two properties have to
// hold at that moment and neither is visible by reading the grid it prints:
//
//   1. IT WRITES NOTHING. It runs against the live database with an owner
//      connection, and the thing it is measuring is an APPEND-ONLY table.
//   2. IT PRINTS NO METADATA VALUE. The whole point of measuring separately is
//      that the answer is "how much", and answering it must not spread the
//      thing being measured. A well-meant edit adding the value "so we can see
//      what it was" would put a clinical note in a result grid and then in a
//      chat paste - the exact defect the sweep exists to size.
//
// AND A THIRD THAT IS SPECIFIC TO THIS FILE. The number it returns is only
// meaningful because it is the number of rows the new guard in
// `apps/web/lib/scheduling/audit.ts` would now reject. Two definitions that
// drift apart produce two numbers that answer different questions, and nobody
// would know which one they were reading. The coupling is asserted below.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SQL_PATH = path.join(REPO, "scripts/audit-free-text-count.sql");
const GUARD_PATH = path.join(REPO, "apps/web/lib/scheduling/audit.ts");

const sql = fs.readFileSync(SQL_PATH, "utf8");
const guard = fs.readFileSync(GUARD_PATH, "utf8");

/** Statements only - comments stripped. The header explains at length that this
 *  file performs no DML; a keyword scan must not read the explanation. */
const statements = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

/** The same with string literals blanked. This report LABELS its output with
 *  `\echo '=== 2. BY ACTION...'`, and a keyword scan would read those labels as
 *  SQL. */
const keywordScan = statements.replace(/'(?:[^']|'')*'/g, "''");

test("it is READ ONLY - no DML, no DDL, no transaction control", () => {
  const forbidden = [
    "INSERT", "UPDATE", "DELETE", "TRUNCATE", "DROP", "ALTER", "CREATE",
    "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "BEGIN", "COPY", "VACUUM",
    "REFRESH", "CALL", "DO",
  ];
  for (const word of forbidden) {
    const hits = keywordScan.match(new RegExp(`\\b${word}\\b`, "gi")) ?? [];
    assert.equal(
      hits.length,
      0,
      `audit-free-text-count.sql contains the statement keyword ${word}. This script is ` +
        "pasted into a PRODUCTION console against an APPEND-ONLY table; it must only ever SELECT.",
    );
  }
});

test("the CONTROL: the scan can see a write when there is one", () => {
  // Without this the test above passes on an empty string and on a file that
  // failed to load.
  const planted = "SELECT 1;\nUPDATE audit_log SET metadata = '{}';\n";
  assert.equal(
    (planted.match(/\bUPDATE\b/gi) ?? []).length,
    1,
    "the read-only scan cannot detect a write at all",
  );
});

test("it SELECTs, so it is not read-only by being empty", () => {
  const selects = statements.match(/\bSELECT\b/gi) ?? [];
  assert.ok(selects.length >= 6, `expected a SELECT per section, found ${selects.length}`);
});

/* ---------------- COUNTS ONLY. NO METADATA VALUE REACHES THE GRID. ------- */

/**
 * Every place the sweep touches an extracted metadata STRING, and the only four
 * things it is allowed to do with one.
 *
 * A REGEX OVER "OUTPUT SELECT LISTS" WAS THE FIRST ATTEMPT AND IT WAS WRONG:
 * section 1's outer SELECT has no FROM at all (it is scalar subqueries), so an
 * anchored `^select ... ^from` match ran past the end of its own section and
 * read the NEXT section's CTE as output. The context scan below needs no notion
 * of where a section begins, which is why it is the one that ships.
 */
function extractionContexts(text) {
  const out = [];
  for (const m of text.matchAll(/#>>|\bval\b/g)) {
    const at = m.index ?? 0;
    out.push({
      token: m[0],
      before: text.slice(Math.max(0, at - 30), at),
      after: text.slice(at, at + 60),
      line: text.slice(text.lastIndexOf("\n", at) + 1, text.indexOf("\n", at)),
    });
  }
  return out;
}

/** MEASURED, SHAPE-TESTED, or NAMED AS A CTE COLUMN. There is no fourth. */
function isSafeUse({ before, after }) {
  if (/length\s*\(\s*$/.test(before)) return true;              // length(val) / length(x #>> '{}')
  if (/length\s*\(\s*\(?\s*[\w.]*\s*$/.test(before)) return true; // length(s.v #>> '{}')
  if (/^\S*\s*!?~/.test(after)) return true;                    // val ~ '\s' / val !~ '\s'
  if (/^#>>\s*'\{\}'\s*\)?\s*!?~/.test(after)) return true;      // (s.v #>> '{}') ~ '\s'
  if (/^#>>\s*'\{\}'\s+as\s+val\b/i.test(after)) return true;   // ... #>> '{}' as val
  if (/\bas\s+$/i.test(before)) return true;                    // as val
  return false;
}

test("no metadata VALUE is ever projected - every use is a length, a shape test or a CTE column", () => {
  // ==========================================================================
  // THE RULE, AND IT IS THE ONE THING IN THIS FILE THAT IS NOT COSMETIC
  // ==========================================================================
  // The sweep has to look INSIDE `metadata` to decide whether a value is prose.
  // Three uses of the extracted string are safe and there is no fourth:
  //
  //   length(val) > 64     a MEASUREMENT - an integer, never the string
  //   val ~ '\s'           a SHAPE TEST   - a boolean, never the string
  //   ... as val           a CTE COLUMN the two above are then applied to
  //
  // Anything else - `val as the_reason`, `select val`, a concatenation into a
  // label - puts a clinical note in a result grid and then in a chat paste,
  // which is the exact defect the sweep exists to SIZE rather than spread.
  const uses = extractionContexts(statements);
  assert.ok(uses.length > 10, `the scan found ${uses.length} metadata reads; the file has many more`);

  const offending = uses.filter((u) => !isSafeUse(u)).map((u) => u.line.trim());
  assert.deepEqual(
    offending,
    [],
    "audit-free-text-count.sql uses an extracted metadata value somewhere that is neither a " +
      "length, a shape test, nor a CTE column definition. This file must report COUNTS ONLY - " +
      "the values it counts ARE the clinical free text it exists to measure.",
  );
});

test("the CONTROL: the scan rejects a projected value when there is one", () => {
  // The test above passes trivially on a file with no metadata reads, and it
  // would also pass if `isSafeUse` started returning true for everything.
  const planted = "select\n  a.metadata #>> '{reason}' as the_reason,\n  count(*) as n\nfrom audit_log\n";
  const uses = extractionContexts(planted);
  assert.equal(uses.length, 1, "the extraction scan cannot see a bare read at all");
  assert.equal(isSafeUse(uses[0]), false, "the scan would have accepted a projected metadata value");
});

test("the CONTROL: the scan ACCEPTS the three safe shapes, so it is not just refusing everything", () => {
  // A scan that rejects every use would make the assertion above unfalsifiable
  // in the other direction: the file would be forced to stop measuring at all.
  const safe = [
    "where length(val) > 64",
    "where val ~ '\\s'",
    "select a.id, s.v #>> '{}' as val",
    "and (length(s.v #>> '{}') > 64 or (s.v #>> '{}') ~ '\\s')",
  ];
  for (const line of safe) {
    for (const u of extractionContexts(line)) {
      assert.equal(isSafeUse(u), true, `the scan refuses a legitimate measurement: ${line}`);
    }
  }
});

/* ---------------- THE COUPLING TO THE CODE'S OWN DEFINITION -------------- */

test("the guard exists and states the two questions in numbers this file can be checked against", () => {
  assert.match(guard, /AUDIT_STRING_MAX\s*=\s*64/,
    "apps/web/lib/scheduling/audit.ts no longer defines AUDIT_STRING_MAX = 64");
  assert.match(guard, /\/\\s\/\.test\(value\)/,
    "the guard no longer refuses a string containing whitespace");
});

test("the SQL asks the SAME two questions, with the SAME threshold", () => {
  // A drift here is silent and expensive: the owner would run a sweep whose
  // number is not the number of rows the code would now reject, and the
  // scrubbing decision would be taken against the wrong population.
  const lengthTests = statements.match(/length\s*\(\s*[\w.#>'{} ]*val[\w.#>'{} ]*\)\s*>\s*(\d+)/gi) ?? [];
  assert.ok(lengthTests.length >= 5, `expected a length test per section, found ${lengthTests.length}`);
  for (const t of lengthTests) {
    assert.match(t, />\s*64$/,
      `audit-free-text-count.sql tests a length threshold that is not 64: ${t}. ` +
        "The guard in apps/web/lib/scheduling/audit.ts uses 64.");
  }
  const whitespaceTests = statements.match(/~\s*'\\s'/g) ?? [];
  assert.ok(whitespaceTests.length >= 5,
    `expected a whitespace test per section, found ${whitespaceTests.length}`);
});

test("it walks EVERY DEPTH, not only the top level, and says so in a section of its own", () => {
  // A sweep that reads only `jsonb_each(metadata)` returns a confident zero for
  // a nested offender. Section 1 uses the recursive walk; 3b reports the
  // difference between the two so a reader knows when section 3 is incomplete.
  assert.match(statements, /jsonb_path_query\(\s*a\.metadata,\s*'\$\.\*\*'\s*\)/,
    "the sweep no longer walks nested metadata");
  assert.match(statements, /offenders_only_when_nested/,
    "section 3b, which reports what the top-level scan would have missed, is gone");
});

/* ---------------- THE CONTROL SECTION AND THE RUN RECIPE ---------------- */

test("it prints a CONTROL, because zero and broken look identical", () => {
  assert.match(statements, /audit_rows_total/,
    "section 0's control line is gone: a sweep that returns no offenders looks exactly " +
      "the same whether it works or the table is empty or the query is wrong");
  assert.match(statements, /distinct_actions/);
});

test("the run recipe names THIS file and goes through the production guard", () => {
  // SR-61: a script the owner is asked to run must be runnable as written.
  assert.match(sql, /scripts\/audit-free-text-count\.sql/,
    "the header recipe does not name this file, so pasting it runs something else");
  assert.match(sql, /assert-production-target\.mjs/,
    "the recipe skips the production target guard");
  assert.ok(
    fs.existsSync(path.join(REPO, "scripts/assert-production-target.mjs")),
    "the recipe names scripts/assert-production-target.mjs and it is not on disk",
  );
});
