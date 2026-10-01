// The journal reader's target check, in the REQUIRED check.
//
// packages/db/scripts/read-applied-migrations.mjs reads drizzle.__drizzle_migrations,
// which only production uses. Until 2026-09-30 it refused unless the connection
// string CONTAINED the production ref, and a rehearsal subagent passed that on a
// local throwaway by adding the ref as an application_name label
// (INC-rehearsal-subagent-passed-the-reader-guard). It now runs the shared
// checkProductionTarget() from scripts/production-target.mjs, the one the target
// guard runs, whose every arm is tested in assert-production-target.test.mjs.
//
// THIS FILE NEVER NAMES THE PRODUCTION HOST TO THE READER. The reader has
// database code, so a mutation that removed its check would make any string here
// a real connection. Every string below therefore points at 127.0.0.1 on port 1
// (closed) or at a reserved `.invalid` host that never resolves. A broken check
// fails fast and contacts nothing real (memory rule: a guard test must never name
// a real host; the G1 incident of 2026-09-28). The host, database, port and query
// arms of the shared check are proven in assert-production-target.test.mjs,
// whose guard has no database code. The accepting arm is not run anywhere.
//
// NO PRODUCTION NAME IS SPELLED HERE. The ref comes from the module under test
// (the target guard's tests pin it by sha256).

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION } from "./production-target.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const READER = join(HERE, "..", "packages", "db", "scripts", "read-applied-migrations.mjs");
const REF = PRODUCTION.ref;

/** A self-declared fixture password (scripts/secret-scan.mjs reads it as one). Never a credential. */
const PW = "s3cr3t-do-not-print";

/** Runs the reader with a controlled environment and a short timeout. Returns {code, out}. */
function runReader(env) {
  try {
    const out = execFileSync(process.execPath, [READER], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      // A refusal exits at once. Anything slower is a connection attempt.
      timeout: 15_000,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}`, signal: e.signal };
  }
}

function assertRefused(r) {
  assert.equal(r.signal ?? null, null, `the reader did not exit by itself (a connection attempt?): ${r.out}`);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /^REFUSED: this script reads drizzle\.__drizzle_migrations/m);
  assert.ok(!r.out.includes(PW), "the reader must never echo the password");
  assert.doesNotMatch(r.out, /journal rows on production/);
}

test("the reader runs the shared check, and loads the driver only after it passes", () => {
  // Code only: the reader's own comments quote the old substring test on purpose.
  const src = readFileSync(READER, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /import \{[^}]*checkProductionTarget[^}]*\} from "\.\.\/\.\.\/\.\.\/scripts\/production-target\.mjs";/);
  assert.doesNotMatch(src, /^\s*import\s+postgres\b/m, "a static import would load the driver before the check");
  assert.doesNotMatch(src, /\.includes\(PROD_REF\)/, "the substring test is gone");
  const check = src.indexOf("checkProductionTarget(url)");
  const exit = src.indexOf("process.exit(2)", check);
  const driver = src.indexOf('await import("postgres")');
  assert.ok(check > 0 && exit > check && driver > exit, "check, then refusal, then the driver: in that order");
});

test("REFUSES the incident: a local database carrying the ref as an application_name label", () => {
  assertRefused(runReader({ DATABASE_URL_DIRECT: `postgres://postgres:${PW}@127.0.0.1:1/postgres?application_name=${REF}` }));
});

test("REFUSES the ref in the username on a local host", () => {
  assertRefused(runReader({ DATABASE_URL_DIRECT: `postgres://postgres.${REF}:${PW}@127.0.0.1:1/postgres` }));
});

test("REFUSES a lookalike host carrying the ref in its name", () => {
  assertRefused(runReader({ DATABASE_URL_DIRECT: `postgres://postgres.${REF}:${PW}@${REF}.pooler.invalid:5432/postgres` }));
});

test("REFUSES a second @ that would send psql to a local host first", () => {
  assertRefused(runReader({ DATABASE_URL_DIRECT: `postgres://postgres.${REF}:x@127.0.0.1:1,y@db.example.invalid:5432/postgres` }));
});

test("reads DATABASE_URL_DIRECT before DATABASE_URL, as the target guard does", () => {
  // Both are refused here; the order is proven by the message the first one earns.
  const r = runReader({
    DATABASE_URL_DIRECT: `postgres://postgres:${PW}@127.0.0.1:1/postgres`,
    DATABASE_URL: `postgres://postgres.${REF}:${PW}@db.example.invalid:6543/postgres`,
  });
  assertRefused(r);
  assert.match(r.out, /the target's ref is not /, "DATABASE_URL_DIRECT (ref postgres) was read, not DATABASE_URL (port 6543)");
});

test("REFUSES an unset environment, and names no value", () => {
  const r = runReader({});
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no DATABASE_URL_DIRECT \/ DATABASE_URL in the environment/);
});

test("REFUSES a ?database= query, which postgres.js would connect to instead of /postgres", () => {
  assertRefused(runReader({ DATABASE_URL_DIRECT: `postgres://postgres.${REF}:${PW}@db.example.invalid:5432/postgres?database=rehearsal` }));
});

