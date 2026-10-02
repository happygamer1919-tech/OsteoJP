// The 0100 measurement (scripts/db/measure-0100-maintain.sql) is a READ ONLY
// profile GREEN runs on production before the 0100 migration is written (the
// lead's ruling S-1001-A R3, 2026-10-01). These tests hold the file to that: it
// writes nothing, it prints the read-only row first, it covers the four roles
// and the eight privileges the ruling names, and it carries its own control.
//
// The server is the real guard: GREEN's block runs the file inside
// `begin read only`, so a write would be refused. This test catches a writing
// line before it ever reaches a sitting.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/db/measure-0100-maintain.sql";
const SQL = readFileSync(join(ROOT, FILE), "utf8");

/** The SQL with comments and psql meta-commands removed. */
const codeOf = (sql) =>
  sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l) && !/^\s*\\/.test(l))
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

/** No code line begins with a writing verb, and no string holds a writing statement. */
export function writeProblems(sql) {
  const problems = [];
  for (const line of codeOf(sql).split("\n")) {
    const t = line.trim();
    if (/^(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|VACUUM|ANALYZE|CLUSTER|REINDEX|REFRESH|LOCK|COMMIT|SET|RESET|DO|BEGIN|ROLLBACK)\b/i.test(t)) {
      problems.push(`a statement that writes or changes the session: ${t.slice(0, 80)}`);
    }
    for (const m of t.matchAll(/'([^']*)'/g)) {
      if (/^\s*(INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+\S+\s+SET|TRUNCATE\s|MERGE\s+INTO|COPY\s|GRANT\s|REVOKE\s)/i.test(m[1])) {
        problems.push(`a writing statement in a string: '${m[1].slice(0, 60)}'`);
      }
    }
  }
  return problems;
}

test("the measurement writes nothing and opens or ends no transaction of its own", () => {
  assert.deepEqual(writeProblems(SQL), []);
});

test("CONTROL: the write check is red on a writing line, a writing string and a BEGIN", () => {
  assert.equal(writeProblems("revoke maintain on t from authenticated;").length, 1);
  assert.equal(writeProblems("select 'grant select on t to anon';").length, 1);
  assert.equal(writeProblems("begin;").length, 1);
  assert.equal(writeProblems("-- revoke in a comment\nselect 1;").length, 0);
});

test("its first query prints whether the transaction is READ ONLY", () => {
  const first = codeOf(SQL).split(";")[0];
  assert.match(first, /current_setting\('transaction_read_only'\)/);
});

test("it covers the four roles the ruling names, the owner as its control, and all eight privileges", () => {
  for (const role of ["'PUBLIC'", "'anon'", "'authenticated'", "'service_role'", "'postgres (control)'"]) {
    assert.ok(SQL.split(role).length - 1 >= 2, `${role} is not in both the GRANTED and the EFFECTIVE profile`);
  }
  for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
    assert.equal(SQL.split(`privilege_type = '${p}'`).length - 1, 1, `GRANTED does not count ${p} once`);
    assert.equal(SQL.split(`has_table_privilege(p.rolname, t.oid, '${p}')`).length - 1, 1, `EFFECTIVE does not count ${p} once`);
  }
});

test("it reads only public's ordinary and partitioned tables, and pg_default_acl for public and global", () => {
  assert.equal(SQL.split("n.nspname = 'public' and c.relkind in ('r', 'p')").length - 1, 2);
  assert.match(SQL, /from pg_default_acl d[\s\S]*where d\.defaclnamespace = 0 or n\.nspname = 'public'/);
});
