// staff-11-jp-one-clinic-check.test.mjs - the JP one-clinic guard: its decision in every
// split state, its refusals, and its agreement with the two sources it must not drift
// from - the STAFF-10 script (ids, audit actions) and the portal roster query (the
// predicate that puts a therapist on the list).
//
// No database: the decision is a pure function, and every refusal fires before a
// connection is opened. The SQL itself is rehearsed against a real schema, not here.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/staff-11-jp-one-clinic-check.mjs");
const SRC = readFileSync(SCRIPT, "utf8");
const STAFF10 = readFileSync(join(ROOT, "packages/db/scripts/staff-10-jp-split-lv.mjs"), "utf8");
const STORE = readFileSync(join(ROOT, "apps/api/lib/appointments/store.ts"), "utf8");
const { evaluate } = await import(SCRIPT);

const pick = (src, name) => src.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
const TENANT = pick(SRC, "TENANT");
const JP_CB = pick(SRC, "JP_CB");
const JP_LV = pick(SRC, "JP_LV");
const CB = pick(SRC, "CB");
const LV = pick(SRC, "LV");

const users = [
  { id: JP_CB, tenant_id: TENANT, is_active: true, is_bookable: true },
  { id: JP_LV, tenant_id: TENANT, is_active: true, is_bookable: true },
];
const h = (user_id, location_id, active, extra = {}) => ({
  user_id,
  location_id,
  active,
  active_not_expired: active,
  total: active,
  ...extra,
});
const NO_RUN = { live: 0, runs: 0 };
const APPLIED = { live: 1, runs: 1 };

function run(args, env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
}

/* ---- agreement with STAFF-10 and with the portal ----------------------------- */

test("ids, ref and audit actions are STAFF-10's, byte for byte", () => {
  for (const name of ["PROD_REF", "TENANT", "JP_CB", "JP_LV", "CB", "LV", "ACTION", "ACTION_ROLLBACK"]) {
    const mine = pick(SRC, name);
    const theirs = pick(STAFF10, name);
    assert.ok(mine, `${name} not found in the check`);
    assert.ok(theirs, `${name} not found in STAFF-10`);
    assert.equal(mine, theirs, `${name} differs from STAFF-10`);
  }
});

test("the deciding predicate is the portal's: active at the clinic, no date window", () => {
  const start = STORE.indexOf("async listBookableTherapists");
  assert.ok(start >= 0, "listBookableTherapists not found in apps/api/lib/appointments/store.ts");
  const end = STORE.indexOf("order by u.full_name", start);
  assert.ok(end > start, "the roster query's end was not found");
  const body = STORE.slice(start, end);
  const exists = body.slice(body.indexOf("and exists ("));
  assert.match(exists, /from availability_templates av/);
  assert.match(exists, /av\.location_id = \$\{locationId\}/);
  assert.match(exists, /av\.is_active = true/);
  assert.doesNotMatch(
    exists,
    /valid_from|valid_until/,
    "the portal now reads a date window; the check's deciding count must follow it",
  );
  assert.match(SRC, /count\(\*\) filter \(where is_active\)::int as active,/);
});

test("read only by construction: one READ ONLY transaction and no write statement", () => {
  assert.match(SRC, /sql\.begin\("read only"/);
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|alter\s+table)\b/i);
});

/* ---- the decision ------------------------------------------------------------ */

test("BEFORE THE SPLIT (today's shape): JP(cb) at both clinics, JP(lv) with nothing, is NOT APPLICABLE and exit 0", () => {
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), h(JP_CB, LV, 15)], audit: NO_RUN });
  assert.equal(r.state, "not_split");
  assert.equal(r.exitCode, 0);
  assert.match(r.verdict, /^NOT APPLICABLE/);
});

test("after the script, each row active at its own clinic only: PASS", () => {
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), h(JP_LV, LV, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 0);
  assert.match(r.verdict, /^PASS - split detected by script/);
  assert.equal(r.checks.length, 4);
});

test("THE COLLISION: JP(lv) also active at Castelo Branco after the split is a FAIL, exit 1", () => {
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), h(JP_LV, CB, 1), h(JP_LV, LV, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 1);
  assert.match(r.verdict, /JP\(lv\) holds active hours at exactly one clinic/);
});

test("JP(cb) still holding a Linda-a-Velha row after the split is a FAIL", () => {
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), h(JP_CB, LV, 1), h(JP_LV, LV, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 1);
  assert.match(r.verdict, /JP\(cb\) holds active hours at exactly one clinic/);
});

test("the two rows swapped (each at one clinic, the wrong one) is a FAIL", () => {
  const r = evaluate({ users, hours: [h(JP_CB, LV, 13), h(JP_LV, CB, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 1);
  assert.match(r.verdict, /JP\(cb\)'s one clinic is Castelo Branco/);
  assert.match(r.verdict, /JP\(lv\)'s one clinic is Linda-a-Velha/);
});

test("an INACTIVE row at the other clinic does not count, because the portal ignores it", () => {
  const inactive = h(JP_LV, CB, 0, { active_not_expired: 0, total: 3 });
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), inactive, h(JP_LV, LV, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 0, r.verdict);
});

test("an EXPIRED row that is still active DOES count, because the portal reads no date window", () => {
  const expired = h(JP_LV, CB, 1, { active_not_expired: 0 });
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), expired, h(JP_LV, LV, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 1, r.verdict);
});

test("rolled back and JP(lv) empty again: NOT APPLICABLE", () => {
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), h(JP_CB, LV, 15)], audit: { live: 0, runs: 1 } });
  assert.equal(r.state, "not_split");
  assert.equal(r.exitCode, 0);
});

test("a split through another door (no script run) is still enforced, by the data signal", () => {
  const r = evaluate({ users, hours: [h(JP_CB, CB, 13), h(JP_CB, LV, 15), h(JP_LV, LV, 2)], audit: NO_RUN });
  assert.equal(r.state, "split");
  assert.match(r.verdict, /split detected by data/);
  assert.equal(r.exitCode, 1, "JP(cb) still at both clinics");
});

test("after the split, a row holding no active hours anywhere is a FAIL, not a pass", () => {
  const r = evaluate({ users, hours: [h(JP_LV, LV, 15)], audit: APPLIED });
  assert.equal(r.exitCode, 1);
  assert.match(r.verdict, /JP\(cb\) holds active hours at exactly one clinic/);
});

test("a missing JP row is a FAIL naming it, never a quiet NOT APPLICABLE", () => {
  const r = evaluate({ users: [users[0]], hours: [], audit: NO_RUN });
  assert.equal(r.exitCode, 1);
  assert.match(r.verdict, /JP\(lv\) not found/);
});

/* ---- invocation -------------------------------------------------------------- */

test("no DATABASE_URL_DIRECT is a bad invocation (exit 2)", () => {
  const r = run([], {});
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /DATABASE_URL_DIRECT is not set/);
});

test("any argument is refused: the check takes none", () => {
  const r = run(["--confirm"], { DATABASE_URL_DIRECT: "postgresql://postgres:postgres@127.0.0.1:1/postgres" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown argument --confirm/);
});

test("a host that is neither the production pooler nor localhost is refused before connecting, and the password is not echoed", () => {
  const r = run([], { DATABASE_URL_DIRECT: "postgresql://postgres.abc:sekrit-value@db.example.invalid:5432/postgres" });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /sekrit-value/);
});

test("the production pooler on another ref, or on the transaction port, is refused", () => {
  const wrongRef = run([], {
    DATABASE_URL_DIRECT: "postgresql://postgres.notprod:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
  });
  assert.equal(wrongRef.status, 2);
  const txPort = run([], {
    DATABASE_URL_DIRECT: "postgresql://postgres.dfotoodqvmjhbdcxyaxf:x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
  });
  assert.equal(txPort.status, 2);
});
