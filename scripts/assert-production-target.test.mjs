// The target guard's four arms, in the REQUIRED check rather than in a
// transcript somebody has to find.
//
// WHY THIS IS WORTH A TEST AT ALL. The guard was INVERTED on 2026-09-04: it used
// to refuse production and now it requires production. A guard that only ever
// said no fails safe when it is wrong - the wrong database refuses and nothing
// happens. Inverted, being wrong means applying a migration to a database nobody
// is watching and reporting success. The arm that must never rot is the one that
// REFUSES a near-miss, so both near-misses are here: right project on the wrong
// port, and the right port on the wrong project.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GUARD = join(dirname(fileURLToPath(import.meta.url)), "assert-production-target.mjs");
const PROD_REF = "dfotoodqvmjhbdcxyaxf";

/** Runs the guard with a controlled environment. Returns {code, out}. */
function runGuard(env) {
  try {
    const out = execFileSync(process.execPath, [GUARD], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Not a credential: the password is a single letter and the host is not resolved. */
const url = (ref, port) => `postgres://postgres.${ref}:x@db.example.invalid:${port}/postgres`;

test("ACCEPTS production on the session pooler, and says what it saw", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url(PROD_REF, "5432") });
  assert.equal(r.code, 0);
  assert.match(r.out, /target verified/);
  assert.match(r.out, /ref: {2}dfotoodqvmjhbdcxyaxf/);
  assert.match(r.out, /port: 5432/);
});

test("REFUSES the right project on the transaction pooler", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url(PROD_REF, "6543") });
  assert.equal(r.code, 2);
  assert.match(r.out, /REFUSING: port is "6543"/);
});

test("REFUSES another project on the right port", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url("someotherproject", "5432") });
  assert.equal(r.code, 2);
  assert.match(r.out, /REFUSING: project ref/);
});

test("REFUSES a local database, which is what the lane usually holds", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: "postgres://postgres:postgres@127.0.0.1:54622/postgres" });
  assert.equal(r.code, 2);
  assert.match(r.out, /REFUSING: project ref/);
});

test("REFUSES an unset environment, naming the variables and not their values", () => {
  const r = runGuard({});
  assert.equal(r.code, 2);
  assert.match(r.out, /neither DATABASE_URL_DIRECT nor DATABASE_URL is set/);
});

test("REFUSES an unparseable connection string WITHOUT echoing it", () => {
  const secret = "not-a-url-but-still-a-secret";
  const r = runGuard({ DATABASE_URL_DIRECT: secret });
  assert.equal(r.code, 2);
  assert.match(r.out, /could not be parsed as a URL/);
  // RULE 7. A malformed connection string is still a connection string.
  assert.ok(!r.out.includes(secret), "the guard must never echo the value it was given");
});

test("NEVER prints the password on the happy path either", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: `postgres://postgres.${PROD_REF}:s3cr3t-do-not-print@db.example.invalid:5432/postgres` });
  assert.equal(r.code, 0);
  assert.ok(!r.out.includes("s3cr3t-do-not-print"));
});
