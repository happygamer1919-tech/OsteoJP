// The EPI-01a measurement (scripts/db/measure-epi01a-episode-mapping.sql) is a
// READ ONLY, COUNTS ONLY profile GREEN runs on production before EPI-01a's first
// PR is built (the lead's dispatch S-1001-A, B6, 2026-10-01). Its transcript is
// pasted back into a session, so it must carry no patient data: these tests hold
// it to writing nothing and to printing only counts, never an id, a title, a
// name, a date or clinical text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL = readFileSync(join(ROOT, "scripts/db/measure-epi01a-episode-mapping.sql"), "utf8");

/** The SQL with comments and psql meta-commands removed. */
const codeOf = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l) && !/^\s*\\/.test(l))
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

/** No code line begins with a writing or session-changing verb. */
export function writeProblems(sql) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|SET|RESET|DO|BEGIN|ROLLBACK)\b/i.test(t)) {
      problems.push(`a statement that writes or changes the session: ${t.slice(0, 80)}`);
    }
  }
  return problems;
}

/**
 * The expressions each PRINTED select list carries: everything between `select`
 * and its `from`, for a `select` at the start of a line (column 0) or right after
 * a closing parenthesis. The file's convention: a printed query starts at column
 * 0, and a CTE body (which prints nothing) is indented, so it is not read here.
 */
function selectLists(sql) {
  const code = codeOf(sql);
  const lists = [];
  for (const m of code.matchAll(/(?:^|\n|\)\s*)select\s+(?!distinct imported_entity_id)([\s\S]*?)\n\s*from\s/gi)) lists.push(m[1]);
  return lists;
}

test("the measurement writes nothing and opens or ends no transaction of its own", () => {
  assert.deepEqual(writeProblems(SQL), []);
});

test("CONTROL: the write check is red on a writing line and on a BEGIN", () => {
  assert.equal(writeProblems("delete from clinical_records;").length, 1);
  assert.equal(writeProblems("begin;").length, 1);
});

test("its first query prints whether the transaction is READ ONLY", () => {
  assert.match(codeOf(SQL).split(";")[0], /current_setting\('transaction_read_only'\)/);
});

test("it prints counts only: no printed expression is an id, a title, a name, a date or a text column", () => {
  const lists = selectLists(SQL);
  assert.equal(lists.length, 8, `expected the eight printed select lists (row 0, sections 1, 2, 3, three in 4, and 5), found ${lists.length}`);
  for (const list of lists) {
    // A title is printed only through the bucket CASE, which can yield only the
    // two specialty names or the fixed word "other".
    const withoutBucket = list.replace(/case when (ce|e)\.title in \('Osteopatia', 'Fisioterapia'\) then (ce|e)\.title else '[^']*' end/g, "BUCKET");
    assert.doesNotMatch(withoutBucket, /\btitle\b/, `a title is printed outside the bucket: ${list.slice(0, 120)}`);
    for (const col of ["patient_id", "tenant_id", "episode_id", "supersedes_id", "imported_entity_id", "first_name", "last_name", "name", "created_at", "opened_at", "content"]) {
      const bare = new RegExp(`(^|,)\\s*[a-z]+\\.${col}\\s*(as\\s+\\w+\\s*)?(,|$)`, "i");
      assert.doesNotMatch(withoutBucket, bare, `${col} is printed bare: ${list.slice(0, 120)}`);
    }
  }
});

test("CONTROL: the printed-columns check is red on a bare id and on a bare title", () => {
  const leaky = (expr) => `select ${expr}\n from clinical_episodes ce;`;
  const check = (sql) => {
    for (const list of selectLists(sql)) {
      const withoutBucket = list.replace(/case when (ce|e)\.title in \('Osteopatia', 'Fisioterapia'\) then (ce|e)\.title else '[^']*' end/g, "BUCKET");
      if (/\btitle\b/.test(withoutBucket)) return "title";
      if (/(^|,)\s*[a-z]+\.patient_id\s*(as\s+\w+\s*)?(,|$)/i.test(withoutBucket)) return "id";
    }
    return null;
  };
  assert.equal(check(leaky("ce.title, count(*)")), "title");
  assert.equal(check(leaky("ce.patient_id, count(*)")), "id");
  assert.equal(check(leaky("count(distinct ce.patient_id) as patients")), null);
});
