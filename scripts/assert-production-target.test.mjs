// The target guard's arms, in the REQUIRED check rather than in a transcript
// somebody has to find.
//
// WHY THIS IS WORTH A TEST AT ALL. The guard was INVERTED on 2026-09-04: it used
// to refuse production and now it requires production. A guard that only ever
// said no fails safe when it is wrong - the wrong database refuses and nothing
// happens. Inverted, being wrong means applying a migration to a database nobody
// is watching and reporting success. The arm that must never rot is the one that
// REFUSES a near-miss, so every near-miss is here, each one wrong in exactly one
// part: the right project on the wrong port, the wrong project on the right
// port, and since 2026-09-30 the right project on the wrong host, the right host
// with the wrong database, and a string whose parts only look right to one of
// the parsers that read it (scripts/production-target.mjs says which).
//
// THE GUARD HAS NO DATABASE CODE. It parses a string, prints three lines and
// exits, so running it on the production host's name opens nothing, and no
// mutation of a check can make it open anything. The journal reader, which does
// connect, is tested apart in read-applied-migrations-target.test.mjs, and never
// on the production host.
//
// NO PRODUCTION NAME IS SPELLED HERE. The ref and the host come from the module
// under test, and each is pinned by its sha256 below, so a changed constant
// fails this file rather than being followed by it.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION, TARGET_QUERY_KEYS } from "./production-target.mjs";
import { readProdRefs } from "./import/prod-refs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, "assert-production-target.mjs");
const MODULE = join(HERE, "production-target.mjs");
const REF = PRODUCTION.ref;
const HOST = PRODUCTION.host;

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

/** A self-declared fixture password (scripts/secret-scan.mjs reads it as one). Never a credential. */
const PW = "s3cr3t-do-not-print";

/** Production in every part unless a part is overridden. */
const url = ({ user = `postgres.${REF}`, host = HOST, port = "5432", path = "/postgres", query = "" } = {}) =>
  `postgres://${user}:${PW}@${host}:${port}${path}${query}`;

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Every refusal: exit 2, the named message, and never the password. */
function assertRefused(r, message) {
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, message);
  assert.doesNotMatch(r.out, /target verified/);
  assert.ok(!r.out.includes(PW), "the guard must never echo the password");
}

// ---------------------------------------------------------------------------
// The constants, pinned apart from the module that holds them
// ---------------------------------------------------------------------------

test("the production constants are the ones pinned here, and the ref is on the seeders' blocklist", () => {
  // The same digest scripts/no-production-hosts-in-tests.test.mjs pins for the ref.
  assert.equal(sha256(REF), "eb5658945743d084d2e0ebeb177db4619d017a8e48ab768a02de0c7774378f47", "the ref moved");
  assert.equal(sha256(HOST), "2c926ead2902ac4b8991fb96528472d416220a9eb94c4ac5eccac055cd87ff32", "the host moved");
  assert.equal(PRODUCTION.port, "5432");
  assert.equal(PRODUCTION.database, "postgres");
  assert.ok(readProdRefs().includes(REF), "the ref the guard requires is not one the seeders refuse");
  assert.deepEqual([...TARGET_QUERY_KEYS], ["host", "hostaddr", "port", "dbname", "user", "service"]);
});

test("the guard imports the shared check and nothing else, and the check imports nothing", () => {
  // A document pins the guard AND scripts/production-target.mjs by sha256. That
  // covers everything the guard runs only while this holds.
  const imports = (src) => [...src.matchAll(/^\s*import\b[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports(readFileSync(GUARD, "utf8")), ["./production-target.mjs"]);
  const mod = readFileSync(MODULE, "utf8");
  assert.deepEqual(imports(mod), []);
  assert.doesNotMatch(mod, /\bimport\s*\(|\brequire\s*\(/, "the check must not load anything at run time either");
});

// ---------------------------------------------------------------------------
// ACCEPTS
// ---------------------------------------------------------------------------

test("ACCEPTS production on the session pooler, and says what it saw", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url() });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /target verified/);
  assert.ok(r.out.includes(`host: ${HOST}\n`), r.out);
  assert.ok(r.out.includes("port: 5432\n"), r.out);
  assert.ok(r.out.includes(`ref:  ${REF}\n`), r.out);
});

test("ACCEPTS the postgresql:// scheme, a host in capitals, and a query that names no target", () => {
  for (const s of [
    url().replace("postgres://", "postgresql://"),
    url({ host: HOST.toUpperCase() }),
    url({ query: "?sslmode=require&application_name=apply-lane" }),
  ]) {
    const r = runGuard({ DATABASE_URL_DIRECT: s });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /target verified/);
  }
});

test("reads DATABASE_URL when DATABASE_URL_DIRECT is unset, and DATABASE_URL_DIRECT first when both are", () => {
  assert.equal(runGuard({ DATABASE_URL: url() }).code, 0);
  const r = runGuard({ DATABASE_URL_DIRECT: url({ port: "6543" }), DATABASE_URL: url() });
  assertRefused(r, /REFUSING: port is "6543"/);
});

test("NEVER prints the password on the happy path either", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url() });
  assert.equal(r.code, 0);
  assert.ok(!r.out.includes(PW));
});

// ---------------------------------------------------------------------------
// REFUSES: the arms the lead's ruling names
// ---------------------------------------------------------------------------

test("REFUSES the incident: a local database carrying the ref as an application_name label", () => {
  // INC-rehearsal-subagent-passed-the-reader-guard, 2026-09-30.
  const r = runGuard({
    DATABASE_URL_DIRECT: `postgres://postgres:${PW}@127.0.0.1:54322/postgres?application_name=${REF}`,
  });
  assertRefused(r, /REFUSING: project ref is "postgres"/);
  assert.match(r.out, /host: 127\.0\.0\.1/);
});

test("REFUSES the ref in the username on a local host: the hole the port check left", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url({ host: "127.0.0.1" }) });
  assertRefused(r, /REFUSING: the target's host is not /);
});

test("REFUSES the right host with the wrong database", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url({ path: "/rehearsal" }) });
  assertRefused(r, /REFUSING: the target's database is not postgres\./);
  assert.ok(!r.out.includes("rehearsal"), "the path is never printed");
});

test("REFUSES the right host with the ref only in the query string", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url({ user: "postgres.someotherproject", query: `?application_name=${REF}` }) });
  assertRefused(r, /REFUSING: project ref is "someotherproject"/);
});

test("REFUSES the right project on the transaction pooler", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url({ port: "6543" }) });
  assertRefused(r, /REFUSING: port is "6543"/);
});

test("REFUSES another project on the right host and port", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: url({ user: "postgres.someotherproject" }) });
  assertRefused(r, /REFUSING: project ref/);
});

test("REFUSES a local database, which is what the lane usually holds", () => {
  const r = runGuard({ DATABASE_URL_DIRECT: "postgres://postgres:postgres@127.0.0.1:54622/postgres" });
  assertRefused(r, /REFUSING: project ref/);
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

// ---------------------------------------------------------------------------
// REFUSES: strings whose parts look right to new URL() and not to psql or
// postgres.js. Each is production in every part new URL() reads.
// ---------------------------------------------------------------------------

test("REFUSES a scheme psql does not read as a URL: capitals, or not postgres at all", () => {
  // libpq's URI prefix test is case-sensitive; anything else with no `=` is a
  // database NAME on psql's default host. new URL() reads all three as production.
  for (const s of [url().replace("postgres://", "POSTGRES://"), url().replace("postgres://", "http://"), ` ${url()}`]) {
    assertRefused(runGuard({ DATABASE_URL_DIRECT: s }), /REFUSING: the connection string does not begin with postgres:\/\//);
  }
});

test("REFUSES a second @ or a host list: psql and postgres.js split them where new URL() does not", () => {
  for (const s of [
    // new URL() reads the production host; libpq and postgres.js try 127.0.0.1 first.
    `postgres://postgres.${REF}:x@127.0.0.1:54322,y@${HOST}:5432/postgres`,
    `postgres://postgres.${REF}:x@${PW}@${HOST}:5432/postgres`,
  ]) {
    assertRefused(runGuard({ DATABASE_URL_DIRECT: s }), /REFUSING: the connection string carries more than one "@"/);
  }
  // A host list with one `@`: new URL() reads the whole list as the host, so the host check refuses it.
  assertRefused(runGuard({ DATABASE_URL_DIRECT: url({ host: `${HOST},127.0.0.1` }) }), /REFUSING: the target's host is not /);
});

test("REFUSES a fragment, which new URL() drops from the path and psql keeps", () => {
  assertRefused(runGuard({ DATABASE_URL_DIRECT: `${url()}#local` }), /REFUSING: the target's database is not postgres\./);
});

test("REFUSES a query that names a connection target, which psql applies over the URL's own parts", () => {
  for (const q of ["?hostaddr=127.0.0.1", "?host=127.0.0.1", "?port=54322", "?dbname=rehearsal", "?user=postgres", "?service=lane", "?sslmode=require&ho%73taddr=127.0.0.1", "?HOST=127.0.0.1"]) {
    const r = runGuard({ DATABASE_URL_DIRECT: url({ query: q }) });
    assertRefused(r, /REFUSING: the connection string's query names a connection target/);
    assert.ok(!r.out.includes("127.0.0.1"), `${q}: the query is never printed`);
  }
});
