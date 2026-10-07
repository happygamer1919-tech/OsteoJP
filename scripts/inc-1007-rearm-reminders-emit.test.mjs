// inc-1007-rearm-reminders-emit.test.mjs - the reminder re-arm emit's refusals,
// its row verdicts, its event, its marker, and its contract with the reminder
// pipeline it feeds.
//
// NO DATABASE IS NEEDED AND NONE IS CONTACTED. The command-line tests stop at a
// refusal that fires before the script opens a connection. The whole-run tests
// call run() in this process with the database read replaced by fixture rows
// and with a sink file, so nothing is sent anywhere.
//
// THIS FILE NEVER HANDS THE PRODUCTION HOST TO CODE THAT CAN CONNECT. The script
// has database code and a network send, so a mutation that removed a check
// would turn any string here into a real connection. Every string given to the
// command line or to run() points at 127.0.0.1 port 1 (closed) or at a reserved
// `.invalid` host. The production string is built from the shared module's
// constants and is given ONLY to classifyTarget(), which is pure. The accepting
// arm of the real send is never run (memory rule: a guard test must never name
// a real host).
//
// The contract tests read the APP's source, so a renamed event, a changed
// status set, a moved offset, a renamed audit action or a redefined
// is_unconfirmed_pedido reddens this file instead of producing an emit that
// selects the wrong rows.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION } from "./production-target.mjs";
import {
  DEFAULT_MAX,
  EVENT_NAME,
  Halt,
  LEAD_MS,
  OFFSETS,
  SELECT_ROWS,
  TOUCH_MS,
  bucketOf,
  buildEvent,
  classifyTarget,
  parseArgs,
  preflight,
  readHistory,
  run,
  sendToInngest,
  tooLateToWait,
  verdictOf,
  wouldSchedule,
} from "../packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs");
const SRC = readFileSync(SCRIPT, "utf8");
/** The script with its comments removed: its header quotes things the code must not do. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A self-declared fixture password. Never a credential. */
const PW = "s3cr3t-do-not-print";
const LANE_URL = `postgresql://postgres:${PW}@127.0.0.1:1/postgres`;
const NEAR_PROD_URL = `postgresql://postgres.${PRODUCTION.ref}:${PW}@db.invalid:5432/postgres`;
const OTHER_URL = `postgresql://someone:${PW}@db.invalid:5432/postgres`;
const SHA_OK = "abcdef0123abcdef0123abcdef0123abcdef0123";
const SLUG = ["--tenant-slug", "osteojp"];
const FULL_CONFIRM = [...SLUG, "--confirm", "--expect", "1", "--fix-deployed-sha", SHA_OK, "--i-checked-inngest-settings"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-10-07T12:00:00.000Z");
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apptId = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(n).padStart(4, "0")}`;

function cli(args, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "inc1007-"));
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, HOME: home, ...env },
    encoding: "utf8",
    // A refusal exits at once. Anything slower is a connection attempt.
    timeout: 15_000,
  });
  assert.equal(r.signal, null, `the script did not exit by itself: ${r.stderr}`);
  assert.ok(!(r.stdout + r.stderr).includes(PW), "the password was echoed");
  return r;
}

/** A row as the database read returns it. The three CANARY fields are things the real read never selects. */
function dbRow(n, over = {}) {
  return {
    id: apptId(n),
    tenant_id: TENANT,
    starts_at: new Date(T0 + 3 * DAY + n * HOUR),
    status: "scheduled",
    unaccepted_request: false,
    last_emit_at: new Date(T0 - 10 * DAY),
    emit_events: 1,
    t0: new Date(T0),
    patient_name: "CANARY-NAME",
    phone: "CANARY-PHONE-912345678",
    email: "canary@patient.invalid",
    ...over,
  };
}

/** run() in this process: fixture rows, a sink file in a fresh folder, and every printed line captured. */
async function runWith(rows, argv, opts = {}) {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), "inc1007-run-"));
  const sink = join(dir, "sink.jsonl");
  const home = join(dir, "home");
  mkdirSync(home, { recursive: true });
  const lines = [];
  const deps = {
    env: { DATABASE_URL_DIRECT: LANE_URL },
    home,
    out: opts.out ?? ((l) => lines.push(l)),
    readSelection: async () => ({ tenantId: TENANT, t0: new Date(T0), rows }),
  };
  let result = null;
  let halt = null;
  try {
    result = await run([...SLUG, "--sink-file", sink, ...argv], deps);
  } catch (e) {
    if (!(e instanceof Halt)) throw e;
    halt = e;
  }
  const events = existsSync(sink) && statSync(sink).isFile() ? readFileSync(sink, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  const markerPath = `${sink}.marker.json`;
  const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, "utf8")) : null;
  return { dir, sink, home, lines, result, halt, events, marker, markerPath };
}

const SINK_CONFIRM = (n, extra = []) => ["--confirm", "--expect", String(n), "--fix-deployed-sha", SHA_OK, ...extra];

/* ---- invocation: the command line, exit codes included --------------------- */

test("no arguments is a bad invocation (exit 2), not a failure", () => {
  const r = cli([]);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /BAD INVOCATION: --tenant-slug is required/);
  assert.match(r.stderr, /usage:/);
});

test("an unknown flag is refused rather than ignored", () => {
  const r = cli([...SLUG, "--apply"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown argument/);
});

test("--confirm without --expect is refused: the count is carried from the dry run", () => {
  const r = cli([...SLUG, "--confirm"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--confirm needs --expect/);
});

test("--confirm without --fix-deployed-sha is refused", () => {
  const r = cli([...SLUG, "--confirm", "--expect", "1", "--i-checked-inngest-settings"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--confirm needs --fix-deployed-sha/);
});

test("--fix-deployed-sha must be 40 lowercase hex characters", () => {
  for (const sha of [SHA_OK.slice(1), `${SHA_OK}0`, SHA_OK.toUpperCase(), `g${SHA_OK.slice(1)}`, "main"]) {
    const r = cli([...SLUG, "--fix-deployed-sha", sha]);
    assert.equal(r.status, 2, sha);
    assert.match(r.stderr, /--fix-deployed-sha must be the full 40 character/, sha);
  }
});

test("--confirm without --i-checked-inngest-settings is refused, and the sentence says what to check", () => {
  const r = cli([...SLUG, "--confirm", "--expect", "1", "--fix-deployed-sha", SHA_OK]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--confirm needs --i-checked-inngest-settings/);
  for (const word of ["Inngest dashboard", "schedule-appointment-reminders", "Debounce", "send-appointment-reminder", "Singleton"]) {
    assert.ok(r.stderr.includes(word), `the refusal does not name ${word}`);
  }
});

test("the two function ids and the two settings in that sentence are the app's", () => {
  // On main today the functions exist; the settings arrive with the fix. The ids must not drift.
  const fns = readFileSync(join(ROOT, "apps/web/lib/reminders/inngest/functions.ts"), "utf8");
  assert.match(fns, /id: "schedule-appointment-reminders"/);
  assert.match(fns, /id: "send-appointment-reminder"/);
});

test("--max, --min-days-ahead and --expect take whole numbers only", () => {
  for (const [flag, value, msg] of [
    ["--max", "0", /--max must be a whole number, 1 or more/],
    ["--max", "ten", /--max must be a whole number, 1 or more/],
    ["--max", "2.5", /--max must be a whole number, 1 or more/],
    ["--min-days-ahead", "0", /--min-days-ahead must be a whole number, 1 or more/],
    ["--min-days-ahead", "0.5", /--min-days-ahead must be a whole number, 1 or more/],
    ["--expect", "many", /--expect must be a whole number/],
  ]) {
    const r = cli([...SLUG, flag, value]);
    assert.equal(r.status, 2, `${flag} ${value}`);
    assert.match(r.stderr, msg);
  }
});

test("a flag that takes a value refuses to swallow the next flag", () => {
  const r = cli(["--tenant-slug", "--confirm"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--tenant-slug needs a value/);
});

test("--sink-file must be an absolute path", () => {
  const r = cli([...SLUG, "--sink-file", "events.jsonl"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--sink-file must be an absolute path/);
});

test("with no connection string it refuses before doing anything", () => {
  const r = cli(SLUG);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /neither DATABASE_URL_DIRECT nor DATABASE_URL/);
});

test("a connection string that does not parse is refused and never echoed", () => {
  const r = cli(SLUG, { DATABASE_URL_DIRECT: "not a url at all" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /the connection string cannot be used/);
  assert.doesNotMatch(r.stdout + r.stderr, /not a url at all/);
});

test("a string that names production without being the exact target is refused in EVERY mode", () => {
  const incident = `postgres://postgres:${PW}@127.0.0.1:1/postgres?application_name=${PRODUCTION.ref}`;
  for (const url of [NEAR_PROD_URL, incident]) {
    for (const extra of [[], ["--sink-file", join(tmpdir(), "inc1007-never-written.jsonl")], FULL_CONFIRM.slice(2)]) {
      const r = cli([...SLUG, ...extra], { DATABASE_URL_DIRECT: url, INNGEST_EVENT_KEY: "k" });
      assert.equal(r.status, 1, `${extra.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, /names production but is not the exact production target/);
      assert.doesNotMatch(r.stdout, /tenant {3}/, "it read the database");
    }
  }
});

test("--confirm without INNGEST_EVENT_KEY is refused, and the key's name is the only thing printed", () => {
  const r = cli(FULL_CONFIRM, { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /INNGEST_EVENT_KEY is not set/);
});

test("--confirm with INNGEST_DEV set is refused", () => {
  const r = cli(FULL_CONFIRM, { DATABASE_URL_DIRECT: LANE_URL, INNGEST_EVENT_KEY: "k", INNGEST_DEV: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /INNGEST_DEV is set/);
});

test("--confirm to Inngest Cloud is refused when the target is NOT production", () => {
  for (const url of [LANE_URL, OTHER_URL]) {
    const r = cli(FULL_CONFIRM, { DATABASE_URL_DIRECT: url, INNGEST_EVENT_KEY: "k" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /target is NOT production/);
  }
});

test("--sink-file is refused unless the target is the strict local form", () => {
  const sink = join(mkdtempSync(join(tmpdir(), "inc1007-sink-")), "sink.jsonl");
  for (const url of [
    OTHER_URL,
    `${LANE_URL}?sslmode=disable`,
    // Two "@": new URL() reads 127.0.0.1 here, and postgres.js would try db.invalid first.
    `postgresql://postgres:${PW}@db.invalid:5432,y@127.0.0.1:1/postgres`,
  ]) {
    const r = cli([...SLUG, "--sink-file", sink], { DATABASE_URL_DIRECT: url });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /--sink-file is for rehearsal on a LOCAL database/);
    // A host is printed only from a string with exactly one "@".
    assert.equal(/^target /m.test(r.stdout), url.split("@").length === 2);
  }
  // A list of hosts does not parse at all, and is refused for that.
  const list = cli([...SLUG, "--sink-file", sink], { DATABASE_URL_DIRECT: `postgresql://postgres:${PW}@127.0.0.1:1,db.invalid:5432/postgres` });
  assert.equal(list.status, 2, list.stderr);
  assert.match(list.stderr, /the connection string cannot be used/);
  assert.equal(existsSync(sink), false);
});

test("an unreadable marker is refused, never treated as an empty history", () => {
  // The production marker, in HOME.
  const home = mkdtempSync(join(tmpdir(), "inc1007-garbled-"));
  writeFileSync(join(home, ".osteojp-inc1007-rearm.json"), "not json\n");
  const r = cli(SLUG, { HOME: home, DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is not JSON/);
  // A marker that is JSON but holds no history list is refused the same way.
  writeFileSync(join(home, ".osteojp-inc1007-rearm.json"), "{}\n");
  const r2 = cli(SLUG, { HOME: home, DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /has no history list/);
  // The rehearsal marker, beside the sink file.
  const sink = join(mkdtempSync(join(tmpdir(), "inc1007-garbled-sink-")), "sink.jsonl");
  writeFileSync(`${sink}.marker.json`, "not json\n");
  const r3 = cli([...SLUG, "--sink-file", sink], { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r3.status, 1);
  assert.match(r3.stderr, /is not JSON/);
});

test("--confirm refuses BEFORE connecting when the marker cannot be written", () => {
  const sink = join(tmpdir(), "inc1007-no-such-dir", "nested", "sink.jsonl");
  const r = cli([...SLUG, "--sink-file", sink, "--confirm", "--expect", "1"], { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot write the marker/);
});

test("a dry run against a closed local port fails on the read, exit 1, and sends nothing", () => {
  // Proves the order: every refusal above fired BEFORE this point.
  const r = cli(SLUG, { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAILED: the read failed/);
  assert.match(r.stdout, /DRY RUN - nothing is sent/);
  assert.match(r.stdout, /CANNOT verify what is deployed/);
});

/* ---- the target and the refusals, as pure functions ------------------------ */

test("classifyTarget reads production only from the exact target, and local only from the strict form", () => {
  // Built from the shared module's constants and given to a PURE function only.
  const prod = `postgresql://postgres.${PRODUCTION.ref}:${PW}@${PRODUCTION.host}:${PRODUCTION.port}/${PRODUCTION.database}`;
  assert.equal(classifyTarget(prod).kind, "production");
  assert.equal(classifyTarget(prod.replace(":5432/", ":6543/")).kind, "near-production");
  assert.equal(classifyTarget(NEAR_PROD_URL).kind, "near-production");
  assert.equal(classifyTarget(`postgresql://postgres:${PW}@${PRODUCTION.host}:5432/postgres`).kind, "near-production");
  assert.equal(classifyTarget(`${LANE_URL}?application_name=${PRODUCTION.ref}`).kind, "near-production");
  assert.equal(classifyTarget(LANE_URL).kind, "local");
  assert.equal(classifyTarget(`postgres://postgres:${PW}@localhost:54522/postgres`).kind, "local");
  assert.equal(classifyTarget(`${LANE_URL}?sslmode=disable`).kind, "other");
  // The strict local form: one "@", and no "," before it.
  assert.equal(classifyTarget(`postgresql://someone:${PW}@db.invalid@127.0.0.1:1/postgres`).kind, "other");
  assert.equal(classifyTarget(`postgresql://some,one:${PW}@127.0.0.1:1/postgres`).kind, "other");
  assert.equal(classifyTarget(OTHER_URL).kind, "other");
  assert.equal(classifyTarget("not a url at all").kind, "unreadable");
  assert.equal(classifyTarget("").kind, "unreadable");
});

test("preflight: the sink is refused on production, and a real confirm passes only on production", () => {
  const confirm = parseArgs(FULL_CONFIRM);
  const sinkArgs = parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl"]);
  const kind = (k) => ({ kind: k, seen: null, why: "why" });
  assert.match(preflight(sinkArgs, kind("production"), {}).msg, /--sink-file is for rehearsal and the target is PRODUCTION/);
  assert.equal(preflight(sinkArgs, kind("production"), {}).code, 1);
  assert.match(preflight(sinkArgs, kind("other"), {}).msg, /LOCAL database/);
  assert.equal(preflight(sinkArgs, kind("local"), {}), null);
  assert.equal(preflight(confirm, kind("production"), { INNGEST_EVENT_KEY: "k" }), null);
  assert.match(preflight(confirm, kind("production"), {}).msg, /INNGEST_EVENT_KEY is not set/);
  assert.match(preflight(confirm, kind("production"), { INNGEST_EVENT_KEY: "k", INNGEST_DEV: "1" }).msg, /INNGEST_DEV is set/);
  for (const k of ["local", "other"]) {
    assert.match(preflight(confirm, kind(k), { INNGEST_EVENT_KEY: "k" }).msg, /target is NOT production/);
  }
  for (const args of [confirm, sinkArgs, parseArgs(SLUG)]) {
    assert.equal(preflight(args, kind("near-production"), { INNGEST_EVENT_KEY: "k" }).code, 1);
    assert.equal(preflight(args, kind("unreadable"), { INNGEST_EVENT_KEY: "k" }).code, 2);
  }
  // A dry run may read anything that is not near production.
  for (const k of ["production", "local", "other"]) assert.equal(preflight(parseArgs(SLUG), kind(k), {}), null);
});

test("a sink run asks nobody to vouch for the scheduler; a real confirm always does", () => {
  const sink = parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl", "--confirm", "--expect", "3"]);
  assert.equal(sink.checkedInngest, false);
  assert.equal(sink.fixDeployedSha, undefined);
  assert.throws(() => parseArgs([...SLUG, "--confirm", "--expect", "3"]), /--confirm needs --fix-deployed-sha/);
  assert.equal(parseArgs(SLUG).max, DEFAULT_MAX);
  assert.equal(DEFAULT_MAX, 25, "the first real run is a canary of 25");
});

/* ---- the verdict: the 24 hour and 25 hour boundaries ----------------------- */

const row = (over = {}) => ({
  id: apptId(1),
  tenantId: TENANT,
  startsAt: new Date(T0 + 3 * DAY).toISOString(),
  status: "scheduled",
  unacceptedRequest: false,
  lastEmitAt: new Date(T0 - 10 * DAY).toISOString(),
  emitEvents: 1,
  ...over,
});
const OPTS = { minDaysAhead: 1, alreadySent: () => false };
const at = (ms) => new Date(ms).toISOString();

test("the lead is 24 hours and the touch window is 25 hours", () => {
  assert.equal(LEAD_MS, 24 * HOUR);
  assert.equal(TOUCH_MS, 25 * HOUR);
});

test("a row starting exactly 24 hours after the read is NOT emitted; one millisecond later it is", () => {
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR - 1) }), T0, OPTS), "inside_24h");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR) }), T0, OPTS), "inside_24h");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR + 1) }), T0, OPTS), "emit");
});

test("a row touched exactly 25 hours before the read is skipped; one millisecond older it is emitted", () => {
  assert.equal(verdictOf(row({ lastEmitAt: at(T0 - 1) }), T0, OPTS), "touched_25h");
  assert.equal(verdictOf(row({ lastEmitAt: at(T0 - 24 * HOUR) }), T0, OPTS), "touched_25h");
  assert.equal(verdictOf(row({ lastEmitAt: at(T0 - 25 * HOUR + 1) }), T0, OPTS), "touched_25h");
  assert.equal(verdictOf(row({ lastEmitAt: at(T0 - 25 * HOUR) }), T0, OPTS), "touched_25h");
  assert.equal(verdictOf(row({ lastEmitAt: at(T0 - 25 * HOUR - 1) }), T0, OPTS), "emit");
});

test("a row with no emitting audit event at all is emitted", () => {
  assert.equal(verdictOf(row({ lastEmitAt: null }), T0, OPTS), "emit");
});

test("an unaccepted online request is never emitted, whatever else is true", () => {
  assert.equal(verdictOf(row({ unacceptedRequest: true }), T0, OPTS), "unaccepted_request");
  assert.equal(verdictOf(row({ unacceptedRequest: true, lastEmitAt: null, startsAt: at(T0 + 40 * DAY) }), T0, OPTS), "unaccepted_request");
  // The first reason wins, in the order of the report: a request inside 24 hours is still reported as a request.
  assert.equal(verdictOf(row({ unacceptedRequest: true, startsAt: at(T0 + HOUR) }), T0, OPTS), "unaccepted_request");
  assert.equal(verdictOf(row({ startsAt: at(T0 + HOUR), lastEmitAt: at(T0 - HOUR) }), T0, OPTS), "inside_24h");
  assert.equal(verdictOf(row({ lastEmitAt: at(T0 - HOUR) }), T0, { ...OPTS, alreadySent: () => true }), "touched_25h");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 2 * DAY) }), T0, { minDaysAhead: 3, alreadySent: () => true }), "already_sent");
});

test("a row the marker already holds at this start is skipped, and --min-days-ahead only narrows", () => {
  assert.equal(verdictOf(row(), T0, { ...OPTS, alreadySent: () => true }), "already_sent");
  const three = { ...OPTS, minDaysAhead: 3 };
  assert.equal(verdictOf(row({ startsAt: at(T0 + 3 * DAY - 1) }), T0, three), "held_back");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 3 * DAY) }), T0, three), "emit");
  // It never widens: inside 24 hours stays inside 24 hours.
  assert.equal(verdictOf(row({ startsAt: at(T0 + 23 * HOUR) }), T0, three), "inside_24h");
});

test("a touched row that will be inside 24 hours before its 25 hours are up is counted as out of reach", () => {
  // Reachable only if start > last emit + 25 h + 24 h.
  const touchedAt = T0 - HOUR;
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(touchedAt + 49 * HOUR) })), true);
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(touchedAt + 49 * HOUR - 1) })), true);
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(touchedAt + 49 * HOUR + 1) })), false);
  assert.equal(tooLateToWait(row({ lastEmitAt: null, startsAt: at(T0 + 25 * HOUR) })), false);
});

test("the days-until-start buckets", () => {
  assert.equal(bucketOf(T0 + DAY + 1, T0), "1 to 2");
  assert.equal(bucketOf(T0 + 2 * DAY - 1, T0), "1 to 2");
  assert.equal(bucketOf(T0 + 2 * DAY, T0), "2 to 7");
  assert.equal(bucketOf(T0 + 7 * DAY - 1, T0), "2 to 7");
  assert.equal(bucketOf(T0 + 7 * DAY, T0), "7 to 30");
  assert.equal(bucketOf(T0 + 30 * DAY - 1, T0), "7 to 30");
  assert.equal(bucketOf(T0 + 30 * DAY, T0), "over 30");
});

test("the preview says which offsets are still ahead", () => {
  assert.deepEqual(wouldSchedule(T0 + 30 * HOUR, T0), ["24h sms"]);
  assert.deepEqual(wouldSchedule(T0 + 3 * DAY, T0), ["48h email", "24h sms"]);
  assert.deepEqual(wouldSchedule(T0 + 48 * HOUR, T0), ["24h sms"]);
});

/* ---- the event ------------------------------------------------------------- */

test("the payload is exactly four keys, confirmationEligible is false, and the id is derived from the row", () => {
  const r = row();
  const event = buildEvent(r);
  assert.deepEqual(event, {
    name: "appointment/scheduled",
    id: `inc1007-rearm:${r.id}:${r.startsAt}`,
    data: { appointmentId: r.id, tenantId: TENANT, startsAt: r.startsAt, confirmationEligible: false },
  });
  assert.deepEqual(Object.keys(event).sort(), ["data", "id", "name"]);
  assert.deepEqual(Object.keys(event.data).sort(), ["appointmentId", "confirmationEligible", "startsAt", "tenantId"]);
  assert.equal(event.data.confirmationEligible, false);
  assert.match(event.data.startsAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, "startsAt is not ISO UTC");
  assert.doesNotMatch(CODE, /confirmationEligible: true/);
  assert.doesNotMatch(CODE, /acceptedPedido|acceptedGuestRequest/, "a re-arm is never an acceptance");
  // The same row at a new start is a different event; the same row at the same start is the same one.
  assert.notEqual(buildEvent(row({ startsAt: at(T0 + 4 * DAY) })).id, event.id);
  assert.equal(buildEvent(row()).id, event.id);
});

test("the event name is the app's EVENT_APPOINTMENT_SCHEDULED, read from client.ts as text", () => {
  const client = readFileSync(join(ROOT, "apps/web/lib/reminders/inngest/client.ts"), "utf8");
  const appName = client.match(/EVENT_APPOINTMENT_SCHEDULED = "([^"]+)"/)?.[1];
  assert.ok(appName, "EVENT_APPOINTMENT_SCHEDULED not found in client.ts");
  assert.equal(EVENT_NAME, appName);
  assert.match(SRC, new RegExp(`export const EVENT_NAME = "${appName.replace("/", "\\/")}"`));
});

test("the four keys are every REQUIRED key of the app's AppointmentScheduledData", () => {
  const client = readFileSync(join(ROOT, "apps/web/lib/reminders/inngest/client.ts"), "utf8");
  const block = client.match(/export type AppointmentScheduledData = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(block, "AppointmentScheduledData not found in client.ts");
  const noComments = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const required = [...noComments.matchAll(/^\s*([A-Za-z]+): /gm)].map((m) => m[1]).sort();
  assert.deepEqual(required, Object.keys(buildEvent(row()).data).sort());
});

test("the real send posts the event to the event API and never returns the key", async () => {
  const calls = [];
  const event = buildEvent(row());
  const ok = await sendToInngest(event, {
    key: "fixture key/1",
    origin: "http://sink.invalid",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(ok, { ok: true, why: null });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://sink.invalid/e/fixture%20key%2F1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), event);
  const refused = await sendToInngest(event, { key: "fixture-key", origin: "http://sink.invalid", fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual(refused, { ok: false, why: "HTTP 500" });
  const dropped = await sendToInngest(event, {
    key: "fixture-key",
    origin: "http://sink.invalid",
    fetchImpl: async () => {
      throw new TypeError("fetch failed for fixture-key");
    },
  });
  assert.deepEqual(dropped, { ok: false, why: "network error (TypeError)" });
});

/* ---- the whole run, on fixture rows and a sink file ------------------------ */

/** 30 eligible rows and one of every kind that must NOT be sent. */
function fixture() {
  const rows = [];
  for (let n = 1; n <= 30; n++) rows.push(dbRow(n, n % 3 === 0 ? { status: "confirmed", emit_events: 2 } : {}));
  rows.push(dbRow(40, { unaccepted_request: true, last_emit_at: null, emit_events: 0 }));
  // Inside 24 hours and NOT touched. It must not be counted as "out of reach": that line is about touched rows only.
  rows.push(dbRow(41, { starts_at: new Date(T0 + 23 * HOUR), last_emit_at: new Date(T0 - 26 * HOUR) }));
  rows.push(dbRow(42, { starts_at: new Date(T0 + 24 * HOUR) }));
  rows.push(dbRow(43, { last_emit_at: new Date(T0 - 2 * HOUR) }));
  rows.push(dbRow(44, { last_emit_at: new Date(T0 - 25 * HOUR) }));
  rows.push(dbRow(45, { starts_at: new Date(T0 + 30 * HOUR) })); // eligible, 1 to 2 days
  rows.push(dbRow(46, { starts_at: new Date(T0 + 40 * DAY), last_emit_at: null, emit_events: 0 })); // eligible, over 30
  rows.push(dbRow(47, { starts_at: new Date(T0 + 30 * HOUR), last_emit_at: new Date(T0 - HOUR) })); // touched, and out of reach
  rows.sort((a, b) => a.starts_at - b.starts_at || (a.id < b.id ? -1 : 1));
  return rows;
}

test("the dry run prints the counts, the skips by reason and the first 20 ids, and sends nothing", async () => {
  const r = await runWith(fixture(), []);
  assert.equal(r.halt, null);
  assert.deepEqual(r.result, { sent: 0, eligible: 32 });
  const text = r.lines.join("\n");
  assert.match(text, /^mode {5}DRY RUN - nothing is sent$/m);
  assert.match(text, /^FUTURE REMINDABLE: 38 /m);
  assert.match(text, /^skipped: unaccepted online request: 1$/m);
  assert.match(text, /^skipped: starts within 24 hours: 2$/m);
  assert.match(text, /^skipped: touched in the last 25 hours: 3$/m);
  assert.match(text, /^ {2}of those, inside 24 hours of their start before the 25 hours are up \(no later run can reach them\): 1$/m);
  assert.match(text, /^skipped: already sent by an earlier run \(marker\): 0$/m);
  assert.match(text, /^ELIGIBLE: 32$/m);
  assert.match(text, /^ {2}by status: scheduled=22 confirmed=10$/m);
  assert.match(text, /^ {2}by days until start: 1 to 2=1 {2}2 to 7=30 {2}7 to 30=0 {2}over 30=1$/m);
  assert.match(text, /^ {2}with two or more emitting audit events \(saved again at least once\): 10$/m);
  assert.match(text, /^THIS RUN: 25 of 32 {2}\(--max 25; left for a later run: 7\)$/m);
  assert.match(text, /add --confirm --expect 32 /);
  const idLines = r.lines.filter((l) => /^ {2}[0-9a-f]{8}-/.test(l));
  assert.equal(idLines.length, 20, "the dry run lists the first 20 and no more");
  for (const l of idLines) assert.match(l, /^ {2}[0-9a-f-]{36} {2}starts \d{4}-\d\d-\d\dT[\d:.]+Z {2}(scheduled|confirmed) +would schedule: /);
  assert.equal(idLines[0].includes(apptId(45)), true, "the nearest eligible row is first");
  assert.equal(existsSync(r.sink), false, "a dry run wrote the sink");
  assert.equal(existsSync(r.markerPath), false, "a dry run wrote the marker");
});

test("--expect that does not match the eligible count is refused, and nothing is sent or recorded", async () => {
  const r = await runWith(fixture(), SINK_CONFIRM(31));
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, /expected 31 eligible rows and found 32/);
  assert.equal(r.events.length, 0);
  assert.equal(r.marker, null);
});

test("the first run is a canary of --max, and a second run continues with the rest: the marker skips what was sent", async () => {
  const rows = fixture();
  const first = await runWith(rows, SINK_CONFIRM(32));
  assert.equal(first.halt, null);
  assert.deepEqual(first.result, { sent: 25, eligible: 32 });
  assert.equal(first.events.length, 25);
  assert.equal(first.marker.history.length, 1);
  assert.equal(first.marker.history[0].state, "done");
  assert.equal(first.marker.history[0].sent.length, 25);
  assert.equal(first.marker.history[0].fixDeployedSha, SHA_OK);
  assert.equal(first.marker.history[0].sink, true);
  assert.equal(first.marker.history[0].checkedInngestSettings, false);
  assert.equal(first.marker.history[0].tenantId, TENANT);

  const dry = await runWith(rows, [], { dir: first.dir });
  assert.match(dry.lines.join("\n"), /^skipped: already sent by an earlier run \(marker\): 25$/m);
  assert.deepEqual(dry.result, { sent: 0, eligible: 7 });

  const stale = await runWith(rows, SINK_CONFIRM(32), { dir: first.dir });
  assert.equal(stale.halt?.code, 1, "the first run's count must not send the second run");
  assert.equal(stale.events.length, 25);

  const second = await runWith(rows, SINK_CONFIRM(7), { dir: first.dir });
  assert.deepEqual(second.result, { sent: 7, eligible: 7 });
  assert.equal(second.events.length, 32);
  assert.equal(new Set(second.events.map((e) => e.id)).size, 32, "one row was sent twice");
  assert.equal(second.marker.history.length, 2);

  const third = await runWith(rows, SINK_CONFIRM(0), { dir: first.dir });
  assert.deepEqual(third.result, { sent: 0, eligible: 0 });
  assert.equal(third.events.length, 32);
  assert.equal(third.marker.history.length, 2, "a run that sent nothing must not touch the marker");

  // Exactly the eligible rows, each with the exact event.
  const eligibleIds = rows
    .filter((r) => ![40, 41, 42, 43, 44, 47].map(apptId).includes(r.id))
    .map((r) => r.id)
    .sort();
  assert.deepEqual(second.events.map((e) => e.data.appointmentId).sort(), eligibleIds);
  for (const e of second.events) {
    assert.deepEqual(Object.keys(e).sort(), ["data", "id", "name"]);
    assert.deepEqual(Object.keys(e.data).sort(), ["appointmentId", "confirmationEligible", "startsAt", "tenantId"]);
    assert.equal(e.name, EVENT_NAME);
    assert.equal(e.data.confirmationEligible, false);
    assert.equal(e.data.tenantId, TENANT);
    assert.equal(e.id, `inc1007-rearm:${e.data.appointmentId}:${e.data.startsAt}`);
  }
  // A sink run keeps its marker beside the sink and never writes the production marker.
  assert.deepEqual(readdirSync(first.home), []);
});

test("the marker skips a row only at the SAME start: a moved appointment is a new event", async () => {
  const first = await runWith([dbRow(1)], SINK_CONFIRM(1));
  assert.equal(first.result.sent, 1);
  const same = await runWith([dbRow(1)], [], { dir: first.dir });
  assert.equal(same.result.eligible, 0);
  const moved = await runWith([dbRow(1, { starts_at: new Date(T0 + 9 * DAY) })], [], { dir: first.dir });
  assert.equal(moved.result.eligible, 1);
});

test("the marker holds each event before the line that reports it, so a run that dies keeps what it sent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  const markerPath = join(dir, "sink.jsonl.marker.json");
  const seen = [];
  const r = await runWith([dbRow(1), dbRow(2), dbRow(3)], SINK_CONFIRM(3), {
    dir,
    out: (line) => {
      const m = /^ {2}sent ([0-9a-f-]{36}) /.exec(line);
      if (!m) return;
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      seen.push({ id: m[1], state: marker.history[0].state, recorded: marker.history[0].sent.map((s) => s.id) });
    },
  });
  assert.equal(r.result.sent, 3);
  assert.equal(seen.length, 3);
  seen.forEach((s, i) => {
    assert.equal(s.state, "sending");
    assert.equal(s.recorded.length, i + 1);
    assert.equal(s.recorded[i], s.id);
  });
  // And the claim is written before the first event is sent.
  const claim = CODE.indexOf('state: "sending"');
  const firstWrite = CODE.indexOf("writeMarker(marker, entries)", claim);
  const firstSend = CODE.indexOf("await send(buildEvent(row))");
  assert.ok(claim > 0 && firstWrite > claim && firstSend > firstWrite, "the marker claim no longer precedes the first send");
});

test("a send that fails stops the run at once, and the marker says stopped", async () => {
  // The sink path is a FOLDER, so the first append fails.
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  mkdirSync(join(dir, "sink.jsonl"));
  const r = await runWith([dbRow(1), dbRow(2)], SINK_CONFIRM(2), { dir });
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, /stopped at bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001: could not write the sink file/);
  assert.equal(r.marker.history[0].state, "stopped");
  assert.deepEqual(r.marker.history[0].sent, []);
  assert.match(r.lines.join("\n"), /^SENT: 0 of 2 /m);
});

test("an earlier run that never finished is announced", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  writeFileSync(
    join(dir, "sink.jsonl.marker.json"),
    JSON.stringify({ history: [{ at: "2026-10-07T10:00:00.000Z", state: "sending", sent: [{ id: apptId(1), startsAt: dbRow(1).starts_at.toISOString() }] }] }),
  );
  const r = await runWith([dbRow(1), dbRow(2)], [], { dir });
  assert.match(r.lines.join("\n"), /^NOTE {5}1 earlier run\(s\) did not finish/m);
  assert.equal(r.result.eligible, 1, "what the unfinished run recorded is still skipped");
  assert.equal(readHistory(join(dir, "sink.jsonl.marker.json")).exact.size, 1);
});

test("a row the read should never return is refused, not sent", async () => {
  for (const [bad, msg] of [
    [{ tenant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, /for another tenant/],
    [{ status: "cancelled" }, /status that is not remindable/],
    [{ id: "1 or 1=1" }, /not a uuid/],
    [{ starts_at: "never" }, /no readable start/],
  ]) {
    const r = await runWith([dbRow(1), dbRow(2, bad)], SINK_CONFIRM(2));
    assert.equal(r.halt?.code, 1);
    assert.match(r.halt.message, msg);
    assert.equal(r.events.length, 0);
  }
});

test("no name, phone or email reaches any output line, the sink or the marker", async () => {
  const rows = fixture();
  const dry = await runWith(rows, []);
  const sent = await runWith(rows, SINK_CONFIRM(32, ["--max", "500"]));
  assert.equal(sent.result.sent, 32);
  const everything = [
    ...dry.lines,
    ...sent.lines,
    readFileSync(sent.sink, "utf8"),
    readFileSync(sent.markerPath, "utf8"),
  ];
  for (const text of everything) {
    assert.doesNotMatch(text, /CANARY|canary/, "a field the read never selects was printed");
    assert.doesNotMatch(text, /@/, "something shaped like an email address was printed");
    assert.doesNotMatch(text, /patient_name|phone/i);
  }
  // Every line that names an appointment is an id, an instant and a status, and nothing else.
  const rowLines = [...dry.lines, ...sent.lines].filter((x) => x.includes("bbbbbbbb-bbbb-4bbb-8bbb-"));
  assert.equal(rowLines.length, 20 + 32);
  for (const l of rowLines) {
    assert.match(
      l,
      /^ {2}(sent )?[0-9a-f-]{36} {2}starts \d{4}-\d\d-\d\dT[\d:.]+Z {2}(scheduled|confirmed)( +would schedule: (48h email, )?24h sms)?$/,
      `an unexpected row line: ${l}`,
    );
  }
  // The read selects no patient column: the only patient fact it uses is the soft-delete flag.
  assert.doesNotMatch(SELECT_ROWS, /name|phone|email|nif|birth|address|notes/i);
  assert.deepEqual([...SELECT_ROWS.matchAll(/\bp\.([a-z_]+)/g)].map((m) => m[1]).sort(), ["deleted_at", "id", "tenant_id"]);
});

/* ---- the read, and its contract with the app ------------------------------- */

test("the read is one tenant, read-only, future rows only, and writes nothing", () => {
  assert.match(CODE, /sql\.begin\("read only"/);
  assert.match(SELECT_ROWS, /with k as \(select \$1::uuid as tenant_id, now\(\) as t0\)/);
  assert.match(SELECT_ROWS, /join k on k\.tenant_id = a\.tenant_id/);
  assert.match(SELECT_ROWS, /join patients p on p\.id = a\.patient_id and p\.tenant_id = a\.tenant_id/);
  assert.match(SELECT_ROWS, /where a\.status::text in \('scheduled', 'confirmed'\)\s+and p\.deleted_at is null\s+and a\.starts_at > k\.t0/);
  assert.match(SELECT_ROWS, /order by a\.starts_at, a\.id$/);
  // Every table it reads is bound to the tenant (CLAUDE.md rule 3).
  assert.match(SELECT_ROWS, /where n\.tenant_id = a\.tenant_id/);
  assert.match(SELECT_ROWS, /where l\.tenant_id = a\.tenant_id\s+and l\.entity_type = 'appointment'\s+and l\.entity_id = a\.id/);
  assert.doesNotMatch(CODE, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
  // One connection, opened lazily, after every refusal.
  assert.equal((CODE.match(/\bpostgres\(raw,/g) ?? []).length, 1);
  assert.equal((CODE.match(/= postgres\(/g) ?? []).length, 1, "a second connection is opened");
  assert.equal((CODE.match(/await import\("postgres"\)/g) ?? []).length, 1);
  assert.doesNotMatch(CODE, /^\s*import\s+postgres\b/m, "a static import would load the driver before the refusals");
  const refusals = CODE.indexOf("const refusal = preflight(args, target, env)");
  const history = CODE.indexOf("const history = readHistory(marker)");
  const theRead = CODE.indexOf("await read(raw, args.tenantSlug)");
  assert.ok(refusals > 0 && history > refusals && theRead > history, "refusals, then the marker, then the read: in that order");
});

test("the dry run reads the send history too, so its count is the count --confirm finds", () => {
  const history = CODE.indexOf("const history = readHistory(marker)");
  const dryExit = CODE.indexOf("if (!args.confirm) {");
  assert.ok(history > 0 && dryExit > history, "the history is no longer read before the dry-run exit");
});

test("the selected statuses are exactly the dispatcher's REMINDABLE_STATUSES", () => {
  const dispatch = readFileSync(join(ROOT, "apps/web/lib/reminders/dispatch.ts"), "utf8");
  const app = dispatch.match(/REMINDABLE_STATUSES = new Set\(\[([^\]]+)\]\)/)?.[1];
  const mine = SELECT_ROWS.match(/where a\.status::text in \(([^)]+)\)/)?.[1];
  const guard = CODE.match(/const REMINDABLE = \[([^\]]+)\]/)?.[1];
  assert.ok(app && mine && guard);
  const norm = (s) => [...s.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]).sort().join(",");
  assert.equal(norm(mine), norm(app));
  assert.equal(norm(guard), norm(app));
});

test("the unaccepted-request test is the database function's own, minus its JWT tenant line", () => {
  // The newest migration that defines the function is the definition production runs.
  const dir = join(ROOT, "packages/db/migrations");
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(join(dir, f), "utf8").includes("CREATE OR REPLACE FUNCTION public.is_unconfirmed_pedido("));
  assert.ok(defining.length >= 1, "no migration defines is_unconfirmed_pedido");
  const newest = readFileSync(join(dir, defining.at(-1)), "utf8");
  const body = newest
    .slice(newest.lastIndexOf("CREATE OR REPLACE FUNCTION public.is_unconfirmed_pedido("))
    .match(/AS \$\$([\s\S]*?)\$\$/)?.[1];
  assert.ok(body, "the function body was not found");
  const flat = (s) => s.replace(/\s+/g, " ").trim();
  assert.equal(
    flat(body),
    flat(`SELECT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = p_appointment
        AND a.tenant_id = public.jwt_tenant_id()
        AND a.status = 'scheduled'
        AND ( a.origin = 'patient_portal'
              OR EXISTS ( SELECT 1 FROM public.staff_notifications n
                          WHERE n.appointment_id = a.id AND n.kind = 'appointment_request' ) ) )`),
    `${defining.at(-1)} no longer defines the test this script derives; re-derive it`,
  );
  // The derivation: the same three predicates, with the tenant bound from $1 instead of the JWT.
  assert.match(
    flat(SELECT_ROWS),
    /\(a\.status = 'scheduled' and \(a\.origin = 'patient_portal' or exists \(select 1 from staff_notifications n where n\.tenant_id = a\.tenant_id and n\.appointment_id = a\.id and n\.kind = 'appointment_request'\)\)\) as unaccepted_request/,
  );
  assert.doesNotMatch(CODE, /is_unconfirmed_pedido\(/, "the function answers FALSE for every row without a JWT; it must not be called here");
  // And the dispatcher agrees about which origin is an online request.
  const dispatch = readFileSync(join(ROOT, "apps/web/lib/reminders/dispatch.ts"), "utf8");
  const origins = [...(dispatch.match(/PEDIDO_ORIGINS = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(origins, ["patient_portal"], "PEDIDO_ORIGINS changed; the derivation names one origin");
});

test("every emitting audit action and metadata key the read uses is still written by the app", () => {
  const read = (p) => readFileSync(join(ROOT, p), "utf8");
  const actions = read("apps/web/lib/scheduling/actions.ts");
  const batch = read("apps/web/lib/scheduling/batch.ts");
  const store = read("apps/web/lib/reminders/inbound-store.ts");
  const reply = read("apps/web/lib/reminders/inbound-reply.ts");
  const audit = read("apps/web/lib/scheduling/audit.ts");
  const pairs = [
    [actions, 'action: "appointment.create"'],
    [batch, 'action: "appointment.create"'],
    [actions, 'action: "appointment.reschedule"'],
    [actions, 'action: "appointment.update"'],
    [actions, "toStatus: patch.status"],
    [actions, 'via: "portal_request_confirm"'],
    [store, 'action: "appointment.sms_reply_reviewed"'],
    [store, "resolution: row.resolution"],
    [store, "applied: row.applied"],
    [reply, 'action: "appointment.patient_sms_reply"'],
    [reply, "outcome: row.outcome"],
    [audit, 'entityType: "appointment"'],
    [audit, "entityId: args.appointmentId"],
    [store, 'entityType: "appointment"'],
    [reply, 'entityType: "appointment"'],
  ];
  for (const [src, needle] of pairs) assert.ok(src.includes(needle), `the app no longer writes ${needle}`);
  for (const needle of [
    "l.action in ('appointment.create', 'appointment.reschedule')",
    "l.action = 'appointment.update'",
    "l.metadata ->> 'toStatus' in ('scheduled', 'confirmed')",
    "l.metadata ->> 'via' = 'portal_request_confirm'",
    "l.action = 'appointment.sms_reply_reviewed'",
    "l.metadata ->> 'resolution' = 'confirmed'",
    "l.metadata ->> 'applied' = 'true'",
    "l.action = 'appointment.patient_sms_reply'",
    "l.metadata ->> 'outcome' = 'confirmed'",
  ]) {
    assert.ok(SELECT_ROWS.includes(needle), `the read no longer tests ${needle}`);
  }
});

test("the preview offsets are the app's REMINDER_OFFSETS", () => {
  const offsets = readFileSync(join(ROOT, "apps/web/lib/reminders/offsets.ts"), "utf8");
  for (const [id, mins, ch] of [["48h", "48 \\* 60", "email"], ["24h", "24 \\* 60", "sms"]]) {
    const re = new RegExp(`id: "${id}", minutesBefore: ${mins}, channel: "${ch}"`);
    assert.match(offsets, re, `offsets.ts no longer says ${id}`);
    assert.match(SRC, re, `the script no longer says ${id}`);
  }
  assert.equal(OFFSETS.length, 2);
});

test("the script and its document carry no em dash and the document carries the question block", () => {
  const doc = readFileSync(join(ROOT, "docs/data-op-inc-1007-rearm-reminders.md"), "utf8");
  for (const [name, text] of [["script", SRC], ["document", doc]]) assert.doesNotMatch(text, /\u2014/, `${name} carries an em dash`);
  for (const word of ["blocked_what", "options", "recommendation", "NOT REHEARSED", "--i-checked-inngest-settings", "--fix-deployed-sha"]) {
    assert.ok(doc.includes(word), `the document does not carry ${word}`);
  }
});
