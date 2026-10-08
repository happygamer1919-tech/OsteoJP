// inc-1007-rearm-reminders-emit.test.mjs - the reminder re-arm emit's refusals,
// its row verdicts, its event, its marker and lock, and its contract with the
// reminder pipeline it feeds.
//
// NO DATABASE IS NEEDED AND NONE IS CONTACTED. The command-line tests stop at a
// refusal that fires before the script opens a connection. The whole-run tests
// call run() in this process with the database replaced by fixture rows and
// with a sink file, so nothing is sent anywhere. The ledger read (G3) is
// replaced the same way, and the wait before its second read is a recorded
// call, not a wait. Its SQL was proven on a real local Postgres outside this
// file; here it is pinned as text.
//
// THIS FILE NEVER HANDS THE PRODUCTION HOST TO CODE THAT CAN CONNECT. The script
// has database code and a network send, so a mutation that removed a check
// would turn any string here into a real connection. Every string given to the
// command line, to run() or to openReader() points at 127.0.0.1 port 1 (closed) or at a reserved
// `.invalid` host. The production string is built from the shared module's
// constants and is given ONLY to classifyTarget(), which is pure. The real
// sender is built once, for a pretend production target, and is never called.
// The real request function is only ever called with a fake fetch and an
// `.invalid` origin (memory rule: a guard test must never name a real host).
//
// The contract tests read the APP's source, so a renamed event, a changed
// status set, a moved offset, a renamed audit action, a redefined
// is_unconfirmed_pedido or a changed scheduler setting reddens this file
// instead of producing an emit that selects the wrong rows.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION } from "./production-target.mjs";
import {
  BACK_MS,
  CONFIRMATION_FILTER,
  DEFAULT_MAX,
  EVENT_NAME,
  EXECUTIONS_PER_EVENT,
  EXECUTION_LIMIT,
  Halt,
  INNGEST_ORIGIN,
  LEAD_MS,
  LEDGER_BOUND_MS,
  LEDGER_CHECK,
  OFFSETS,
  PER_SEND_BOUND_MS,
  READ_BOUND_MS,
  RECHECK_BOUND_MS,
  RECHECK_ROW,
  RUN_CAP_MS,
  SELECT_ROWS,
  SEND_TIMEOUT_MS,
  SETTLE_MS,
  SLACK_MS,
  TOUCH_MS,
  USAGE,
  attemptedEqualsSent,
  bucketOf,
  buildEvent,
  buildSender,
  changedSince,
  classifyTarget,
  describeError,
  inScope,
  ledgerAnswer,
  ledgerWindows,
  leftUnarmed24To48,
  marginMsFor,
  markTooClose,
  openReader,
  parseArgs,
  preflight,
  projectedExecutions,
  readHistory,
  run,
  runBudgetMs,
  sendToInngest,
  takeLock,
  tooLateToWait,
  underExecutionLimit,
  verdictOf,
  within24hCount,
  wouldSchedule,
  writeMarker,
} from "../packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs");
const SRC = readFileSync(SCRIPT, "utf8");
/** The script with its comments removed: its header quotes things the code must not do. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const FUNCTIONS = readFileSync(join(ROOT, "apps/web/lib/reminders/inngest/functions.ts"), "utf8");

/** A self-declared fixture password. Never a credential. */
const PW = "s3cr3t-do-not-print";
const LANE_URL = `postgresql://postgres:${PW}@127.0.0.1:1/postgres`;
const NEAR_PROD_URL = `postgresql://postgres.${PRODUCTION.ref}:${PW}@db.invalid:5432/postgres`;
const OTHER_URL = `postgresql://someone:${PW}@db.invalid:5432/postgres`;
const TWO_AT_URL = `postgresql://postgres:${PW}@db.invalid:5432,y@127.0.0.1:1/postgres`;
const SHA_OK = "abcdef0123abcdef0123abcdef0123abcdef0123";
const SLUG = ["--tenant-slug", "osteojp"];
const FULL_CONFIRM = [...SLUG, "--confirm", "--expect", "1", "--fix-deployed-sha", SHA_OK, "--i-checked-inngest-settings", "--max-days-ahead", "28"];
const NEITHER = /reads the exact production target or a strict LOCAL database/;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-10-07T12:00:00.000Z");
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apptId = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(n).padStart(4, "0")}`;
/** The margin of a default run (--max 25). */
const MARGIN = marginMsFor(DEFAULT_MAX);

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

/** The re-read of a row that nobody touched since the first read. */
const unchanged = (r) => ({
  starts_at: r.starts_at,
  status: r.status,
  patient_deleted: false,
  unaccepted_request: r.unaccepted_request,
  last_emit_at: r.last_emit_at,
});

/** What the ledger answers when no message left. */
const ZERO = { n: 0, handedOver: 0 };

/**
 * run() in this process: fixture rows, a sink file in a fresh folder, and every
 * printed line captured. `fresh(id, row)` replaces the re-read of one row.
 * `ledger(call, windows)` replaces the answer of the ledger read, `call` being
 * 1 for the read after the selection and 2 for the read after the sends.
 * `t0` replaces the read instant, for a read that comes hours after another.
 */
async function runWith(rows, argv, opts = {}) {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), "inc1007-run-"));
  const sink = join(dir, "sink.jsonl");
  const home = join(dir, "home");
  mkdirSync(home, { recursive: true });
  const lines = [];
  const reader = { opened: 0, closed: 0, rechecked: [], ledgers: [], slept: [], log: [] };
  const deps = {
    env: { DATABASE_URL_DIRECT: LANE_URL },
    home,
    out: opts.out ?? ((l) => lines.push(l)),
    openReader: async () => {
      if (opts.openFails) throw opts.openFails;
      reader.opened += 1;
      return {
        selection: async () => {
          if (opts.selectionFails) throw opts.selectionFails;
          return { tenantId: TENANT, t0: new Date(opts.t0 ?? T0), rows };
        },
        recheck: async (tenantId, id) => {
          assert.equal(tenantId, TENANT, "the re-read was not bound to the tenant");
          reader.rechecked.push(id);
          reader.log.push("recheck");
          const r = rows.find((x) => x.id === id);
          return opts.fresh ? opts.fresh(id, r) : unchanged(r);
        },
        ledger: async (tenantId, windows) => {
          assert.equal(tenantId, TENANT, "the ledger read was not bound to the tenant");
          reader.ledgers.push(windows);
          reader.log.push("ledger");
          return opts.ledger ? opts.ledger(reader.ledgers.length, windows) : ZERO;
        },
        close: async () => {
          reader.closed += 1;
        },
      };
    },
    // Never a real wait: the 20 s before the second ledger read is recorded and returns at once.
    sleep: async (ms) => {
      reader.slept.push(ms);
      reader.log.push("sleep");
    },
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.writeMarker ? { writeMarker: opts.writeMarker } : {}),
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
  return { dir, sink, home, lines, result, halt, events, marker, markerPath, lockPath: `${markerPath}.lock`, reader };
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
  for (const word of [
    "Inngest dashboard",
    "three things",
    "schedule-appointment-reminders shows Debounce",
    "send-appointment-reminder shows Singleton",
    "the trigger of send-appointment-confirmation shows the expression event.data.confirmationEligible == true",
    "every event starts the confirmation function, and a patient who booked online gets a booking confirmation",
  ]) {
    assert.ok(r.stderr.includes(word), `the refusal does not name ${word}`);
  }
});

test("--max-days-ahead: a whole number from 2 up, above --min-days-ahead, and absent means no bound", () => {
  // "02" and "028" read as 2 and 28 to Number(): a leading zero is refused, not read.
  for (const value of ["0", "1", "01", "02", "028", "2.5", "ten", "10000", "-3"]) {
    assert.throws(() => parseArgs([...SLUG, "--max-days-ahead", value]), (e) => e instanceof Halt && e.code === 2 && /--max-days-ahead (must be a whole number, 2 or more|needs a value)/.test(e.message), value);
  }
  assert.equal(parseArgs([...SLUG, "--max-days-ahead", "2"]).maxDaysAhead, 2);
  assert.equal(parseArgs([...SLUG, "--max-days-ahead", "28"]).maxDaysAhead, 28);
  assert.equal(parseArgs([...SLUG, "--max-days-ahead", "9999"]).maxDaysAhead, 9999);
  assert.equal(parseArgs(SLUG).maxDaysAhead, null, "absent is no bound, and says so as null");
  // It must leave room above the lower bound: equal is refused, one more is taken.
  const both = (min, max) => [...SLUG, "--min-days-ahead", String(min), "--max-days-ahead", String(max)];
  for (const [min, max] of [[3, 3], [5, 4], [28, 3], [10, 9]]) {
    assert.throws(() => parseArgs(both(min, max)), (e) => e instanceof Halt && e.code === 2 && /--max-days-ahead must be greater than --min-days-ahead/.test(e.message), `${min} ${max}`);
  }
  assert.deepEqual([parseArgs(both(3, 4)).minDaysAhead, parseArgs(both(3, 4)).maxDaysAhead], [3, 4]);
  // Compared as numbers, not as text: 9 is below 10.
  assert.equal(parseArgs(both(9, 10)).maxDaysAhead, 10);
  // And through the command line, with the exit code.
  const r = cli([...SLUG, "--max-days-ahead", "1"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BAD INVOCATION: --max-days-ahead must be a whole number, 2 or more/);
  for (const word of ["--max-days-ahead", "G1", "G3", "G4", String(EXECUTION_LIMIT)]) assert.ok(USAGE.includes(word), `the usage does not carry ${word}`);
});

test("a real --confirm must state --max-days-ahead; a dry run and a sink run need not", () => {
  const withoutIt = FULL_CONFIRM.slice(0, -2);
  const r = cli(withoutIt, { DATABASE_URL_DIRECT: LANE_URL, INNGEST_EVENT_KEY: "k" });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /BAD INVOCATION: --confirm needs --max-days-ahead <D>\. How many days ahead this operation reaches is a ruled scope, and a real run must state it/);
  assert.doesNotMatch(r.stdout, /target {3}/, "it went on past the refusal");
  assert.equal(parseArgs(FULL_CONFIRM).maxDaysAhead, 28);
  assert.equal(parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl", "--confirm", "--expect", "3"]).maxDaysAhead, null);
  assert.equal(parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl"]).maxDaysAhead, null);
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

test("a target that is neither production nor a strict local database is refused in EVERY mode, the dry run included", () => {
  const sink = join(mkdtempSync(join(tmpdir(), "inc1007-sink-")), "sink.jsonl");
  for (const url of [
    OTHER_URL,
    `${LANE_URL}?sslmode=disable`,
    // Two "@": new URL() reads 127.0.0.1 here, and postgres.js would try db.invalid first.
    TWO_AT_URL,
  ]) {
    for (const extra of [[], ["--sink-file", sink], ["--sink-file", sink, "--confirm", "--expect", "1"], FULL_CONFIRM.slice(2)]) {
      const r = cli([...SLUG, ...extra], { DATABASE_URL_DIRECT: url, INNGEST_EVENT_KEY: "k" });
      assert.equal(r.status, 1, `${extra.join(" ")}: ${r.stderr}`);
      assert.match(r.stderr, NEITHER);
      assert.doesNotMatch(r.stdout, /tenant {3}/, "it read the database");
    }
  }
  // A list of hosts does not parse at all, and is refused for that.
  const list = cli([...SLUG, "--sink-file", sink], { DATABASE_URL_DIRECT: `postgresql://postgres:${PW}@127.0.0.1:1,db.invalid:5432/postgres` });
  assert.equal(list.status, 2, list.stderr);
  assert.match(list.stderr, /the connection string cannot be used/);
  assert.equal(existsSync(sink), false);
});

test("only the verdict about the target is printed: no host, no port, no other parsed piece of the string", () => {
  // An unencoded "/" after leading digits in a password makes those digits parse as the PORT.
  // What then parses as the host is a reserved name, so even a broken check contacts nothing real.
  const malformed = "postgresql://user.invalid:54321/fixture-not-a-secret@127.0.0.1:1/postgres";
  const r = cli(SLUG, { DATABASE_URL_DIRECT: malformed });
  assert.equal(r.status, 1);
  assert.match(r.stderr, NEITHER);
  assert.doesNotMatch(r.stdout + r.stderr, /54321|fixture-not-a-secret/);
  assert.match(r.stdout, /^target {3}NEITHER PRODUCTION NOR A STRICT LOCAL DATABASE$/m);
  const local = cli(SLUG, { DATABASE_URL_DIRECT: LANE_URL });
  assert.match(local.stdout, /^target {3}NOT production \(a strict local database\)$/m);
  assert.doesNotMatch(local.stdout, /127\.0\.0\.1|\bhost\b|\bport\b|\bref\b/);
  assert.match(cli(SLUG, { DATABASE_URL_DIRECT: NEAR_PROD_URL }).stdout, /^target {3}NAMES PRODUCTION BUT IS NOT THE EXACT TARGET$/m);
  assert.doesNotMatch(CODE, /target\.seen|seen:|\.hostname|\.port\b|\.username/, "a parsed piece of the connection string is carried around");
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
  const r = cli(FULL_CONFIRM, { DATABASE_URL_DIRECT: LANE_URL, INNGEST_EVENT_KEY: "k" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /target is NOT production/);
});

test("an unreadable marker is refused, never treated as an empty history", () => {
  const home = mkdtempSync(join(tmpdir(), "inc1007-garbled-"));
  const marker = join(home, ".osteojp-inc1007-rearm.json");
  for (const [text, msg] of [
    ["not json\n", /is not JSON/],
    ["{}\n", /has no history list/],
    [JSON.stringify({ history: [{ at: "x", sent: [] }] }), /holds an entry with no row list/],
    [JSON.stringify({ history: [{ at: "x", rows: [{ id: apptId(1), startsAt: "2026-10-10T00:00:00.000Z", state: "maybe" }] }] }), /holds a row this script cannot read/],
    [JSON.stringify({ history: [{ at: "x", rows: [{ id: apptId(1), state: "sent" }] }] }), /holds a row this script cannot read/],
  ]) {
    writeFileSync(marker, text);
    const r = cli(SLUG, { HOME: home, DATABASE_URL_DIRECT: LANE_URL });
    assert.equal(r.status, 1, text);
    assert.match(r.stderr, msg);
  }
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

test("--confirm refuses BEFORE connecting while another run holds the lock, and leaves that lock alone", () => {
  const sink = join(mkdtempSync(join(tmpdir(), "inc1007-locked-")), "sink.jsonl");
  const lock = `${sink}.marker.json.lock`;
  writeFileSync(lock, JSON.stringify({ pid: 4242, at: "2026-10-07T21:30:00.000Z" }) + "\n");
  const r = cli([...SLUG, "--sink-file", sink, "--confirm", "--expect", "1"], { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /another run holds the lock .*pid 4242, taken 2026-10-07T21:30:00\.000Z/);
  assert.match(r.stderr, /delete the lock file by hand/);
  assert.doesNotMatch(r.stderr, /the read failed/, "it reached the database");
  assert.equal(existsSync(lock), true, "a refused run removed somebody else's lock");
  // A dry run sends nothing and is not held up by the lock: it goes on to the read.
  const dry = cli([...SLUG, "--sink-file", sink], { DATABASE_URL_DIRECT: LANE_URL });
  assert.match(dry.stderr, /FAILED: the read failed/);
  assert.equal(existsSync(lock), true);
});

test("a dry run against a closed local port fails on the read, exit 1, and sends nothing", () => {
  // Proves the order: every refusal above fired BEFORE this point.
  const r = cli(SLUG, { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  // The error's name and code, and never the driver's message: that one names the host and the port.
  assert.match(r.stderr, /^FAILED: the read failed: [A-Za-z]+ ECONNREFUSED$/m);
  assert.doesNotMatch(r.stdout + r.stderr, /127\.0\.0\.1|:1\b|connect |postgres:/, "a piece of the connection string was printed");
  assert.match(r.stdout, /DRY RUN - nothing is sent/);
  assert.match(r.stdout, /CANNOT verify what is deployed/);
  // And a confirm that fails on the read gives its lock back.
  const sink = join(mkdtempSync(join(tmpdir(), "inc1007-unlock-")), "sink.jsonl");
  const c = cli([...SLUG, "--sink-file", sink, "--confirm", "--expect", "1"], { DATABASE_URL_DIRECT: LANE_URL });
  assert.match(c.stderr, /FAILED: the read failed/);
  assert.equal(existsSync(`${sink}.marker.json.lock`), false, "a failed run left its lock behind");
});

/* ---- the target and the refusals, as pure functions ------------------------ */

test("classifyTarget reads production only from the exact target, local only from the strict form, and returns no piece of the string", () => {
  // Built from the shared module's constants and given to a PURE function only.
  const prod = `postgresql://postgres.${PRODUCTION.ref}:${PW}@${PRODUCTION.host}:${PRODUCTION.port}/${PRODUCTION.database}`;
  assert.deepEqual(classifyTarget(prod), { kind: "production", why: null });
  assert.equal(classifyTarget(prod.replace(":5432/", ":6543/")).kind, "near-production");
  assert.equal(classifyTarget(NEAR_PROD_URL).kind, "near-production");
  assert.equal(classifyTarget(`postgresql://postgres:${PW}@${PRODUCTION.host}:5432/postgres`).kind, "near-production");
  assert.equal(classifyTarget(`${LANE_URL}?application_name=${PRODUCTION.ref}`).kind, "near-production");
  assert.deepEqual(classifyTarget(LANE_URL), { kind: "local", why: null });
  assert.equal(classifyTarget(`postgres://postgres:${PW}@localhost:54522/postgres`).kind, "local");
  assert.equal(classifyTarget(`${LANE_URL}?sslmode=disable`).kind, "other");
  // The strict local form: one "@", and no "," before it.
  assert.equal(classifyTarget(`postgresql://someone:${PW}@db.invalid@127.0.0.1:1/postgres`).kind, "other");
  assert.equal(classifyTarget(`postgresql://some,one:${PW}@127.0.0.1:1/postgres`).kind, "other");
  assert.equal(classifyTarget(OTHER_URL).kind, "other");
  assert.equal(classifyTarget("not a url at all").kind, "unreadable");
  assert.equal(classifyTarget("").kind, "unreadable");
  for (const url of [prod, NEAR_PROD_URL, LANE_URL, OTHER_URL, "not a url at all"]) {
    assert.deepEqual(Object.keys(classifyTarget(url)).sort(), ["kind", "why"]);
  }
});

test("preflight: only production and strict local are read, the sink is refused on production, a real confirm passes only on production", () => {
  const confirm = parseArgs(FULL_CONFIRM);
  const sinkArgs = parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl"]);
  const dry = parseArgs(SLUG);
  const kind = (k) => ({ kind: k, why: "why" });
  assert.match(preflight(sinkArgs, kind("production"), {}).msg, /--sink-file is for rehearsal and the target is PRODUCTION/);
  assert.equal(preflight(sinkArgs, kind("production"), {}).code, 1);
  assert.equal(preflight(sinkArgs, kind("local"), {}), null);
  assert.equal(preflight(confirm, kind("production"), { INNGEST_EVENT_KEY: "k" }), null);
  assert.match(preflight(confirm, kind("production"), {}).msg, /INNGEST_EVENT_KEY is not set/);
  assert.match(preflight(confirm, kind("production"), { INNGEST_EVENT_KEY: "k", INNGEST_DEV: "1" }).msg, /INNGEST_DEV is set/);
  assert.match(preflight(confirm, kind("local"), { INNGEST_EVENT_KEY: "k" }).msg, /target is NOT production/);
  for (const args of [confirm, sinkArgs, dry]) {
    assert.equal(preflight(args, kind("near-production"), { INNGEST_EVENT_KEY: "k" }).code, 1);
    assert.equal(preflight(args, kind("unreadable"), { INNGEST_EVENT_KEY: "k" }).code, 2);
    assert.match(preflight(args, kind("other"), { INNGEST_EVENT_KEY: "k" }).msg, NEITHER);
    assert.equal(preflight(args, kind("other"), { INNGEST_EVENT_KEY: "k" }).code, 1);
    // A kind nobody has heard of is refused too: the rule names what is allowed.
    assert.match(preflight(args, kind("something-new"), { INNGEST_EVENT_KEY: "k" }).msg, NEITHER);
  }
  for (const k of ["production", "local"]) assert.equal(preflight(dry, kind(k), {}), null);
});

test("a sink run asks nobody to vouch for the scheduler; a real confirm always does", () => {
  const sink = parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl", "--confirm", "--expect", "3"]);
  assert.equal(sink.checkedInngest, false);
  assert.equal(sink.fixDeployedSha, undefined);
  assert.equal(sink.resendAttempted, false);
  assert.equal(parseArgs([...SLUG, "--resend-attempted"]).resendAttempted, true);
  assert.throws(() => parseArgs([...SLUG, "--confirm", "--expect", "3"]), /--confirm needs --fix-deployed-sha/);
  assert.equal(parseArgs(SLUG).max, DEFAULT_MAX);
  assert.equal(DEFAULT_MAX, 25, "the first real run is a canary of 25");
});

test("the real sender is built only for the exact production target with a key, and the sink sender only for a sink run", () => {
  const real = parseArgs(FULL_CONFIRM);
  const sink = parseArgs([...SLUG, "--sink-file", "/tmp/x.jsonl", "--confirm", "--expect", "1"]);
  for (const k of ["local", "other", "near-production", "unreadable"]) {
    assert.throws(() => buildSender(real, { kind: k }, { INNGEST_EVENT_KEY: "fixture-key" }), /the real send is for the exact production target only/);
  }
  assert.throws(() => buildSender(real, { kind: "production" }, {}), /the real send is for the exact production target only/);
  // The accepting arm. It returns a function and calls nothing; the function is NEVER called here.
  assert.equal(typeof buildSender(real, { kind: "production" }, { INNGEST_EVENT_KEY: "fixture-key" }), "function");
  assert.equal(typeof buildSender(sink, { kind: "local" }, {}), "function");
  assert.match(CODE, /const send = buildSender\(args, target, env\);/);
});

/* ---- the margin around the reminder marks ---------------------------------- */

test("the bounds, the budget and the margin are the stated numbers", () => {
  assert.equal(LEAD_MS, 24 * HOUR);
  assert.equal(TOUCH_MS, 25 * HOUR);
  assert.equal(SEND_TIMEOUT_MS, 10_000);
  assert.equal(RECHECK_BOUND_MS, 5_000);
  assert.equal(PER_SEND_BOUND_MS, 15_000);
  assert.equal(RUN_CAP_MS, 600_000);
  assert.equal(READ_BOUND_MS, 30_000);
  assert.equal(SLACK_MS, 60_000);
  assert.equal(BACK_MS, 60_000);
  assert.equal(LEDGER_BOUND_MS, 10_000);
  assert.equal(SETTLE_MS, 20_000);
  assert.equal(runBudgetMs(1), 15_000);
  assert.equal(runBudgetMs(25), 375_000);
  assert.equal(runBudgetMs(40), 600_000);
  assert.equal(runBudgetMs(1000), 600_000);
  assert.equal(marginMsFor(1), 105_000);
  assert.equal(marginMsFor(25), 465_000);
  assert.equal(marginMsFor(40), 690_000);
  assert.equal(marginMsFor(1000), 690_000);
  // The request is bounded by the constant the margin was derived from.
  assert.match(CODE, /signal: AbortSignal\.timeout\(SEND_TIMEOUT_MS\)/);
  assert.match(CODE, /within\(reader\.recheck\(tenantId, row\.id\), RECHECK_BOUND_MS, /);
  // And the slack is far above the debounce it has to cover.
  const period = FUNCTIONS.match(/REMINDER_SCHEDULE_DEBOUNCE = \{[^}]*period: "(\d+)s"/)?.[1];
  assert.ok(period, "the debounce period was not found in functions.ts");
  assert.ok(SLACK_MS >= 10 * Number(period) * 1000, "the slack no longer covers the debounce ten times over");
  // The wait before the second ledger read covers the debounce ten times over too...
  assert.ok(SETTLE_MS >= 10 * Number(period) * 1000, "the settle no longer covers the debounce ten times over");
  // ...and stays inside the slack, the bounded read after it included: the second
  // read ends before the margin does, so before any mark of a row this run sent.
  assert.ok(SETTLE_MS < SLACK_MS, "the settle is no longer below the slack");
  assert.ok(SETTLE_MS + LEDGER_BOUND_MS < SLACK_MS, "the settle and the read after it no longer fit inside the slack");
  assert.match(CODE, /within\(reader\.ledger\(tenantId, windows\), LEDGER_BOUND_MS, "the ledger read"\)/);
  assert.match(CODE, /await sleep\(SETTLE_MS\);/);
});

test("a mark from 60 s before the read to the margin after it is too close; outside that it is not", () => {
  const m = MARGIN;
  const startFor = (offsetHours, markMs) => markMs + offsetHours * HOUR;
  for (const [hours, id] of [[24, "24h"], [48, "48h"]]) {
    assert.equal(markTooClose(startFor(hours, T0 + m), T0, m), id, `${id} mark exactly at the margin`);
    assert.equal(markTooClose(startFor(hours, T0 + m + 1), T0, m), null, `${id} mark 1 ms past the margin`);
    assert.equal(markTooClose(startFor(hours, T0 + 1), T0, m), id);
    assert.equal(markTooClose(startFor(hours, T0), T0, m), id, `${id} mark at the read instant`);
    assert.equal(markTooClose(startFor(hours, T0 - BACK_MS + 1), T0, m), id, `${id} mark 59.999 s before the read`);
    assert.equal(markTooClose(startFor(hours, T0 - BACK_MS), T0, m), null, `${id} mark exactly 60 s before the read`);
  }
  assert.equal(markTooClose(T0 + 36 * HOUR, T0, m), null);
  assert.equal(markTooClose(T0 + 10 * DAY, T0, m), null);
});

/* ---- the verdict ----------------------------------------------------------- */

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
/** No margin, so the plain 24 hour and 25 hour boundaries can be read alone. */
const OPTS = { minDaysAhead: 1, marginMs: 0, resendAttempted: false, sent: () => false, attempted: () => false };
const WITH_MARGIN = { ...OPTS, marginMs: MARGIN };
const at = (ms) => new Date(ms).toISOString();

test("a row starting exactly 24 hours after the read is NOT emitted; with no margin, one millisecond later it is", () => {
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR - 1) }), T0, OPTS), "inside_24h");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR) }), T0, OPTS), "inside_24h");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR + 1) }), T0, OPTS), "emit");
});

test("with the margin, the floor is 24 hours plus the margin, and the 48 hour mark holds a row back on both sides", () => {
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR + 1) }), T0, WITH_MARGIN), "near_mark");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR + MARGIN) }), T0, WITH_MARGIN), "near_mark");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR + MARGIN + 1) }), T0, WITH_MARGIN), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 48 * HOUR + MARGIN) }), T0, WITH_MARGIN), "near_mark");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 48 * HOUR + MARGIN + 1) }), T0, WITH_MARGIN), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 48 * HOUR - BACK_MS + 1) }), T0, WITH_MARGIN), "near_mark");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 48 * HOUR - BACK_MS) }), T0, WITH_MARGIN), "emit");
  // A larger batch has a larger margin.
  const big = { ...OPTS, marginMs: marginMsFor(1000) };
  assert.equal(verdictOf(row({ startsAt: at(T0 + 24 * HOUR + MARGIN + 1) }), T0, big), "near_mark");
});

test("a row held back for its 48 hour mark can be sent only from 60 s after that mark until its 24 hour mark nears", () => {
  const mark = T0 + 120_000; // the 48 hour mark is 2 minutes after the first read
  const held = row({ startsAt: at(mark + 48 * HOUR) });
  const later = (t) => verdictOf(held, t, WITH_MARGIN);
  assert.equal(later(T0), "near_mark");
  // Too early: the mark is ahead, or passed less than 60 s ago.
  assert.equal(later(mark), "near_mark");
  assert.equal(later(mark + BACK_MS - 1), "near_mark");
  // The window opens 60 s after the mark...
  assert.equal(later(mark + BACK_MS), "emit");
  assert.equal(later(T0 + 23 * HOUR), "emit", "a run 23 hours after the first read no longer reaches it");
  // ...and closes when the 24 hour mark comes inside the later run's margin.
  assert.equal(later(mark + 24 * HOUR - MARGIN - 1), "emit");
  assert.equal(later(mark + 24 * HOUR - MARGIN), "near_mark");
  // A run a day or more after the first one finds it inside 24 hours, for good.
  assert.equal(later(mark + 24 * HOUR), "inside_24h");
  assert.equal(later(T0 + 25 * HOUR), "inside_24h");
  // "Within 23 hours of this read" is true for every row the first read can hold back, at the largest margin.
  const big = marginMsFor(1000);
  const earliestMark = T0 - BACK_MS + 1;
  assert.ok(earliestMark + 24 * HOUR - big - 1 > T0 + 23 * HOUR);
  assert.equal(verdictOf(row({ startsAt: at(earliestMark + 48 * HOUR) }), T0 + 23 * HOUR, { ...OPTS, marginMs: big }), "emit");
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
  assert.equal(verdictOf(row({ unacceptedRequest: true }), T0, { ...OPTS, resendAttempted: true, attempted: () => true }), "unaccepted_request");
});

test("the marker: a sent row is skipped for good, an attempted row is skipped until --resend-attempted", () => {
  assert.equal(verdictOf(row(), T0, { ...OPTS, sent: () => true }), "already_sent");
  assert.equal(verdictOf(row(), T0, { ...OPTS, attempted: () => true }), "attempted");
  assert.equal(verdictOf(row(), T0, { ...OPTS, attempted: () => true, resendAttempted: true }), "emit");
  // The flag never brings back a row that was sent, and with no attempt on record it changes nothing.
  assert.equal(verdictOf(row(), T0, { ...OPTS, sent: () => true, attempted: () => true, resendAttempted: true }), "already_sent");
  assert.equal(verdictOf(row(), T0, { ...OPTS, resendAttempted: true }), "emit");
});

test("the first reason wins, in the order of the report", () => {
  const all = { minDaysAhead: 30, maxDaysAhead: 35, marginMs: MARGIN, resendAttempted: false, sent: () => true, attempted: () => true };
  const near = at(T0 + 24 * HOUR + 1000);
  const far = at(T0 + 36 * DAY);
  assert.equal(verdictOf(row({ unacceptedRequest: true, startsAt: at(T0 + HOUR), lastEmitAt: at(T0 - HOUR) }), T0, all), "unaccepted_request");
  assert.equal(verdictOf(row({ startsAt: at(T0 + HOUR), lastEmitAt: at(T0 - HOUR) }), T0, all), "inside_24h");
  // Beyond the upper bound comes after the first two and before everything the marker and the audit trail say.
  assert.equal(verdictOf(row({ unacceptedRequest: true, startsAt: far, lastEmitAt: at(T0 - HOUR) }), T0, all), "unaccepted_request");
  assert.equal(verdictOf(row({ startsAt: far, lastEmitAt: at(T0 - HOUR) }), T0, all), "beyond_max_days");
  assert.equal(verdictOf(row({ startsAt: far }), T0, all), "beyond_max_days");
  assert.equal(verdictOf(row({ startsAt: far }), T0, { ...all, maxDaysAhead: null }), "already_sent");
  assert.equal(verdictOf(row({ startsAt: near, lastEmitAt: at(T0 - HOUR) }), T0, all), "touched_25h");
  assert.equal(verdictOf(row({ startsAt: near }), T0, all), "already_sent");
  assert.equal(verdictOf(row({ startsAt: near }), T0, { ...all, sent: () => false }), "attempted");
  assert.equal(verdictOf(row({ startsAt: near }), T0, { ...all, sent: () => false, attempted: () => false }), "near_mark");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 3 * DAY) }), T0, { ...all, sent: () => false, attempted: () => false }), "held_back");
});

test("--max-days-ahead: a row exactly D days after the read is in scope, one millisecond later it is not, and no flag is no bound", () => {
  const d28 = { ...OPTS, maxDaysAhead: 28 };
  assert.equal(verdictOf(row({ startsAt: at(T0 + 28 * DAY - 1) }), T0, d28), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 28 * DAY) }), T0, d28), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 28 * DAY + 1) }), T0, d28), "beyond_max_days");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 400 * DAY) }), T0, d28), "beyond_max_days");
  // The bound is in DAYS: the smallest one allowed keeps the whole of the next 48 hours in scope.
  // (A row exactly 48 hours ahead has its 48 hour mark AT the read, so it is held back for that mark, not for the bound.)
  assert.equal(verdictOf(row({ startsAt: at(T0 + 2 * DAY - BACK_MS) }), T0, { ...OPTS, maxDaysAhead: 2 }), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 2 * DAY) }), T0, { ...OPTS, maxDaysAhead: 2 }), "near_mark");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 2 * DAY + 1) }), T0, { ...OPTS, maxDaysAhead: 2 }), "beyond_max_days");
  // Not given: null from the command line, absent from an older caller. Neither is a bound.
  assert.equal(verdictOf(row({ startsAt: at(T0 + 400 * DAY) }), T0, { ...OPTS, maxDaysAhead: null }), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 400 * DAY) }), T0, OPTS), "emit");
  // A row inside 24 hours is never called "beyond".
  assert.equal(verdictOf(row({ startsAt: at(T0 + HOUR) }), T0, d28), "inside_24h");
});

test("--min-days-ahead only narrows", () => {
  const three = { ...OPTS, minDaysAhead: 3 };
  assert.equal(verdictOf(row({ startsAt: at(T0 + 3 * DAY - 1) }), T0, three), "held_back");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 3 * DAY) }), T0, three), "emit");
  assert.equal(verdictOf(row({ startsAt: at(T0 + 23 * HOUR) }), T0, three), "inside_24h");
});

test("a touched row that will be too near its start before its 25 hours are up is counted as out of reach", () => {
  // Reachable only if start > last emit + 25 h + 24 h + the margin.
  const touchedAt = T0 - HOUR;
  const edge = touchedAt + 49 * HOUR + MARGIN;
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(edge) }), MARGIN), true);
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(edge - 1) }), MARGIN), true);
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(edge + 1) }), MARGIN), false);
  assert.equal(tooLateToWait(row({ lastEmitAt: at(touchedAt), startsAt: at(touchedAt + 49 * HOUR + 1) }), 0), false);
  assert.equal(tooLateToWait(row({ lastEmitAt: null, startsAt: at(T0 + 25 * HOUR) }), MARGIN), false);
});

test("the re-read before a send: a moved, changed, re-saved or vanished row is not sent", () => {
  const r = row();
  const same = { starts_at: new Date(r.startsAt), status: "scheduled", patient_deleted: false, unaccepted_request: false, last_emit_at: new Date(r.lastEmitAt) };
  assert.equal(changedSince(r, same), null);
  assert.equal(changedSince(r, { ...same, status: "confirmed" }), null, "confirmed is still remindable");
  assert.equal(changedSince(r, { ...same, last_emit_at: new Date(Date.parse(r.lastEmitAt) - 1) }), null);
  assert.equal(changedSince(row({ lastEmitAt: null }), { ...same, last_emit_at: null }), null);
  assert.equal(changedSince(r, null), "gone");
  assert.equal(changedSince(r, undefined), "gone");
  assert.equal(changedSince(r, { ...same, starts_at: new Date(Date.parse(r.startsAt) + 1) }), "moved");
  assert.equal(changedSince(r, { ...same, starts_at: new Date(Date.parse(r.startsAt) + HOUR) }), "moved");
  assert.equal(changedSince(r, { ...same, starts_at: "never" }), "moved");
  for (const status of ["cancelled", "completed", "no_show"]) assert.equal(changedSince(r, { ...same, status }), "status");
  assert.equal(changedSince(r, { ...same, patient_deleted: true }), "status");
  assert.equal(changedSince(r, { ...same, unaccepted_request: true }), "status");
  // A re-read that does not say is not read as "fine".
  assert.equal(changedSince(r, { ...same, patient_deleted: undefined }), "status");
  assert.equal(changedSince(r, { ...same, unaccepted_request: null }), "status");
  assert.equal(changedSince(r, { ...same, last_emit_at: new Date(Date.parse(r.lastEmitAt) + 1) }), "saved_again");
  assert.equal(changedSince(row({ lastEmitAt: null }), same), "saved_again");
  // A moved row is reported as moved even when it was also saved again.
  assert.equal(changedSince(r, { ...same, starts_at: new Date(T0 + 9 * DAY), last_emit_at: new Date(T0) }), "moved");
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

test("the event is a name and exactly four data keys, confirmationEligible false, and it carries NO id", () => {
  const r = row();
  const event = buildEvent(r);
  assert.deepEqual(event, {
    name: "appointment/scheduled",
    data: { appointmentId: r.id, tenantId: TENANT, startsAt: r.startsAt, confirmationEligible: false },
  });
  assert.deepEqual(Object.keys(event).sort(), ["data", "name"]);
  assert.equal("id" in event, false, "a supplied id is what destroys a reminder on a repeat");
  assert.deepEqual(Object.keys(event.data).sort(), ["appointmentId", "confirmationEligible", "startsAt", "tenantId"]);
  assert.equal(event.data.confirmationEligible, false);
  assert.match(event.data.startsAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, "startsAt is not ISO UTC");
  assert.doesNotMatch(CODE, /confirmationEligible: true/);
  assert.doesNotMatch(CODE, /acceptedPedido|acceptedGuestRequest/, "a re-arm is never an acceptance");
  assert.doesNotMatch(CODE, /inc1007-rearm:/, "the script builds an event id again");
  assert.doesNotMatch(SRC, /Inngest drops a repe/, "the script claims again that a repeated id is dropped; it is not");
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

test("the scheduler settings this script relies on are the ones functions.ts carries", () => {
  // A test cannot guard a run: the owner's look at the dashboard does that. This
  // pins what the script's safety argument was measured against.
  const block = (id) => {
    const start = FUNCTIONS.indexOf(`id: "${id}"`);
    assert.ok(start > 0, `${id} not found in functions.ts`);
    return FUNCTIONS.slice(start, FUNCTIONS.indexOf("async ({", start));
  };
  // The two function ids the refusal sentence names, and the setting each must show.
  assert.match(block("schedule-appointment-reminders"), /debounce: REMINDER_SCHEDULE_DEBOUNCE,/);
  assert.match(block("send-appointment-reminder"), /singleton: REMINDER_SINGLETON,/);
  assert.match(block("send-appointment-reminder"), /cancelOn: REMINDER_SUPERSEDE_CANCEL_ON,/);
  assert.match(block("send-appointment-reminder"), /idempotency: REMINDER_IDEMPOTENCY_KEY,/);
  // Newest wins: one live run per appointment, offset and channel.
  const singleton = FUNCTIONS.match(/export const REMINDER_SINGLETON = \{([^}]*)\} as const;/)?.[1];
  assert.ok(singleton, "REMINDER_SINGLETON not found");
  assert.match(singleton, /mode: "cancel"/);
  assert.match(singleton, /key: 'event\.data\.appointmentId \+ ":" \+ event\.data\.offsetId \+ ":" \+ event\.data\.channel'/);
  const debounce = FUNCTIONS.match(/export const REMINDER_SCHEDULE_DEBOUNCE = \{([^}]*)\} as const;/)?.[1];
  assert.ok(debounce, "REMINDER_SCHEDULE_DEBOUNCE not found");
  assert.match(debounce, /key: "event\.data\.appointmentId"/);
  assert.match(debounce, /period: "2s"/);
  // The reminder key ends with the id of the event it was fanned out from...
  assert.match(FUNCTIONS, /export const REMINDER_IDEMPOTENCY_KEY =\s*'[^']*\+ ":" \+ event\.data\.scheduledBy';/);
  // ...and that id is `event.id`, which is why this script must never supply one twice, and supplies none.
  assert.match(FUNCTIONS, /export function reminderScheduledBy\(event: \{ id\?: string; ts\?: number \}\): string \{\s*if \(typeof event\.id === "string" && event\.id\.length > 0\) return event\.id;/);
  assert.match(FUNCTIONS, /scheduledBy: reminderScheduledBy\(event\),/);
  // The confirmation only starts on `true`, so `false` sends none.
  assert.match(FUNCTIONS, /CONFIRMATION_TRIGGER_FILTER = "event\.data\.confirmationEligible == true"/);
  // The third thing the refusal sentence names: the filter is the script's own
  // constant, character for character, and it sits on the TRIGGER of the
  // confirmation function, which is where the dashboard shows it.
  assert.equal(CONFIRMATION_FILTER, FUNCTIONS.match(/export const CONFIRMATION_TRIGGER_FILTER = "([^"]+)";/)?.[1]);
  assert.equal(CONFIRMATION_FILTER, "event.data.confirmationEligible == true");
  assert.match(block("send-appointment-confirmation"), /triggers: \[\{ event: EVENT_APPOINTMENT_SCHEDULED, if: CONFIRMATION_TRIGGER_FILTER \}\],/);
  assert.equal((FUNCTIONS.match(/CONFIRMATION_TRIGGER_FILTER/g) ?? []).length, 2, "the filter is used somewhere besides its definition and the one trigger");
});

test("G1: 8 executions per event is what functions.ts costs, counted from its runs and steps", () => {
  // The vendor counts one execution per function run and one per step.
  const whole = (id) => {
    const start = FUNCTIONS.indexOf(`id: "${id}"`);
    assert.ok(start > 0, `${id} not found in functions.ts`);
    const next = FUNCTIONS.indexOf("inngest.createFunction(", start);
    return FUNCTIONS.slice(start, next === -1 ? FUNCTIONS.length : next);
  };
  const steps = (id) => (whole(id).match(/\bstep\.[A-Za-z]+\(/g) ?? []).length;
  assert.equal(steps("schedule-appointment-reminders"), 1, "the fan-out gained or lost a step");
  assert.equal(steps("send-appointment-reminder"), 2, "the reminder gained or lost a step");
  // One fan-out run, and one reminder run per offset. The confirmation is not started: its trigger filter is false.
  const runs = 1 + OFFSETS.length;
  const allSteps = steps("schedule-appointment-reminders") + OFFSETS.length * steps("send-appointment-reminder");
  assert.deepEqual([runs, allSteps], [3, 5]);
  assert.equal(EXECUTIONS_PER_EVENT, runs + allSteps);
  assert.equal(EXECUTIONS_PER_EVENT, 8);
  assert.equal(EXECUTION_LIMIT, 20_000);
  // EXACTLY TWO functions IN functions.ts listen to the event this script sends (a listener
  // in another file would not redden this test): the fan-out, and the
  // confirmation behind its filter. A third listener would cost executions the 8 does not count.
  const triggers = [...FUNCTIONS.matchAll(/^\s*triggers: (\[.*\]),$/gm)].map((m) => m[1]);
  assert.equal(triggers.length, (FUNCTIONS.match(/inngest\.createFunction\(/g) ?? []).length, "a function declares its triggers in a shape this test does not read");
  assert.deepEqual(
    triggers.filter((t) => t.includes("EVENT_APPOINTMENT_SCHEDULED")),
    ["[{ event: EVENT_APPOINTMENT_SCHEDULED }]", "[{ event: EVENT_APPOINTMENT_SCHEDULED, if: CONFIRMATION_TRIGGER_FILTER }]"],
    "the functions that trigger on appointment/scheduled are no longer the fan-out and the filtered confirmation",
  );
  // Every use of the name is accounted for: the import, the reminder's cancelOn, and those two triggers.
  assert.equal((FUNCTIONS.match(/\bEVENT_APPOINTMENT_SCHEDULED\b/g) ?? []).length, 4, "appointment/scheduled is used somewhere new in functions.ts");
  // And the 8 is without retries, which the script says where it defines the number.
  assert.match(SRC, /"At most 8" is WITHOUT RETRIES/);
});

test("the real destination is Inngest's event API, pinned as text and never called from here", () => {
  assert.equal(INNGEST_ORIGIN, "https://inn.gs");
  assert.match(CODE, /export const INNGEST_ORIGIN = "https:\/\/inn\.gs";/);
  assert.match(CODE, /sendToInngest\(event, \{ key, origin = INNGEST_ORIGIN, fetchImpl = fetch \}\)/);
  assert.match(CODE, /return \(event\) => sendToInngest\(event, \{ key: env\.INNGEST_EVENT_KEY \}\);/, "the real sender overrides the origin");
  assert.equal((CODE.match(/https?:\/\//g) ?? []).length, 1, "a second address appears in the script");
});

test("the request posts the event with no id, returns the id Inngest gave it, and never returns the key", async () => {
  const calls = [];
  const event = buildEvent(row());
  const ok = await sendToInngest(event, {
    key: "fixture key/1",
    origin: "http://sink.invalid",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ ids: ["01M4BZRX46MTTA6VMQQYT89AS1"], status: 200 }) };
    },
  });
  assert.deepEqual(ok, { ok: true, why: null, eventId: "01M4BZRX46MTTA6VMQQYT89AS1" });
  assert.equal(calls.length, 1, "one request per event, never a retry");
  assert.equal(calls[0].url, "http://sink.invalid/e/fixture%20key%2F1");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), event);
  assert.equal("id" in JSON.parse(calls[0].init.body), false);
  assert.ok(calls[0].init.signal instanceof AbortSignal, "the request has no time bound");
  // A 2xx is the receipt even when the body says nothing useful.
  for (const json of [async () => ({}), async () => ({ ids: "x" }), async () => ({ ids: [42] }), async () => ({ ids: ["a b"] }), async () => { throw new SyntaxError("x"); }]) {
    const r = await sendToInngest(event, { key: "fixture-key", origin: "http://sink.invalid", fetchImpl: async () => ({ ok: true, status: 200, json }) });
    assert.deepEqual(r, { ok: true, why: null, eventId: null });
  }
  const refused = await sendToInngest(event, { key: "fixture-key", origin: "http://sink.invalid", fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual(refused, { ok: false, why: "HTTP 500", eventId: null });
  const dropped = await sendToInngest(event, {
    key: "fixture-key",
    origin: "http://sink.invalid",
    fetchImpl: async () => {
      throw new TypeError("fetch failed for fixture-key");
    },
  });
  assert.deepEqual(dropped, { ok: false, why: "network error (TypeError)", eventId: null });
});

/* ---- an outside error is printed as a name and a code, never as its message - */

/** What a driver's or a network library's message can carry. None of it may be printed. */
const LEAK = { host: "db.leaky.invalid", port: "6543", user: "postgres.leakyuser", pw: "fixture-not-a-secret-pw" };
const leaky = (name, code, extra = {}) => {
  const e = new Error(`connect ${code} ${LEAK.host}:${LEAK.port}; password authentication failed for user "${LEAK.user}" (${LEAK.pw})`);
  e.name = name;
  if (code !== undefined) e.code = code;
  return Object.assign(e, extra);
};
const assertNoLeak = (text) => {
  for (const piece of Object.values(LEAK)) assert.ok(!text.includes(piece), `${piece} was printed`);
  assert.doesNotMatch(text, /password authentication|connect E/);
};

test("describeError gives the name and the code, and nothing else", () => {
  assert.equal(describeError(leaky("Error", "ECONNREFUSED")), "Error ECONNREFUSED");
  assert.equal(describeError(leaky("PostgresError", "28P01")), "PostgresError 28P01");
  assert.equal(describeError(leaky("Error", undefined)), "Error");
  // fetch reports its reason on `cause`.
  assert.equal(describeError(leaky("TypeError", undefined, { cause: leaky("Error", "UND_ERR_CONNECT_TIMEOUT") })), "TypeError UND_ERR_CONNECT_TIMEOUT");
  // A code or a name that is not from a fixed vocabulary is left out, not printed.
  assert.equal(describeError(leaky("Error", `${LEAK.host}:${LEAK.port}`)), "Error");
  assert.equal(describeError(leaky("Error", "econnrefused 127.0.0.1")), "Error");
  assert.equal(describeError(leaky("Error", 23)), "Error");
  assert.equal(describeError(leaky(`Error for ${LEAK.user}`, "ECONNRESET")), "Error ECONNRESET");
  assert.equal(describeError(leaky("Error", undefined, { cause: { code: LEAK.pw } })), "Error");
  assert.equal(describeError(`${LEAK.user}:${LEAK.pw}`), "Error");
  assert.equal(describeError({ name: LEAK.user, code: LEAK.pw, message: LEAK.host }), "Error");
  assert.equal(describeError(null), "Error");
  // Only a real Error is believed about its name and its code, and only a real Error as its cause.
  assert.equal(describeError({ name: "TypeError", code: "ECONNRESET" }), "Error");
  assert.equal(describeError(leaky("TypeError", undefined, { cause: { code: "ECONNRESET" } })), "TypeError");
  // The script's own sentence about a tenant slug is a refusal, printed whole; it is not a driver's error.
  assert.match(CODE, /if \(t\.length !== 1\) throw new Halt\(1, `the read failed: tenant slug "\$\{tenantSlug\}" matched \$\{t\.length\} tenants, not 1`\);/);
  for (const e of [leaky("Error", "ECONNREFUSED"), leaky("PostgresError", "28P01"), leaky(LEAK.user, LEAK.pw), LEAK.pw]) assertNoLeak(describeError(e));
  // No message of an outside error is printed anywhere in the script.
  assert.doesNotMatch(CODE, /\be\.message\b[^;]*\)`\)|describeError\(e\)\.message/);
  assert.equal((CODE.match(/\be\.message\b/g) ?? []).length, 1, "an error message is printed somewhere new");
  assert.match(CODE, /console\.error\(`\$\{e\.code === 2 \? "BAD INVOCATION" : "FAILED"\}: \$\{e\.message\}`\);/, "the one message printed is a Halt's own");
});

test("a read that fails prints the error's name and code, and no host, user name or password from its message", async () => {
  const rows = [dbRow(1), dbRow(2)];
  for (const [opts, expected] of [
    [{ selectionFails: leaky("Error", "ECONNREFUSED") }, "the read failed: Error ECONNREFUSED"],
    [{ selectionFails: leaky("PostgresError", "28P01") }, "the read failed: PostgresError 28P01"],
    [{ openFails: leaky("TypeError", undefined) }, "the read failed: TypeError"],
  ]) {
    for (const argv of [[], SINK_CONFIRM(2)]) {
      const r = await runWith(rows, argv, opts);
      assert.equal(r.halt?.code, 1);
      assert.equal(r.halt.message, expected);
      assertNoLeak([r.halt.message, ...r.lines].join("\n"));
      assert.equal(r.events.length, 0);
      assert.equal(existsSync(r.lockPath), false, "a failed read left the lock behind");
    }
  }
});

test("a re-read that fails prints the error's name and code, and nothing from its message", async () => {
  const r = await runWith([dbRow(1), dbRow(2)], SINK_CONFIRM(2), {
    fresh: (id, x) => {
      if (id === apptId(2)) throw leaky("PostgresError", "57014");
      return unchanged(x);
    },
  });
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, /bbbbbbbb0002: could not be read again \(PostgresError 57014\); nothing was sent for it/);
  assertNoLeak([r.halt.message, ...r.lines, readFileSync(r.markerPath, "utf8")].join("\n"));
  assert.deepEqual(r.events.map((e) => e.data.appointmentId), [apptId(1)]);
});

test("a request that fails records the error's name and code, and nothing from its message", async () => {
  const event = buildEvent(row());
  const send = (thrown) =>
    sendToInngest(event, {
      key: "fixture-key",
      origin: "http://sink.invalid",
      fetchImpl: async () => {
        throw thrown;
      },
    });
  assert.deepEqual(await send(leaky("TypeError", undefined, { cause: leaky("Error", "ECONNRESET") })), { ok: false, why: "network error (TypeError ECONNRESET)", eventId: null });
  assert.deepEqual(await send(leaky("TimeoutError", 23)), { ok: false, why: "network error (TimeoutError)", eventId: null });
  assert.deepEqual(await send(`${LEAK.host} ${LEAK.pw}`), { ok: false, why: "network error (Error)", eventId: null });
  for (const thrown of [leaky("TypeError", undefined, { cause: leaky("Error", "ECONNRESET") }), leaky(LEAK.user, LEAK.pw), LEAK.host]) {
    assertNoLeak(JSON.stringify(await send(thrown)));
  }
});

/* ---- the lock --------------------------------------------------------------- */

test("the lock is exclusive: a second taker is refused until the first lets go", () => {
  const lock = join(mkdtempSync(join(tmpdir(), "inc1007-lock-")), "m.json.lock");
  const release = takeLock(lock);
  assert.equal(JSON.parse(readFileSync(lock, "utf8")).pid, process.pid);
  assert.throws(() => takeLock(lock), (e) => e instanceof Halt && e.code === 1 && /another run holds the lock/.test(e.message) && e.message.includes(`pid ${process.pid}`));
  assert.equal(existsSync(lock), true, "the refused taker removed the lock");
  release();
  assert.equal(existsSync(lock), false);
  takeLock(lock)();
  // A lock that cannot be created at all is a refusal too, with its own sentence.
  assert.throws(() => takeLock(join(tmpdir(), "inc1007-no-such-dir", "x.lock")), /cannot take the lock/);
  // The lock is taken with the exclusive flag, which is what makes "exactly one" true.
  assert.match(CODE, /openSync\(lock, "wx"\)/);
});

/* ---- the whole run, on fixture rows and a sink file ------------------------ */

/** 32 eligible rows and one or more of every kind that must NOT be sent. */
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
  rows.push(dbRow(48, { starts_at: new Date(T0 + 24 * HOUR + 120_000) })); // its 24 hour mark is 2 minutes away
  rows.push(dbRow(49, { starts_at: new Date(T0 + 48 * HOUR + 60_000) })); // its 48 hour mark is 1 minute away
  rows.push(dbRow(50, { starts_at: new Date(T0 + 48 * HOUR - 30_000) })); // its 48 hour mark passed 30 s ago
  rows.sort((a, b) => a.starts_at - b.starts_at || (a.id < b.id ? -1 : 1));
  return rows;
}
const NOT_ELIGIBLE = [40, 41, 42, 43, 44, 47, 48, 49, 50].map(apptId);

test("the dry run prints the counts, the skips and hold-backs by reason and the first 20 ids, and sends nothing", async () => {
  const r = await runWith(fixture(), []);
  assert.equal(r.halt, null);
  assert.deepEqual(r.result, { sent: 0, eligible: 32, changed: 0, attempted: 0, notReached: 0 });
  const text = r.lines.join("\n");
  assert.match(text, /^target {3}NOT production \(a strict local database\)$/m);
  assert.match(text, /^mode {5}DRY RUN - nothing is sent$/m);
  assert.match(text, /^margin {3}465 s around a reminder mark = 30 s for the read \+ 375 s for the sends \(min of --max 25 x 15 s and 600 s\) \+ 60 s$/m);
  assert.match(text, /^FUTURE REMINDABLE: 41 /m);
  assert.match(text, /^skipped: unaccepted online request: 1$/m);
  assert.match(text, /^skipped: starts within 24 hours: 2$/m);
  assert.match(text, /^skipped: touched in the last 25 hours: 3$/m);
  assert.match(text, /^ {2}of those, too near their start by the time the 25 hours are up \(no later run can reach them\): 1$/m);
  assert.match(text, /^skipped: already sent by an earlier run \(marker\): 0$/m);
  assert.match(text, /^skipped: attempted by an earlier run, outcome unknown \(marker\): 0$/m);
  assert.doesNotMatch(text, /--resend-attempted to include them/, "the advice about attempted rows is printed with none on record");
  assert.match(text, /^held back: a reminder mark is inside the margin: 3$/m);
  assert.match(text, /^ {2}of those, the 24 hour mark \(this script will never send for them\): 1$/m);
  assert.match(text, /^ {2}of those, the 48 hour mark \(only a run from 1 minute after the mark, and within 23 hours of this read, can send them\): 2$/m);
  assert.match(text, /^held back: nearer than --min-days-ahead 1: 0$/m);
  assert.match(text, /^ELIGIBLE: 32$/m);
  assert.match(text, /^ {2}by status: scheduled=22 confirmed=10$/m);
  assert.match(text, /^ {2}by days until start: 1 to 2=1 {2}2 to 7=30 {2}7 to 30=0 {2}over 30=1$/m);
  assert.match(text, /^ {2}with two or more emitting audit events \(saved again at least once\): 10$/m);
  assert.match(text, /^ {2}attempted before and sent again now \(--resend-attempted\): 0$/m);
  assert.match(text, /^THIS RUN: 25 of 32 {2}\(--max 25; left for a later run: 7\)$/m);
  assert.match(text, /the same command plus --confirm --expect 32 /);
  // The upper bound, directly after the 24 hour line. Not given here, so nothing is beyond it.
  assert.equal(
    r.lines[r.lines.indexOf("skipped: starts within 24 hours: 2") + 1],
    "held back: starts more than --max-days-ahead days after the read: 0  (not given: no upper bound)",
  );
  // The gate lines, character for character and in this order, between the ELIGIBLE block and THIS RUN.
  // In scope: 41 less 1 unaccepted request and 2 inside 24 hours. Next 48 hours: those 2, plus the
  // touched row at 30 hours and the two rows held back for a mark (24 h + 2 min, 48 h - 30 s).
  const gates = r.lines.indexOf("  attempted before and sent again now (--resend-attempted): 0");
  assert.deepEqual(r.lines.slice(gates + 1, gates + 8), [
    "G1 PROJECTED SCHEDULER EXECUTIONS: 304 at most  (38 appointments in scope x 8: 3 runs and 5 steps each)",
    "G1 UNDER THE LIMIT OF 20000: yes",
    "G4 NEXT 48 HOURS, NOT RE-ARMED: 5  (starting within 24 hours: 2; 24 to 48 hours ahead: 3)",
    "  reception sees these appointments in Agenda, and which of them got an SMS in Comunicações, Lembretes SMS",
    "  not counted: 0 starting within 24 hours that an earlier run of this operation sent",
    "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 0; handed to a provider: 0; not checkable: 0; expected 0)",
    "THIS RUN: 25 of 32  (--max 25; left for a later run: 7)",
  ]);
  assert.match(text, /^inngest {2}dashboard check not stated {2}\(recorded only: this script cannot see the hosted scheduler\)$/m);
  // The ledger was asked once, about nothing (no run has sent anything yet), and a dry run never waits.
  assert.deepEqual(r.reader.ledgers, [[]]);
  assert.deepEqual(r.reader.slept, []);
  assert.doesNotMatch(text, /G4 ATTEMPTED EQUALS SENT|G3 AFTER THIS RUN|^settle/m, "a dry run printed a line that belongs after the sends");
  const idLines = r.lines.filter((l) => /^ {2}[0-9a-f]{8}-/.test(l));
  assert.equal(idLines.length, 20, "the dry run lists the first 20 and no more");
  for (const l of idLines) assert.match(l, /^ {2}[0-9a-f-]{36} {2}starts \d{4}-\d\d-\d\dT[\d:.]+Z {2}(scheduled|confirmed) +would schedule: /);
  assert.equal(idLines[0].includes(apptId(45)), true, "the nearest eligible row is first");
  assert.equal(existsSync(r.sink), false, "a dry run wrote the sink");
  assert.equal(existsSync(r.markerPath), false, "a dry run wrote the marker");
  assert.equal(existsSync(r.lockPath), false, "a dry run took the lock");
  assert.deepEqual(r.reader.rechecked, [], "a dry run re-read rows");
  assert.deepEqual([r.reader.opened, r.reader.closed], [1, 1], "the connection was not closed");
});

test("a larger --max has a larger margin, and the dry run says so", async () => {
  // 24 hours + 500 s: clear of the margin of --max 25 (465 s), inside the margin of --max 40 (690 s).
  const rows = [dbRow(1, { starts_at: new Date(T0 + 24 * HOUR + 500_000) })];
  assert.equal((await runWith(rows, [])).result.eligible, 1);
  const big = await runWith(rows, ["--max", "40"]);
  assert.equal(big.result.eligible, 0);
  assert.match(big.lines.join("\n"), /^margin {3}690 s around a reminder mark = 30 s for the read \+ 600 s for the sends \(min of --max 40 x 15 s and 600 s\) \+ 60 s$/m);
  assert.match(big.lines.join("\n"), /^ {2}of those, the 24 hour mark \(this script will never send for them\): 1$/m);
});

test("--expect that does not match the eligible count is refused, nothing is sent or recorded, and the lock is given back", async () => {
  const r = await runWith(fixture(), SINK_CONFIRM(31));
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, /expected 31 eligible rows and found 32/);
  assert.equal(r.events.length, 0);
  assert.equal(r.marker, null);
  assert.equal(existsSync(r.lockPath), false);
  assert.deepEqual([r.reader.opened, r.reader.closed], [1, 1]);
});

test("the first run is a canary of --max, and a second run continues with the rest: the marker skips what was sent", async () => {
  const rows = fixture();
  const first = await runWith(rows, SINK_CONFIRM(32));
  assert.equal(first.halt, null);
  assert.deepEqual(first.result, { sent: 25, eligible: 32, changed: 0, attempted: 0, notReached: 0 });
  assert.equal(first.events.length, 25);
  assert.equal(first.marker.history.length, 1);
  const entry = first.marker.history[0];
  assert.equal(entry.state, "done");
  assert.equal(entry.rows.length, 25);
  assert.ok(entry.rows.every((x) => x.state === "sent" && x.eventId === null && typeof x.at === "string"));
  assert.equal(entry.fixDeployedSha, SHA_OK);
  assert.equal(entry.sink, true);
  assert.equal(entry.checkedInngestSettings, false);
  assert.equal(entry.resendAttempted, false);
  assert.equal(entry.tenantId, TENANT);
  assert.equal(entry.marginMs, 465_000);
  assert.equal(entry.maxDaysAhead, null, "no --max-days-ahead was given, and the marker says so");
  assert.equal(entry.readAt, at(T0));
  assert.equal(first.reader.rechecked.length, 25, "every row is read again before its send");
  assert.match(first.lines.join("\n"), /^SENT: 25 of 25 /m);
  assert.match(first.lines.join("\n"), /^changed since the read, not sent: 0\nattempted, outcome unknown: 0\nnot reached: 0$/m);
  assert.equal(existsSync(first.lockPath), false, "the run left its lock behind");
  // THE ENDING: the four closing lines, G4, the settle, G3. Nothing after them on a clean run.
  assert.deepEqual(first.lines.slice(first.lines.indexOf("not reached: 0")), [
    "not reached: 0",
    "G4 ATTEMPTED EQUALS SENT: yes (25 requests started, 25 sent)",
    "settle   waited 20 s for the scheduler before the second ledger read",
    "G3 AFTER THIS RUN: 0  (appointments checked: 25; handed to a provider: 0; expected 0)",
  ]);
  // One wait of 20 s, after the last send and before the second ledger read.
  assert.deepEqual(first.reader.slept, [20_000]);
  assert.deepEqual(first.reader.log, ["ledger", ...Array(25).fill("recheck"), "sleep", "ledger"]);
  // The first read asked about nothing. The second asked about the 25 rows of THIS run, each from
  // the read instant to the end of this run's margin.
  assert.deepEqual(first.reader.ledgers[0], []);
  assert.deepEqual(
    first.reader.ledgers[1],
    entry.rows.map((x) => ({ appointment_id: x.id, from_at: at(T0), to_at: at(T0 + 465_000) })),
  );

  const dry = await runWith(rows, [], { dir: first.dir });
  assert.match(dry.lines.join("\n"), /^skipped: already sent by an earlier run \(marker\): 25$/m);
  assert.equal(dry.result.eligible, 7);
  // G1 is the bound for everything in scope at THIS read, sent already or not: the 25 rows already sent still count.
  assert.ok(dry.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 304 at most  (38 appointments in scope x 8: 3 runs and 5 steps each)"));
  // And the next run's first ledger read asks about every row the marker holds.
  assert.deepEqual(dry.reader.ledgers, [first.reader.ledgers[1]]);
  assert.ok(
    dry.lines.includes(
      "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 25; handed to a provider: 0; not checkable: 0; expected 0)",
    ),
  );

  const stale = await runWith(rows, SINK_CONFIRM(32), { dir: first.dir });
  assert.equal(stale.halt?.code, 1, "the first run's count must not send the second run");
  assert.equal(stale.events.length, 25);

  const second = await runWith(rows, SINK_CONFIRM(7), { dir: first.dir });
  assert.equal(second.result.sent, 7);
  assert.equal(second.events.length, 32);
  assert.equal(new Set(second.events.map((e) => e.data.appointmentId)).size, 32, "one row was sent twice");
  assert.equal(second.marker.history.length, 2);
  // Before its sends the second run asked the ledger about the first run's 25 rows; after them, about its OWN 7 only.
  assert.deepEqual(second.reader.ledgers.map((w) => w.length), [25, 7]);
  assert.equal(second.lines.at(-1), "G3 AFTER THIS RUN: 0  (appointments checked: 7; handed to a provider: 0; expected 0)");

  const third = await runWith(rows, SINK_CONFIRM(0), { dir: first.dir });
  assert.deepEqual(third.result, { sent: 0, eligible: 0, changed: 0, attempted: 0, notReached: 0 });
  assert.equal(third.events.length, 32);
  assert.equal(third.marker.history.length, 2, "a run that sent nothing must not touch the marker");
  // It started no request, so it waits for nothing and asks the ledger only the once: about all 32 rows.
  assert.deepEqual(third.reader.slept, []);
  assert.equal(third.reader.ledgers.length, 1);
  assert.equal(third.reader.ledgers[0].length, 32);

  // Exactly the eligible rows, each with the exact event and no id.
  const eligibleIds = rows.filter((r) => !NOT_ELIGIBLE.includes(r.id)).map((r) => r.id).sort();
  assert.deepEqual(second.events.map((e) => e.data.appointmentId).sort(), eligibleIds);
  for (const e of second.events) {
    assert.deepEqual(Object.keys(e).sort(), ["data", "name"]);
    assert.deepEqual(Object.keys(e.data).sort(), ["appointmentId", "confirmationEligible", "startsAt", "tenantId"]);
    assert.equal(e.name, EVENT_NAME);
    assert.equal(e.data.confirmationEligible, false);
    assert.equal(e.data.tenantId, TENANT);
  }
  // A sink run keeps its marker and its lock beside the sink and never touches the home directory.
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

test("while a run is sending it holds the lock, and each row is on disk as sent before the line that reports it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  const markerPath = join(dir, "sink.jsonl.marker.json");
  const seen = [];
  const r = await runWith([dbRow(1), dbRow(2), dbRow(3)], SINK_CONFIRM(3), {
    dir,
    out: (line) => {
      const m = /^ {2}sent ([0-9a-f-]{36}) /.exec(line);
      if (!m) return;
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      seen.push({ id: m[1], state: marker.history[0].state, rows: marker.history[0].rows, locked: existsSync(`${markerPath}.lock`) });
    },
  });
  assert.equal(r.result.sent, 3);
  assert.equal(seen.length, 3);
  seen.forEach((s, i) => {
    assert.equal(s.state, "sending");
    assert.equal(s.locked, true, "the lock was not held during the sends");
    assert.equal(s.rows.length, i + 1);
    assert.deepEqual(s.rows.map((x) => x.state), Array(i + 1).fill("sent"));
    assert.equal(s.rows[i].id, s.id);
  });
  assert.equal(existsSync(r.lockPath), false);
});

test("a row is written to the marker as ATTEMPTED before its request leaves", () => {
  // Order in the code: the claim, then per row the re-read, the attempted record on disk, the request.
  const claim = CODE.indexOf('state: "sending"');
  const claimWrite = CODE.indexOf("write(marker, entries)", claim);
  const recheck = CODE.indexOf("reader.recheck(tenantId, row.id)", claimWrite);
  const attempted = CODE.indexOf('state: "attempted", at:', recheck);
  const attemptedWrite = CODE.indexOf("write(marker, entries)", attempted);
  const request = CODE.indexOf("await send(buildEvent(row))");
  const sentState = CODE.indexOf('record.state = "sent"');
  assert.ok(claim > 0 && claimWrite > claim && recheck > claimWrite, "the marker claim no longer precedes the first row");
  assert.ok(attempted > recheck && attemptedWrite > attempted && request > attemptedWrite, "the attempted record is no longer on disk before the request");
  assert.ok(sentState > request, "a row is marked sent before its request");
  assert.equal((CODE.match(/await send\(/g) ?? []).length, 1, "a second send, or a retry, appears in the loop");
});

test("a marker write that fails stops the run: before the first row, before a request, and after a 2xx", async () => {
  const rows = [dbRow(1), dbRow(2), dbRow(3)];
  /** The real writer, except that call number `n` fails. Calls: 1 the claim, then per row the attempted record and the sent record. */
  const failingAt = (n) => {
    let calls = 0;
    return (marker, entries) => {
      calls += 1;
      if (calls === n) throw Object.assign(new Error("fixture: the disk is full"), { code: "ENOSPC" });
      writeMarker(marker, entries);
    };
  };
  // The claim: nothing is sent, nothing is re-read.
  const claim = await runWith(rows, SINK_CONFIRM(3), { writeMarker: failingAt(1) });
  assert.equal(claim.halt?.code, 1);
  assert.match(claim.halt.message, /could not write the marker .*; nothing was sent\./);
  assert.equal(claim.events.length, 0);
  assert.deepEqual(claim.reader.rechecked, []);
  assert.equal(claim.marker, null);
  assert.equal(existsSync(claim.lockPath), false);

  // The attempted record of the SECOND row: its request never leaves, and it is not recorded.
  const before = await runWith(rows, SINK_CONFIRM(3), { writeMarker: failingAt(4) });
  assert.equal(before.halt?.code, 1);
  assert.match(before.halt.message, /stopped at bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002: the marker .* could not be updated; nothing was sent for it\./);
  assert.deepEqual(before.events.map((e) => e.data.appointmentId), [apptId(1)]);
  assert.deepEqual(before.marker.history[0].rows.map((x) => [x.id, x.state]), [[apptId(1), "sent"]]);
  assert.equal(before.marker.history[0].state, "stopped");
  assert.match(before.lines.join("\n"), /^SENT: 1 of 3 .*\nchanged since the read, not sent: 0\nattempted, outcome unknown: 0\nnot reached: 2$/m);
  assert.deepEqual(before.reader.rechecked, [apptId(1), apptId(2)]);

  // The sent record of the FIRST row, after its 2xx: the run stops there. It does not go on to the next row.
  const seen = [];
  const after = await runWith(rows, SINK_CONFIRM(3), { writeMarker: failingAt(3), out: (l) => seen.push(l) });
  assert.equal(after.halt?.code, 1);
  assert.match(after.halt.message, /stopped at bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001: SENT, but the marker .* could not be updated and still says attempted\./);
  assert.deepEqual(after.events.map((e) => e.data.appointmentId), [apptId(1)], "the run went on after it could not record a sent row");
  assert.deepEqual(after.reader.rechecked, [apptId(1)]);
  assert.equal(seen.some((l) => /^ {2}sent /.test(l)), false, "a row is reported sent although its record could not be kept");
  assert.match(seen.join("\n"), /^SENT: 1 of 3 .*\nchanged since the read, not sent: 0\nattempted, outcome unknown: 0\nnot reached: 2$/m);
  // The closing write went through, so the marker ends up telling the truth, and the row is never sent twice.
  assert.equal(after.marker.history[0].state, "stopped");
  assert.deepEqual(after.marker.history[0].rows.map((x) => [x.id, x.state]), [[apptId(1), "sent"]]);
  assert.equal(existsSync(after.lockPath), false);
  assert.equal((await runWith(rows, [], { dir: after.dir })).result.eligible, 2);
});

test("a send that fails stops the run at once and leaves the row ATTEMPTED, which later runs skip and count", async () => {
  // The sink path is a FOLDER, so the first append fails after the attempt was recorded.
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  mkdirSync(join(dir, "sink.jsonl"));
  const rows = [dbRow(1), dbRow(2)];
  const r = await runWith(rows, SINK_CONFIRM(2), { dir });
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, /stopped at bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001: could not write the sink file \(Error EISDIR\)\. The row stays ATTEMPTED/);
  assert.equal(r.marker.history[0].state, "stopped");
  assert.equal(r.marker.history[0].rows.length, 1);
  assert.equal(r.marker.history[0].rows[0].state, "attempted");
  assert.equal(r.marker.history[0].rows[0].why, "could not write the sink file (Error EISDIR)");
  assert.match(r.lines.join("\n"), /^SENT: 0 of 2 .*\nchanged since the read, not sent: 0\nattempted, outcome unknown: 1\nnot reached: 1$/m);
  // G4 says NO, and the row whose request may have left is still asked about in the ledger.
  assert.deepEqual(r.lines.slice(r.lines.indexOf("not reached: 1")), [
    "not reached: 1",
    "G4 ATTEMPTED EQUALS SENT: NO (1 requests started, 0 sent)",
    "settle   waited 20 s for the scheduler before the second ledger read",
    "G3 AFTER THIS RUN: 0  (appointments checked: 1; handed to a provider: 0; expected 0)",
  ]);
  assert.deepEqual(r.reader.slept, [20_000]);
  assert.deepEqual(r.reader.ledgers[1].map((w) => w.appointment_id), [apptId(1)]);
  assert.deepEqual(r.reader.rechecked, [apptId(1)], "the run went on after a failed send");
  assert.equal(existsSync(r.lockPath), false, "a stopped run left its lock behind");

  const dry = await runWith(rows, [], { dir });
  assert.match(dry.lines.join("\n"), /^skipped: attempted by an earlier run, outcome unknown \(marker\): 1$/m);
  // The advice says when sending again is safe, and what the only guard for that is.
  assert.match(
    dry.lines.join("\n"),
    /^ {2}Inngest may or may not have taken those events\. Each send has its own id, so sending them again is safe\n {2}ONLY IF the scheduler runs the new settings\. The dashboard check is the only guard for that: the canary\n {2}cannot tell old settings from new\. If that check passed: add --resend-attempted to include them\.$/m,
  );
  assert.doesNotMatch(dry.lines.join("\n"), /^resend {3}/m, "the flag's warning is printed without the flag");
  assert.equal(dry.result.eligible, 1);
});

test("an attempted row is sent again only with --resend-attempted, and then it is sent for good", async () => {
  // What a run that was killed inside a request leaves behind.
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  const rows = [dbRow(1), dbRow(2), dbRow(3)];
  const iso = (n) => rows[n - 1].starts_at.toISOString();
  writeFileSync(
    join(dir, "sink.jsonl.marker.json"),
    JSON.stringify({
      history: [
        {
          at: "2026-10-07T10:00:00.000Z",
          // A run writes both before its first request, so a killed run's entry carries them.
          readAt: "2026-10-07T10:00:00.000Z",
          marginMs: MARGIN,
          state: "sending",
          rows: [
            { id: apptId(1), startsAt: iso(1), state: "sent", at: "x", eventId: null },
            { id: apptId(2), startsAt: iso(2), state: "attempted", at: "x" },
          ],
        },
      ],
    }),
  );
  assert.deepEqual([readHistory(join(dir, "sink.jsonl.marker.json")).sent.size, readHistory(join(dir, "sink.jsonl.marker.json")).attempted.size], [1, 1]);
  const dry = await runWith(rows, [], { dir });
  assert.match(dry.lines.join("\n"), /^NOTE {5}1 earlier run\(s\) did not finish\. A row such a run was sending is recorded as attempted\.$/m);
  assert.match(dry.lines.join("\n"), /^skipped: already sent by an earlier run \(marker\): 1$/m);
  assert.match(dry.lines.join("\n"), /^skipped: attempted by an earlier run, outcome unknown \(marker\): 1$/m);
  assert.equal(dry.result.eligible, 1);

  const without = await runWith(rows, SINK_CONFIRM(1), { dir });
  assert.equal(without.result.sent, 1);
  assert.deepEqual(without.events.map((e) => e.data.appointmentId), [apptId(3)], "an attempted row was sent without the flag");

  const dryFlag = await runWith(rows, ["--resend-attempted"], { dir });
  assert.equal(dryFlag.result.eligible, 1);
  assert.match(
    dryFlag.lines.join("\n"),
    /^resend {3}--resend-attempted is given\. Sending a row a second time is safe ONLY with the new scheduler settings live\. The dashboard check is the only guard for that; the canary cannot tell old settings from new\.$/m,
  );
  assert.match(dryFlag.lines.join("\n"), /^skipped: attempted by an earlier run, outcome unknown \(marker\): 0$/m);
  assert.match(dryFlag.lines.join("\n"), /^ {2}attempted before and sent again now \(--resend-attempted\): 1$/m);

  const withFlag = await runWith(rows, SINK_CONFIRM(1, ["--resend-attempted"]), { dir });
  assert.equal(withFlag.result.sent, 1);
  assert.deepEqual(withFlag.events.map((e) => e.data.appointmentId), [apptId(3), apptId(2)]);
  assert.equal(withFlag.marker.history.at(-1).resendAttempted, true);

  const after = readHistory(join(dir, "sink.jsonl.marker.json"));
  assert.deepEqual([after.sent.size, after.attempted.size], [3, 0], "a row sent after an attempt still reads as attempted");
  const last = await runWith(rows, ["--resend-attempted"], { dir });
  assert.equal(last.result.eligible, 0, "a sent row came back with the flag");
  // Sent is final in the marker's own reading too, whichever record comes later.
  const both = join(mkdtempSync(join(tmpdir(), "inc1007-order-")), "m.json");
  const rec = (state) => ({ id: apptId(1), startsAt: iso(1), state, at: "x" });
  writeFileSync(both, JSON.stringify({ history: [{ at: "a", rows: [rec("sent")] }, { at: "b", rows: [rec("attempted")] }] }));
  assert.deepEqual([readHistory(both).sent.size, readHistory(both).attempted.size], [1, 0]);
  writeFileSync(both, JSON.stringify({ history: [{ at: "a", rows: [rec("attempted")] }, { at: "b", rows: [rec("sent")] }] }));
  assert.deepEqual([readHistory(both).sent.size, readHistory(both).attempted.size], [1, 0]);
});

test("each row is read again just before its send, and a row that changed is skipped and counted, not sent", async () => {
  const rows = [1, 2, 3, 4, 5, 6].map((n) => dbRow(n));
  const fresh = (id, r) => {
    const base = unchanged(r);
    if (id === apptId(2)) return { ...base, starts_at: new Date(T0 + 9 * DAY) };
    if (id === apptId(3)) return { ...base, status: "cancelled" };
    if (id === apptId(4)) return { ...base, last_emit_at: new Date(T0 + 1000) };
    if (id === apptId(5)) return null;
    return base;
  };
  const r = await runWith(rows, SINK_CONFIRM(6), { fresh });
  assert.equal(r.halt, null);
  assert.deepEqual(r.result, { sent: 2, eligible: 6, changed: 4, attempted: 0, notReached: 0 });
  assert.deepEqual(r.events.map((e) => e.data.appointmentId), [apptId(1), apptId(6)]);
  assert.deepEqual(r.marker.history[0].rows.map((x) => [x.id, x.state]), [[apptId(1), "sent"], [apptId(6), "sent"]], "a skipped row was recorded as attempted");
  assert.equal(r.marker.history[0].state, "done");
  const text = r.lines.join("\n");
  for (const [n, reason] of [[2, "moved"], [3, "status"], [4, "saved_again"], [5, "gone"]]) {
    assert.match(text, new RegExp(`^  skip ${apptId(n)}  starts \\S+  changed since the read \\(${reason}\\)$`, "m"));
  }
  assert.match(text, /^SENT: 2 of 6 .*\nchanged since the read, not sent: 4\nattempted, outcome unknown: 0\nnot reached: 0$/m);
  // A skipped row started no request: G4 counts the two that did, and G3 asks about those two only.
  assert.match(text, /^G4 ATTEMPTED EQUALS SENT: yes \(2 requests started, 2 sent\)$/m);
  assert.deepEqual(r.reader.ledgers[1].map((w) => w.appointment_id), [apptId(1), apptId(6)]);
  assert.deepEqual(r.reader.rechecked, rows.map((x) => x.id), "the re-read is per row, in order, each before its send");
  // A skipped row is not in the marker, so a later run decides about it afresh.
  const later = await runWith(rows, [], { dir: r.dir });
  assert.equal(later.result.eligible, 4);
});

test("a re-read that fails, or takes longer than its bound, stops the run with nothing sent for that row", async () => {
  const rows = [dbRow(1), dbRow(2), dbRow(3)];
  const failing = await runWith(rows, SINK_CONFIRM(3), {
    fresh: (id, r) => {
      if (id === apptId(2)) throw new RangeError("fixture");
      return unchanged(r);
    },
  });
  assert.equal(failing.halt?.code, 1);
  assert.match(failing.halt.message, /bbbbbbbb0002: could not be read again \(RangeError\); nothing was sent for it/);
  assert.deepEqual(failing.events.map((e) => e.data.appointmentId), [apptId(1)]);
  assert.deepEqual(failing.marker.history[0].rows.map((x) => x.state), ["sent"]);
  assert.equal(failing.marker.history[0].state, "stopped");
  assert.match(failing.lines.join("\n"), /^attempted, outcome unknown: 0\nnot reached: 2$/m);

  const started = Date.now();
  const slow = await runWith([dbRow(1)], SINK_CONFIRM(1), { fresh: () => new Promise(() => {}) });
  assert.equal(slow.halt?.code, 1);
  assert.match(slow.halt.message, /could not be read again \(Error TIMEOUT\)/);
  assert.equal(slow.events.length, 0);
  assert.deepEqual(slow.marker.history[0].rows, []);
  const took = Date.now() - started;
  assert.ok(took >= RECHECK_BOUND_MS - 100 && took < RECHECK_BOUND_MS + 3000, `the re-read bound is not ${RECHECK_BOUND_MS} ms (took ${took})`);
});

test("the run stops sending when the time for the sends is spent, and that is not a failure", async () => {
  // --max 25: 30 s for the read + 375 s for the sends. A send is started only if it can end inside that.
  const rows = [1, 2, 3, 4, 5].map((n) => dbRow(n));
  const clock = [0, 1_000, 390_000, 390_001, 999_999];
  let calls = 0;
  const r = await runWith(rows, SINK_CONFIRM(5), { now: () => clock[Math.min(calls++, clock.length - 1)] });
  assert.equal(r.halt, null);
  assert.deepEqual(r.result, { sent: 2, eligible: 5, changed: 0, attempted: 0, notReached: 3 });
  assert.equal(calls, 4, "the clock is read once before the read and once before each send");
  assert.deepEqual(r.events.map((e) => e.data.appointmentId), [apptId(1), apptId(2)]);
  assert.equal(r.marker.history[0].state, "out_of_time");
  // OUT OF TIME stays the last line, after G4, the settle and G3.
  assert.match(
    r.lines.join("\n"),
    /^not reached: 3\nG4 ATTEMPTED EQUALS SENT: yes \(2 requests started, 2 sent\)\nsettle {3}waited 20 s for the scheduler before the second ledger read\nG3 AFTER THIS RUN: 0 {2}\(appointments checked: 2; handed to a provider: 0; expected 0\)\nOUT OF TIME: /m,
  );
  assert.ok(r.lines.at(-1).startsWith("OUT OF TIME: "), "OUT OF TIME is no longer the last line");
  assert.equal(existsSync(r.lockPath), false);
  // The rows it did not reach are simply still eligible.
  assert.equal((await runWith(rows, [], { dir: r.dir })).result.eligible, 3);
  // The clock starts BEFORE the read, so a slow read eats the allowance instead of the margin.
  assert.ok(CODE.indexOf("const readStarted = now();") < CODE.indexOf("selection = await reader.selection(args.tenantSlug)"));
  assert.match(CODE, /if \(now\(\) - readStarted \+ PER_SEND_BOUND_MS > READ_BOUND_MS \+ budgetMs\) \{/);
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
    assert.equal(existsSync(r.lockPath), false);
  }
});

test("no name, phone or email reaches any output line, the sink or the marker", async () => {
  const rows = fixture();
  const dry = await runWith(rows, []);
  const sent = await runWith(rows, SINK_CONFIRM(32, ["--max", "500"]));
  assert.equal(sent.result.sent, 32);
  const everything = [...dry.lines, ...sent.lines, readFileSync(sent.sink, "utf8"), readFileSync(sent.markerPath, "utf8")];
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
  // Neither read selects a patient column: the only patient fact either uses is the soft-delete flag.
  for (const sql of [SELECT_ROWS, RECHECK_ROW]) {
    assert.doesNotMatch(sql, /name|phone|email|nif|birth|address|notes/i);
    assert.deepEqual([...new Set([...sql.matchAll(/\bp\.([a-z_]+)/g)].map((m) => m[1]))].sort(), ["deleted_at", "id", "tenant_id"]);
  }
  // The ledger read joins no patient and reads no message: no body, no template, no provider id.
  assert.doesNotMatch(LEDGER_CHECK, /name|phone|email|nif|birth|address|notes|patients|body|template|provider/i);
});

/* ---- the reads, and their contract with the app ---------------------------- */

test("the first read is one tenant, read-only, future rows only, and nothing writes", () => {
  assert.match(SELECT_ROWS, /with k as \(select \$1::uuid as tenant_id, now\(\) as t0\)/);
  assert.match(SELECT_ROWS, /join k on k\.tenant_id = a\.tenant_id/);
  assert.match(SELECT_ROWS, /join patients p on p\.id = a\.patient_id and p\.tenant_id = a\.tenant_id/);
  assert.match(SELECT_ROWS, /where a\.status::text in \('scheduled', 'confirmed'\)\s+and p\.deleted_at is null\s+and a\.starts_at > k\.t0/);
  assert.match(SELECT_ROWS, /order by a\.starts_at, a\.id$/);
  // Every table it reads is bound to the tenant (CLAUDE.md rule 3).
  assert.match(SELECT_ROWS, /where n\.tenant_id = a\.tenant_id/);
  assert.match(SELECT_ROWS, /where l\.tenant_id = a\.tenant_id\s+and l\.entity_type = 'appointment'\s+and l\.entity_id = a\.id/);
  assert.doesNotMatch(CODE, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|drop\s+table|alter\s+table)\b/i);
  // One connection, opened lazily, and every statement inside a READ ONLY transaction.
  assert.equal((CODE.match(/\bpostgres\(raw,/g) ?? []).length, 1);
  assert.equal((CODE.match(/= postgres\(/g) ?? []).length, 1, "a second connection is opened");
  assert.equal((CODE.match(/await import\("postgres"\)/g) ?? []).length, 1);
  assert.doesNotMatch(CODE, /^\s*import\s+postgres\b/m, "a static import would load the driver before the refusals");
  assert.equal((CODE.match(/sql\.begin\(/g) ?? []).length, 3);
  assert.equal((CODE.match(/sql\.begin\("read only", /g) ?? []).length, 3, "a transaction is not read only");
  assert.doesNotMatch(CODE, /\bsql`|sql\.unsafe\(/, "a statement runs outside a read-only transaction");
  // Refusals, then the lock, then the marker, then the database: in that order.
  const refusals = CODE.indexOf("const refusal = preflight(args, target, env)");
  const lock = CODE.indexOf("release = takeLock(`${marker}.lock`)");
  const history = CODE.indexOf("const history = readHistory(marker)");
  const opened = CODE.indexOf("reader = await open(raw)");
  assert.ok(refusals > 0 && lock > refusals && history > lock && opened > history, "refusals, lock, marker, database: in that order");
  // Whatever happens, the connection is closed and the lock is given back.
  assert.match(CODE, /\} finally \{\s+if \(reader\) \{\s+try \{\s+await reader\.close\(\);[\s\S]*?\}\s+release\(\);\s+\}/);
});

test("the re-read asks one row of one tenant, with the very same two tests as the first read", () => {
  assert.match(RECHECK_ROW, /where a\.tenant_id = \$1::uuid\s+and a\.id = \$2::uuid$/);
  assert.match(RECHECK_ROW, /join patients p on p\.id = a\.patient_id and p\.tenant_id = a\.tenant_id/);
  assert.match(RECHECK_ROW, /\(p\.deleted_at is not null\) as patient_deleted/);
  const piece = (sql, from, to) => {
    const a = sql.indexOf(from);
    const b = sql.indexOf(to, a);
    assert.ok(a > 0 && b > a, `${from} not found`);
    return sql.slice(a, b + to.length);
  };
  for (const [from, to] of [["(a.status = 'scheduled'", "as unaccepted_request"], ["cross join lateral (", ") e"]]) {
    assert.equal(piece(RECHECK_ROW, from, to), piece(SELECT_ROWS, from, to), "the re-read no longer asks what the first read asked");
  }
  assert.match(CODE, /tx\.unsafe\(RECHECK_ROW, \[tenantId, id\]\)/);
  assert.match(CODE, /return rows\.length === 1 \? rows\[0\] : null;/);
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

test("the offsets a row is held back for are the app's REMINDER_OFFSETS", () => {
  const offsets = readFileSync(join(ROOT, "apps/web/lib/reminders/offsets.ts"), "utf8");
  for (const [id, mins, ch] of [["48h", "48 \\* 60", "email"], ["24h", "24 \\* 60", "sms"]]) {
    const re = new RegExp(`id: "${id}", minutesBefore: ${mins}, channel: "${ch}"`);
    assert.match(offsets, re, `offsets.ts no longer says ${id}`);
    assert.match(SRC, re, `the script no longer says ${id}`);
  }
  assert.equal(OFFSETS.length, 2);
  assert.equal((offsets.match(/minutesBefore: /g) ?? []).length, 1 + OFFSETS.length, "offsets.ts gained or lost an offset; the margin must cover every mark");
});

/* ---- the upper bound, on the whole run ------------------------------------- */

test("--max-days-ahead on the whole run: the row beyond it is held back and counted, and the marker records the bound", async () => {
  // The fixture's one row 40 days ahead is beyond 28 days: 31 eligible, 37 in scope.
  const r = await runWith(fixture(), ["--max-days-ahead", "28"]);
  assert.equal(r.result.eligible, 31);
  assert.equal(r.lines[r.lines.indexOf("skipped: starts within 24 hours: 2") + 1], "held back: starts more than --max-days-ahead 28 days after the read: 1");
  assert.ok(r.lines.includes("  by days until start: 1 to 2=1  2 to 7=30  7 to 30=0  over 30=0"));
  assert.ok(r.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 296 at most  (37 appointments in scope x 8: 3 runs and 5 steps each)"));
  // Exactly 28 days ahead is in; one millisecond more is out.
  const edge = [dbRow(1, { starts_at: new Date(T0 + 28 * DAY) }), dbRow(2, { starts_at: new Date(T0 + 28 * DAY + 1) })];
  const dry = await runWith(edge, ["--max-days-ahead", "28"]);
  assert.equal(dry.result.eligible, 1);
  assert.ok(dry.lines.includes("held back: starts more than --max-days-ahead 28 days after the read: 1"));
  assert.ok(dry.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 8 at most  (1 appointments in scope x 8: 3 runs and 5 steps each)"));
  const sent = await runWith(edge, SINK_CONFIRM(1, ["--max-days-ahead", "28"]));
  assert.deepEqual(sent.events.map((e) => e.data.appointmentId), [apptId(1)], "a row beyond the bound was sent");
  assert.equal(sent.marker.history[0].maxDaysAhead, 28);
  // Without the flag both are eligible, and the line says there is no bound.
  const open = await runWith(edge, []);
  assert.equal(open.result.eligible, 2);
  assert.ok(open.lines.includes("held back: starts more than --max-days-ahead days after the read: 0  (not given: no upper bound)"));
});

test("the inngest line names the three things the operator vouched for", async () => {
  const r = await runWith([dbRow(1)], ["--i-checked-inngest-settings"]);
  assert.ok(
    r.lines.includes(
      "inngest  the operator says the dashboard shows Debounce on schedule-appointment-reminders, Singleton on send-appointment-reminder " +
        "and the trigger expression event.data.confirmationEligible == true on send-appointment-confirmation  " +
        "(recorded only: this script cannot see the hosted scheduler)",
    ),
  );
  // The header says the same three, and why the third matters.
  for (const word of [
    "Debounce on",
    "schedule-appointment-reminders, Singleton on send-appointment-reminder",
    "`event.data.confirmationEligible == true` on",
    "send-appointment-confirmation",
    "--max-days-ahead <D>",
    "G1 PROJECTED SCHEDULER EXECUTIONS",
    "G4 NEXT 48 HOURS, NOT RE-ARMED",
    "G3 LEDGER ROWS",
  ]) {
    assert.ok(SRC.slice(0, SRC.indexOf("\nimport {")).includes(word), `the header does not carry ${word}`);
  }
});

/* ---- G1: the projected executions ------------------------------------------ */

test("G1: which verdicts are in scope, and the arithmetic of the projection", () => {
  for (const v of ["touched_25h", "already_sent", "attempted", "near_mark", "held_back", "emit"]) assert.equal(inScope(v), true, v);
  for (const v of ["unaccepted_request", "inside_24h", "beyond_max_days"]) assert.equal(inScope(v), false, v);
  assert.equal(projectedExecutions(0), 0);
  assert.equal(projectedExecutions(1), 8);
  assert.equal(projectedExecutions(38), 304);
  assert.equal(projectedExecutions(2499), 19_992);
  assert.equal(projectedExecutions(2500), 20_000);
  // "Under" is strict: the limit itself is NO.
  assert.equal(underExecutionLimit(19_999), true);
  assert.equal(underExecutionLimit(20_000), false);
  assert.equal(underExecutionLimit(20_001), false);
  assert.equal(underExecutionLimit(0), true);
  assert.equal(underExecutionLimit(projectedExecutions(2499)), true);
  assert.equal(underExecutionLimit(projectedExecutions(2500)), false);
});

test("G1: 2499 appointments in scope is yes and a confirm goes on; 2500 is NO, the dry run says so and ends normally, and a confirm is refused with nothing sent", async () => {
  const many = (count) => Array.from({ length: count }, (_, i) => dbRow(i + 1));
  const under = await runWith(many(2499), []);
  assert.equal(under.halt, null);
  assert.ok(under.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 19992 at most  (2499 appointments in scope x 8: 3 runs and 5 steps each)"));
  assert.ok(under.lines.includes("G1 UNDER THE LIMIT OF 20000: yes"));
  const goes = await runWith(many(2499), SINK_CONFIRM(2499, ["--max", "1"]));
  assert.equal(goes.halt, null);
  assert.equal(goes.result.sent, 1);

  const rows = many(2500);
  const dry = await runWith(rows, []);
  assert.equal(dry.halt, null, "a dry run must print NO and end normally");
  assert.deepEqual(dry.result, { sent: 0, eligible: 2500, changed: 0, attempted: 0, notReached: 0 });
  assert.ok(dry.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 20000 at most  (2500 appointments in scope x 8: 3 runs and 5 steps each)"));
  assert.ok(dry.lines.includes("G1 UNDER THE LIMIT OF 20000: NO"));
  assert.ok(dry.lines.some((l) => l.startsWith("THIS RUN: 25 of 2500 ")));

  const refused = await runWith(rows, SINK_CONFIRM(2500, ["--max", "1"]));
  assert.equal(refused.halt?.code, 1);
  assert.equal(
    refused.halt.message,
    "G1: the projected scheduler executions are 20000, which is not under the limit of 20000. Nothing was sent and nothing was recorded. Report every line above.",
  );
  // After the read and after the report lines...
  assert.ok(refused.lines.includes("G1 UNDER THE LIMIT OF 20000: NO"));
  assert.ok(refused.lines.some((l) => l.startsWith("G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT")));
  assert.ok(refused.lines.at(-1).startsWith("THIS RUN: 1 of 2500 "));
  // ...and before anything is sent or recorded, with the lock given back.
  assert.equal(refused.events.length, 0);
  assert.equal(refused.marker, null);
  assert.deepEqual(refused.reader.rechecked, []);
  assert.deepEqual(refused.reader.slept, []);
  assert.equal(existsSync(refused.lockPath), false, "a refused run left its lock behind");
  assert.deepEqual([refused.reader.opened, refused.reader.closed], [1, 1]);
  // The wrong --expect does not hide it: G1 is refused first.
  assert.match((await runWith(rows, SINK_CONFIRM(7, ["--max", "1"]))).halt.message, /^G1: /);

  // The count is of rows IN SCOPE. Two rows beyond the bound take 2501 back under the limit.
  const far = [...many(2499), dbRow(2500, { starts_at: new Date(T0 + 200 * DAY) }), dbRow(2501, { starts_at: new Date(T0 + 201 * DAY) })];
  assert.ok((await runWith(far, [])).lines.includes("G1 UNDER THE LIMIT OF 20000: NO"));
  const bounded = await runWith(far, ["--max-days-ahead", "150"]);
  assert.ok(bounded.lines.includes("held back: starts more than --max-days-ahead 150 days after the read: 2"));
  assert.ok(bounded.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 19992 at most  (2499 appointments in scope x 8: 3 runs and 5 steps each)"));
  assert.ok(bounded.lines.includes("G1 UNDER THE LIMIT OF 20000: yes"));
});

/* ---- G4: the next 48 hours, and attempted equals sent ------------------------ */

test("G4: a row 24 to 48 hours ahead counts when this run leaves it alone, on both sides of both boundaries", () => {
  const left = ["touched_25h", "attempted", "near_mark", "held_back"];
  for (const v of left) {
    assert.equal(leftUnarmed24To48(T0 + LEAD_MS, T0, v), false, `${v} exactly 24 hours ahead`);
    assert.equal(leftUnarmed24To48(T0 + LEAD_MS + 1, T0, v), true, `${v} 1 ms past 24 hours`);
    assert.equal(leftUnarmed24To48(T0 + 36 * HOUR, T0, v), true, v);
    assert.equal(leftUnarmed24To48(T0 + 2 * DAY, T0, v), true, `${v} exactly 48 hours ahead`);
    assert.equal(leftUnarmed24To48(T0 + 2 * DAY + 1, T0, v), false, `${v} 1 ms past 48 hours`);
    assert.equal(leftUnarmed24To48(T0 + 3 * DAY, T0, v), false, v);
  }
  // Re-armed now, re-armed before, not remindable yet, and the verdicts that cannot be in the window at all.
  for (const v of ["emit", "already_sent", "unaccepted_request", "inside_24h", "beyond_max_days"]) {
    assert.equal(leftUnarmed24To48(T0 + 36 * HOUR, T0, v), false, v);
  }
  assert.equal(attemptedEqualsSent(0, 0), true);
  assert.equal(attemptedEqualsSent(25, 25), true);
  assert.equal(attemptedEqualsSent(25, 24), false);
  assert.equal(attemptedEqualsSent(1, 0), false);
  // More sent than started cannot happen; if it ever did it would not read as "equal".
  assert.equal(attemptedEqualsSent(24, 25), false);
});

test("G4: a row within 24 hours counts as not re-armed unless the marker holds it as sent at the start it has now", () => {
  assert.equal(within24hCount("inside_24h", true), "sent_earlier");
  assert.equal(within24hCount("inside_24h", false), "not_rearmed");
  // Only a plain `true` from the marker moves a row out of the count reception reads.
  for (const notSent of [undefined, null, 0, 1, "sent", "true", {}]) assert.equal(within24hCount("inside_24h", notSent), "not_rearmed", String(notSent));
  // Every other verdict is not "within 24 hours" at all, whatever the marker says.
  for (const v of ["unaccepted_request", "beyond_max_days", "touched_25h", "already_sent", "attempted", "near_mark", "held_back", "emit"]) {
    assert.equal(within24hCount(v, true), null, v);
    assert.equal(within24hCount(v, false), null, v);
  }
});

test("G4 on a later read: a row an earlier run sent, now inside 24 hours, is counted apart; an attempted row and a row moved since stay in the count", async () => {
  // RUN 1, at T0. Every row is more than 24 hours ahead and clear of both marks, so all six are sent.
  const first = [
    dbRow(1, { starts_at: new Date(T0 + 30 * HOUR) }),
    dbRow(2, { starts_at: new Date(T0 + 31 * HOUR) }),
    dbRow(3, { starts_at: new Date(T0 + 32 * HOUR) }),
    dbRow(5, { starts_at: new Date(T0 + 3 * DAY) }),
    dbRow(6, { starts_at: new Date(T0 + 38 * HOUR) }),
    dbRow(7, { starts_at: new Date(T0 + 38 * HOUR + 1) }),
  ];
  const run1 = await runWith(first, SINK_CONFIRM(6));
  assert.equal(run1.result.sent, 6);
  assert.ok(run1.lines.includes("G4 NEXT 48 HOURS, NOT RE-ARMED: 0  (starting within 24 hours: 0; 24 to 48 hours ahead: 0)"));
  assert.ok(run1.lines.includes("  not counted: 0 starting within 24 hours that an earlier run of this operation sent"));
  assert.ok(run1.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 48 at most  (6 appointments in scope x 8: 3 runs and 5 steps each)"));
  // Row 2 as a run that died inside its request would have left it: attempted, the outcome unknown.
  const doc = JSON.parse(readFileSync(run1.markerPath, "utf8"));
  const two = doc.history[0].rows.find((x) => x.id === apptId(2));
  two.state = "attempted";
  delete two.eventId;
  writeFileSync(run1.markerPath, JSON.stringify(doc));

  // THE SAME ROWS READ AGAIN 14 HOURS LATER.
  const later = T0 + 14 * HOUR;
  const second = [
    first[0], // sent by run 1 at this start, now 16 hours ahead: re-armed, counted apart
    first[1], // attempted by run 1, now 17 hours ahead: nobody knows, so it stays in the count
    dbRow(3, { starts_at: new Date(T0 + 33 * HOUR) }), // sent by run 1 at ANOTHER start and moved since: it stays in the count
    dbRow(4, { starts_at: new Date(later + 6 * HOUR) }), // never sent
    first[3], // sent, still days ahead: neither line
    first[4], // sent, and now EXACTLY 24 hours ahead, which is inside 24 hours: counted apart
    first[5], // sent, 1 ms past 24 hours: not "within 24 hours" on either line
  ];
  const r = await runWith(second, [], { dir: run1.dir, t0: later });
  assert.equal(r.halt, null);
  // The line above the gates still counts every row inside 24 hours: 3 not re-armed plus 2 sent earlier.
  assert.ok(r.lines.includes("skipped: starts within 24 hours: 5"));
  const g4 = r.lines.findIndex((l) => l.startsWith("G4 NEXT 48 HOURS"));
  assert.deepEqual(r.lines.slice(g4, g4 + 3), [
    "G4 NEXT 48 HOURS, NOT RE-ARMED: 3  (starting within 24 hours: 3; 24 to 48 hours ahead: 0)",
    "  reception sees these appointments in Agenda, and which of them got an SMS in Comunicações, Lembretes SMS",
    "  not counted: 2 starting within 24 hours that an earlier run of this operation sent",
  ]);
  assert.ok(r.lines[g4 + 3].startsWith("G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT"), "the third G4 line is not directly above the G3 line");
  // G1 is the number of THIS read: the sent rows that came inside 24 hours have left the scope.
  assert.ok(r.lines.includes("G1 PROJECTED SCHEDULER EXECUTIONS: 16 at most  (2 appointments in scope x 8: 3 runs and 5 steps each)"));
  // A confirm prints the same three lines.
  const confirm = await runWith(second, SINK_CONFIRM(0), { dir: run1.dir, t0: later });
  assert.equal(confirm.halt, null);
  assert.ok(confirm.lines.includes("G4 NEXT 48 HOURS, NOT RE-ARMED: 3  (starting within 24 hours: 3; 24 to 48 hours ahead: 0)"));
  assert.ok(confirm.lines.includes("  not counted: 2 starting within 24 hours that an earlier run of this operation sent"));
});

test("G4 on a run: within 24 hours, plus the rows 24 to 48 hours ahead that got no event; never an unaccepted request, an eligible row or a sent one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  const touched = { last_emit_at: new Date(T0 - HOUR) };
  const rows = [
    dbRow(1, { starts_at: new Date(T0 + 12 * HOUR) }), // within 24 hours
    dbRow(2, { starts_at: new Date(T0 + 30 * HOUR), unaccepted_request: true, last_emit_at: null }), // not counted
    dbRow(3, { starts_at: new Date(T0 + 30 * HOUR) }), // eligible: re-armed by this run
    dbRow(4, { starts_at: new Date(T0 + 2 * DAY), ...touched }), // exactly 48 hours ahead, touched: counted
    dbRow(5, { starts_at: new Date(T0 + 2 * DAY + 1), ...touched }), // 1 ms past 48 hours: not counted
    dbRow(6, { starts_at: new Date(T0 + 36 * HOUR) }), // attempted by an earlier run: counted
    dbRow(7, { starts_at: new Date(T0 + 40 * HOUR) }), // sent by an earlier run: re-armed
  ];
  writeFileSync(
    join(dir, "sink.jsonl.marker.json"),
    JSON.stringify({
      history: [
        {
          at: "2026-10-07T10:00:00.000Z",
          readAt: "2026-10-07T10:00:00.000Z",
          marginMs: MARGIN,
          state: "done",
          rows: [
            { id: apptId(6), startsAt: rows[5].starts_at.toISOString(), state: "attempted", at: "x" },
            { id: apptId(7), startsAt: rows[6].starts_at.toISOString(), state: "sent", at: "x", eventId: null },
          ],
        },
      ],
    }),
  );
  const r = await runWith(rows, [], { dir });
  assert.equal(r.result.eligible, 1);
  assert.ok(r.lines.includes("G4 NEXT 48 HOURS, NOT RE-ARMED: 3  (starting within 24 hours: 1; 24 to 48 hours ahead: 2)"), r.lines.join("\n"));
  assert.equal(
    r.lines[r.lines.findIndex((l) => l.startsWith("G4 NEXT 48 HOURS")) + 1],
    "  reception sees these appointments in Agenda, and which of them got an SMS in Comunicações, Lembretes SMS",
  );
  // Neither marker row is inside 24 hours, so nothing is counted apart.
  assert.equal(
    r.lines[r.lines.findIndex((l) => l.startsWith("G4 NEXT 48 HOURS")) + 2],
    "  not counted: 0 starting within 24 hours that an earlier run of this operation sent",
  );
  // The ledger is asked about both marker rows, the attempted one included.
  assert.ok(
    r.lines.includes(
      "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 2; handed to a provider: 0; not checkable: 0; expected 0)",
    ),
  );
  assert.deepEqual(r.reader.ledgers.map((w) => w.map((x) => x.appointment_id)), [[apptId(6), apptId(7)]]);
  // --min-days-ahead 2 holds the eligible row back too, and then it counts.
  const narrowed = await runWith(rows, ["--min-days-ahead", "2"], { dir });
  assert.equal(narrowed.result.eligible, 0);
  assert.ok(narrowed.lines.includes("G4 NEXT 48 HOURS, NOT RE-ARMED: 4  (starting within 24 hours: 1; 24 to 48 hours ahead: 3)"));
});

test("G4 and G3 after the sends: a confirm that started no request prints both lines with zeros, waits for nothing and asks nothing more", async () => {
  const rows = [dbRow(1), dbRow(2)];
  const r = await runWith(rows, SINK_CONFIRM(2), { fresh: (id, x) => ({ ...unchanged(x), status: "cancelled" }) });
  assert.equal(r.halt, null);
  assert.deepEqual(r.result, { sent: 0, eligible: 2, changed: 2, attempted: 0, notReached: 0 });
  // The same two closing lines as a run that sent, so a block can look for them after every send. No settle line.
  assert.deepEqual(r.lines.slice(r.lines.indexOf("not reached: 0")), [
    "not reached: 0",
    "G4 ATTEMPTED EQUALS SENT: yes (0 requests started, 0 sent)",
    "G3 AFTER THIS RUN: 0  (appointments checked: 0; handed to a provider: 0; expected 0)",
  ]);
  assert.equal(r.lines.some((l) => l.startsWith("settle")), false, "a run that started no request printed a settle line");
  assert.deepEqual(r.reader.slept, []);
  assert.equal(r.reader.ledgers.length, 1, "a run that started no request read the ledger a second time");
  assert.deepEqual(r.reader.log, ["ledger", "recheck", "recheck"]);
  assert.equal(r.marker.history[0].state, "done");
  assert.deepEqual(r.marker.history[0].rows, []);

  // ONE request started is the other side: the settle, its line and a real second read.
  const one = await runWith(rows, SINK_CONFIRM(2), { fresh: (id, x) => (id === apptId(1) ? unchanged(x) : { ...unchanged(x), status: "cancelled" }) });
  assert.deepEqual(one.lines.slice(one.lines.indexOf("not reached: 0")), [
    "not reached: 0",
    "G4 ATTEMPTED EQUALS SENT: yes (1 requests started, 1 sent)",
    "settle   waited 20 s for the scheduler before the second ledger read",
    "G3 AFTER THIS RUN: 0  (appointments checked: 1; handed to a provider: 0; expected 0)",
  ]);
  assert.deepEqual(one.reader.slept, [20_000]);
  assert.equal(one.reader.ledgers.length, 2);

  // A run that stops before its first request prints the two lines too, above its FAILED.
  const stopped = await runWith(rows, SINK_CONFIRM(2), {
    fresh: () => {
      throw new RangeError("fixture");
    },
  });
  assert.match(stopped.halt.message, /^stopped at bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001: could not be read again \(RangeError\)/);
  assert.deepEqual(stopped.lines.slice(stopped.lines.indexOf("not reached: 2")), [
    "not reached: 2",
    "G4 ATTEMPTED EQUALS SENT: yes (0 requests started, 0 sent)",
    "G3 AFTER THIS RUN: 0  (appointments checked: 0; handed to a provider: 0; expected 0)",
  ]);
  assert.deepEqual(stopped.reader.slept, []);
  assert.equal(stopped.reader.ledgers.length, 1);

  // A confirm with nothing eligible keeps its early ending: neither line, and the marker untouched.
  const none = await runWith([], SINK_CONFIRM(0));
  assert.equal(none.lines.at(-1), "SENT: 0 of 0  (nothing is eligible; the marker was not touched)");
  assert.equal(none.lines.some((l) => l.startsWith("G4 ATTEMPTED EQUALS SENT") || l.startsWith("G3 AFTER THIS RUN")), false);
  assert.equal(none.marker, null);
});

/* ---- G3: the reminder ledger ------------------------------------------------- */

test("G3: the windows are one per marker row, from its run's read instant to the end of its run's margin", () => {
  const readA = "2026-10-08T00:10:00.000Z";
  const readB = "2026-10-08T21:30:00.500Z";
  const entries = [
    {
      at: "a",
      readAt: readA,
      marginMs: 465_000,
      rows: [
        { id: apptId(1), startsAt: "s", state: "sent" },
        { id: apptId(2), startsAt: "s", state: "attempted" },
      ],
    },
    { at: "b", readAt: readB, marginMs: 105_000, rows: [{ id: apptId(3), startsAt: "s", state: "sent" }] },
  ];
  assert.deepEqual(ledgerWindows(entries), {
    windows: [
      { appointment_id: apptId(1), from_at: readA, to_at: "2026-10-08T00:17:45.000Z" },
      { appointment_id: apptId(2), from_at: readA, to_at: "2026-10-08T00:17:45.000Z" },
      { appointment_id: apptId(3), from_at: readB, to_at: "2026-10-08T21:31:45.500Z" },
    ],
    unchecked: 0,
  });
  assert.deepEqual(ledgerWindows([]), { windows: [], unchecked: 0 });
  // A run that sent a row twice (attempted, then sent again by a later run) is asked about twice: once per run.
  assert.equal(ledgerWindows([entries[0], { ...entries[1], rows: [{ id: apptId(2), startsAt: "s", state: "sent" }] }]).windows.length, 3);
  // An entry that cannot say when it read or how wide its margin was is skipped, and its rows are COUNTED.
  const rows2 = [
    { id: apptId(4), startsAt: "s", state: "sent" },
    { id: apptId(5), startsAt: "s", state: "attempted" },
  ];
  for (const broken of [
    { rows: rows2 },
    { readAt: readA, rows: rows2 },
    { marginMs: 465_000, rows: rows2 },
    { readAt: "not an instant", marginMs: 465_000, rows: rows2 },
    { readAt: 1_791_000_000_000, marginMs: 465_000, rows: rows2 },
    // A bare number that Date.parse would read as a year is not an instant this script wrote.
    { readAt: 2026, marginMs: 465_000, rows: rows2 },
    { readAt: readA, marginMs: 0, rows: rows2 },
    { readAt: readA, marginMs: -1, rows: rows2 },
    { readAt: readA, marginMs: 465_000.5, rows: rows2 },
    { readAt: readA, marginMs: "465000", rows: rows2 },
    { readAt: readA, marginMs: null, rows: rows2 },
  ]) {
    assert.deepEqual(ledgerWindows([entries[1], broken]), { windows: [{ appointment_id: apptId(3), from_at: readB, to_at: "2026-10-08T21:31:45.500Z" }], unchecked: 2 }, JSON.stringify(broken));
  }
  // The smallest margin there is still makes a window, 1 ms wide.
  assert.deepEqual(ledgerWindows([{ readAt: readA, marginMs: 1, rows: [rows2[0]] }]), {
    windows: [{ appointment_id: apptId(4), from_at: readA, to_at: "2026-10-08T00:10:00.001Z" }],
    unchecked: 0,
  });
  // A row whose id is not a uuid would fail the whole read: it is counted as not checkable instead.
  const mixed = ledgerWindows([{ readAt: readA, marginMs: 465_000, rows: [rows2[0], { id: "1 or 1=1", startsAt: "s", state: "sent" }, { id: 7, startsAt: "s", state: "sent" }] }]);
  assert.deepEqual([mixed.windows.length, mixed.unchecked], [1, 2]);
  // An id that is not a STRING is not checkable either, even when it would read as a uuid:
  // a one-element list holding a uuid turns into that uuid when a pattern is tried on it.
  const listed = ledgerWindows([{ readAt: readA, marginMs: 465_000, rows: [rows2[0], { id: [apptId(9)], startsAt: "s", state: "sent" }] }]);
  assert.deepEqual(listed, { windows: [{ appointment_id: apptId(4), from_at: readA, to_at: "2026-10-08T00:17:45.000Z" }], unchecked: 1 });
  // Only sent and attempted rows are rows of this operation.
  assert.deepEqual(ledgerWindows([{ readAt: readA, marginMs: 465_000, rows: [{ id: apptId(6), startsAt: "s", state: "skipped" }, null] }]), { windows: [], unchecked: 0 });
  assert.deepEqual(ledgerWindows([null, {}, { readAt: readA, marginMs: 465_000 }]), { windows: [], unchecked: 0 });
});

test("G3: the ledger read is read-only, one tenant, counts only, and its list of windows is ONE JSON string declared as text", () => {
  const flat = (x) => x.replace(/\s+/g, " ").trim();
  assert.equal(
    flat(LEDGER_CHECK),
    flat(`select count(*)::int as n,
                 count(*) filter (where d.outcome <> 'suppressed')::int as handed_over
            from jsonb_to_recordset($2::text::jsonb) as s(appointment_id uuid, from_at timestamptz, to_at timestamptz)
            join reminder_dispatches d
              on d.tenant_id = $1::uuid
             and d.appointment_id = s.appointment_id
             and d.created_at >= s.from_at
             and d.created_at < s.to_at`),
  );
  // Counts only: the select list is two counts and nothing else.
  const list = flat(LEDGER_CHECK).match(/^select (.*) from jsonb_to_recordset/)?.[1];
  assert.equal(list, "count(*)::int as n, count(*) filter (where d.outcome <> 'suppressed')::int as handed_over");
  // One tenant, bound from $1, and exactly two parameters.
  assert.match(LEDGER_CHECK, /d\.tenant_id = \$1::uuid/);
  assert.deepEqual([...new Set(LEDGER_CHECK.match(/\$\d+/g))].sort(), ["$1", "$2"]);
  // `$2::jsonb` alone fails on the real driver: it encodes the string a second time (measured, see the script).
  assert.doesNotMatch(LEDGER_CHECK, /\$2::jsonb/);
  assert.doesNotMatch(LEDGER_CHECK, /;|\b(insert|update|delete|truncate|drop|alter|create|grant|call|do)\b/i);
  // Asked inside a READ ONLY transaction, with the list as one JSON string and never as an array.
  assert.match(CODE, /sql\.begin\("read only", \(tx\) => tx\.unsafe\(LEDGER_CHECK, \[tenantId, JSON\.stringify\(windows\)\]\)\)/);
  assert.equal((CODE.match(/LEDGER_CHECK/g) ?? []).length, 2, "the ledger statement is used somewhere else too");
});

test("G3: the real reader ALWAYS asks the database, with no window as with one", async () => {
  // Port 1 is closed, so any statement at all fails with ECONNREFUSED. That failure is the proof
  // that the statement was sent: with no window the reader used to answer zero without asking.
  for (const windows of [[], [{ appointment_id: apptId(1), from_at: at(T0), to_at: at(T0 + MARGIN) }]]) {
    const reader = await openReader(LANE_URL);
    try {
      await assert.rejects(reader.ledger(TENANT, windows), (e) => /^[A-Za-z]+ ECONNREFUSED$/.test(describeError(e)), `${windows.length} window(s): the reader answered without asking`);
    } finally {
      await reader.close();
    }
  }
  // No shortcut on the number of windows anywhere, and the reader's whole body is the statement and its mapping.
  assert.doesNotMatch(CODE, /windows\.length\s*(===|==|<|>|!==|!=)/, "the reader, or the run, decides something on the number of windows again");
  assert.match(
    CODE,
    /async ledger\(tenantId, windows\) \{\s+const rows = await sql\.begin\("read only", \(tx\) => tx\.unsafe\(LEDGER_CHECK, \[tenantId, JSON\.stringify\(windows\)\]\)\);\s+return ledgerAnswer\(rows\);\s+\},/,
  );
});

test("G3: the reader's answer is ONE row of two whole numbers, read by name, and anything else is NO_COUNT", () => {
  // Different numbers on purpose: swapping the two columns, or reading one of them twice, fails here.
  assert.deepEqual(ledgerAnswer([{ n: 3, handed_over: 1 }]), { n: 3, handedOver: 1 });
  assert.deepEqual(ledgerAnswer([{ n: 1, handed_over: 3 }]), { n: 1, handedOver: 3 });
  assert.deepEqual(ledgerAnswer([{ n: 0, handed_over: 0 }]), { n: 0, handedOver: 0 });
  // The driver's result is a list of its own kind, and a column the statement does not select is ignored.
  class Result extends Array {}
  assert.deepEqual(ledgerAnswer(Result.from([{ n: 2, handed_over: 2, command: "SELECT" }])), { n: 2, handedOver: 2 });
  assert.deepEqual(Object.keys(ledgerAnswer([{ n: 3, handed_over: 1 }])), ["n", "handedOver"]);
  const noCount = (e) => e instanceof Error && e.code === "NO_COUNT" && describeError(e) === "Error NO_COUNT";
  for (const rows of [
    // Not exactly one row: none, two (reading the first, or the last, of several is not an answer), or no list at all.
    [],
    [{ n: 3, handed_over: 1 }, { n: 0, handed_over: 0 }],
    [{ n: 0, handed_over: 0 }, { n: 3, handed_over: 1 }],
    undefined,
    null,
    { n: 0, handed_over: 0 },
    { 0: { n: 0, handed_over: 0 }, length: 1 },
    [null],
    [undefined],
    // One row that does not carry two whole numbers under the statement's two names.
    [{}],
    [{ n: 0 }],
    [{ handed_over: 0 }],
    [{ n: 0, handedOver: 0 }],
    [{ handed_over: 0, count: 0 }],
    [{ n: null, handed_over: 0 }],
    [{ n: 0, handed_over: null }],
    [{ n: "0", handed_over: 0 }],
    [{ n: 0, handed_over: "0" }],
    [{ n: -1, handed_over: 0 }],
    [{ n: 0, handed_over: -1 }],
    [{ n: 0.5, handed_over: 0 }],
    [{ n: 0, handed_over: 0.5 }],
    [{ n: Number.NaN, handed_over: 0 }],
    [{ n: 0, handed_over: Number.NaN }],
  ]) {
    assert.throws(() => ledgerAnswer(rows), noCount, JSON.stringify(rows));
  }
});

test("G3: the table and the columns the ledger read uses are the ones schema.ts and migration 0075 carry", () => {
  const schema = readFileSync(join(ROOT, "packages/db/src/schema.ts"), "utf8");
  const start = schema.indexOf('export const reminderDispatches = pgTable(\n  "reminder_dispatches",');
  assert.ok(start > 0, "reminder_dispatches is no longer a table in schema.ts");
  const table = schema.slice(start, schema.indexOf("\nexport const ", start + 1));
  // Every column the statement reads from the ledger, taken from the statement itself.
  const read = [...new Set([...LEDGER_CHECK.matchAll(/\bd\.([a-z_]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(read, ["appointment_id", "created_at", "outcome", "tenant_id"]);
  assert.match(LEDGER_CHECK, /join reminder_dispatches d\b/);
  for (const column of ['uuid("tenant_id")', 'uuid("appointment_id")', 'text("outcome")', 'timestamp("created_at", { withTimezone: true }).notNull().defaultNow()']) {
    assert.ok(table.includes(column), `schema.ts no longer declares ${column} on reminder_dispatches`);
  }
  // `created_at` is written by the database clock, which is the clock the windows are built from.
  // And 'suppressed' is still one of the three outcomes, so "handed over" still means the other two.
  const migration = readFileSync(join(ROOT, "packages/db/migrations/0075_reminder_dispatches.sql"), "utf8");
  assert.match(migration, /CHECK \(outcome IN \('sent', 'suppressed', 'provider_error'\)\)/);
});

test("G3: ledger rows found by the first read stop every mode before anything is sent", async () => {
  const rows = [dbRow(1), dbRow(2), dbRow(3)];
  const first = await runWith(rows, SINK_CONFIRM(3, ["--max", "2"]));
  assert.equal(first.result.sent, 2);
  const windows = [apptId(1), apptId(2)].map((id) => ({ appointment_id: id, from_at: at(T0), to_at: at(T0 + marginMsFor(2)) }));
  assert.deepEqual(first.reader.ledgers, [[], windows]);
  const sentence = (n) =>
    `G3: ${n} reminder ledger row(s) were written for appointments this operation sent, inside the margin of the run that sent them. ` +
    "No message may leave at run time. Send nothing further and report every line above.";

  // The smallest count there is, one row, and it was only a suppressed attempt: still a stop.
  for (const [answer, line] of [
    [{ n: 1, handedOver: 0 }, "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 1  (appointments checked: 2; handed to a provider: 0; not checkable: 0; expected 0)"],
    [{ n: 4, handedOver: 3 }, "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 4  (appointments checked: 2; handed to a provider: 3; not checkable: 0; expected 0)"],
  ]) {
    for (const argv of [[], SINK_CONFIRM(1)]) {
      const r = await runWith(rows, argv, { dir: first.dir, ledger: () => answer });
      assert.equal(r.halt?.code, 1, `${argv.join(" ")}: a ledger row did not stop the run`);
      assert.equal(r.halt.message, sentence(answer.n));
      // The line is printed, it is the last one, and it follows the three G4 lines.
      assert.equal(r.lines.at(-1), line);
      assert.equal(r.lines.at(-2), "  not counted: 0 starting within 24 hours that an earlier run of this operation sent");
      assert.ok(r.lines.at(-3).startsWith("  reception sees these appointments in Agenda"));
      assert.equal(r.lines.some((l) => l.startsWith("THIS RUN:")), false);
      // The read asked about the two rows the marker holds, in every mode.
      assert.deepEqual(r.reader.ledgers, [windows]);
      // Nothing was sent, re-read or recorded, nobody waited, and the lock is given back.
      assert.equal(r.events.length, 2, "an event was sent after the ledger said a message had left");
      assert.equal(r.marker.history.length, 1);
      assert.deepEqual(r.reader.rechecked, []);
      assert.deepEqual(r.reader.slept, []);
      assert.equal(existsSync(r.lockPath), false, "a stopped run left its lock behind");
      assert.deepEqual([r.reader.opened, r.reader.closed], [1, 1]);
    }
  }
  // With the ledger clean again the same confirm goes through.
  const clean = await runWith(rows, SINK_CONFIRM(1), { dir: first.dir });
  assert.equal(clean.result.sent, 1);
});

test("G3: a marker row that cannot be checked against the ledger stops every mode, after the G3 line and before anything is sent", async () => {
  const rows = [dbRow(1), dbRow(2), dbRow(3), dbRow(4)];
  const iso = (n) => rows[n - 1].starts_at.toISOString();
  const readAt = at(T0 - DAY);
  const good = { at: "a", readAt, marginMs: MARGIN, state: "done", rows: [{ id: apptId(1), startsAt: iso(1), state: "sent", at: "x", eventId: null }] };
  const two = { id: apptId(2), startsAt: iso(2), state: "sent", at: "x", eventId: null };
  const three = { id: apptId(3), startsAt: iso(3), state: "attempted", at: "x" };
  const window1 = [{ appointment_id: apptId(1), from_at: readAt, to_at: at(T0 - DAY + MARGIN) }];
  const sentence = (u) =>
    `G3: ${u} marker row(s) cannot be checked against the ledger. The marker is this operation's only record of what was sent. ` +
    "Send nothing further and report every line above.";
  const seed = (second) => {
    const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
    const text = JSON.stringify({ history: [good, second] });
    writeFileSync(join(dir, "sink.jsonl.marker.json"), text);
    return { dir, text };
  };

  // ONE row is enough (an entry that cannot say when it read), and two are counted as two (no margin on record).
  for (const [second, u] of [
    [{ at: "b", state: "done", rows: [two] }, 1],
    [{ at: "b", readAt, state: "done", rows: [two, three] }, 2],
  ]) {
    for (const argv of [[], SINK_CONFIRM(4 - 1 - second.rows.length)]) {
      const { dir, text } = seed(second);
      const r = await runWith(rows, argv, { dir });
      assert.equal(r.halt?.code, 1, `${argv.join(" ")}: an unchecked marker row did not stop the run`);
      assert.equal(r.halt.message, sentence(u));
      // The G3 line is printed first, with the count the ledger really gave, and it is the last line.
      assert.equal(
        r.lines.at(-1),
        `G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 1; handed to a provider: 0; not checkable: ${u}; expected 0)`,
      );
      assert.equal(r.lines.some((l) => l.startsWith("THIS RUN:")), false);
      assert.deepEqual(r.reader.ledgers, [window1], "the rows that can be checked were not asked about");
      // Nothing was sent, re-read or recorded, nobody waited, and the lock is given back.
      assert.equal(r.events.length, 0, "an event was sent with a marker row nobody could check");
      assert.equal(readFileSync(r.markerPath, "utf8"), text, "the marker was written");
      assert.deepEqual(r.reader.rechecked, []);
      assert.deepEqual(r.reader.slept, []);
      assert.equal(existsSync(r.lockPath), false, "a stopped run left its lock behind");
      assert.deepEqual([r.reader.opened, r.reader.closed], [1, 1]);
    }
  }

  // A ledger row AND an unchecked marker row: the ledger row is the one reported.
  const both = await runWith(rows, [], { dir: seed({ at: "b", state: "done", rows: [two] }).dir, ledger: () => ({ n: 1, handedOver: 0 }) });
  assert.match(both.halt.message, /^G3: 1 reminder ledger row\(s\) /);

  // THE OTHER SIDE: the same marker with the second entry whole. Nothing is unchecked, and every mode goes on.
  const whole = { at: "b", readAt, marginMs: MARGIN, state: "done", rows: [two, three] };
  const dry = await runWith(rows, [], { dir: seed(whole).dir });
  assert.equal(dry.halt, null);
  assert.ok(
    dry.lines.includes(
      "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 3; handed to a provider: 0; not checkable: 0; expected 0)",
    ),
  );
  assert.ok(dry.lines.some((l) => l.startsWith("THIS RUN: 1 of 1 ")));
  const sent = await runWith(rows, SINK_CONFIRM(1), { dir: seed(whole).dir });
  assert.equal(sent.halt, null);
  assert.deepEqual(sent.events.map((e) => e.data.appointmentId), [apptId(4)]);
});

test("G3: ledger rows found after the sends fail the run after its closing lines, and a failed send is still reported first", async () => {
  const rows = [dbRow(1), dbRow(2), dbRow(3)];
  const second = (answer) => (call) => (call === 2 ? answer : ZERO);
  const r = await runWith(rows, SINK_CONFIRM(3), { ledger: second({ n: 3, handedOver: 2 }) });
  assert.equal(r.halt?.code, 1);
  assert.equal(
    r.halt.message,
    "G3: 3 reminder ledger row(s) were written for appointments this operation sent, inside the margin of the run that sent them. " +
      "No message may leave at run time. Send nothing further and report every line above.",
  );
  assert.deepEqual(r.lines.slice(r.lines.indexOf("changed since the read, not sent: 0") - 1), [
    `SENT: 3 of 3  (recorded in ${r.markerPath})`,
    "changed since the read, not sent: 0",
    "attempted, outcome unknown: 0",
    "not reached: 0",
    "G4 ATTEMPTED EQUALS SENT: yes (3 requests started, 3 sent)",
    "settle   waited 20 s for the scheduler before the second ledger read",
    "G3 AFTER THIS RUN: 3  (appointments checked: 3; handed to a provider: 2; expected 0)",
  ]);
  // What was sent stays sent and recorded; the lock is given back.
  assert.equal(r.events.length, 3);
  assert.deepEqual(r.marker.history[0].rows.map((x) => x.state), ["sent", "sent", "sent"]);
  // The run records itself: its marker entry says the second read failed, not `done`.
  assert.equal(r.marker.history[0].state, "g3_failed");
  assert.equal(existsSync(r.lockPath), false);
  // One row is enough, for the failure and for the record.
  const oneRow = await runWith(rows, SINK_CONFIRM(3), { ledger: second({ n: 1, handedOver: 0 }) });
  assert.match(oneRow.halt.message, /^G3: 1 reminder ledger row\(s\) /);
  assert.equal(oneRow.marker.history[0].state, "g3_failed");
  // And zero rows is the other side: `done`, with one marker write fewer.
  const writes = { clean: 0, failed: 0 };
  const counting = (key) => (marker, entries) => {
    writes[key] += 1;
    writeMarker(marker, entries);
  };
  const cleanRun = await runWith(rows, SINK_CONFIRM(3), { ledger: second(ZERO), writeMarker: counting("clean") });
  assert.equal(cleanRun.halt, null);
  assert.equal(cleanRun.marker.history[0].state, "done");
  await runWith(rows, SINK_CONFIRM(3), { ledger: second({ n: 1, handedOver: 0 }), writeMarker: counting("failed") });
  assert.deepEqual(writes, { clean: 8, failed: 9 }, "the claim, two per row and the closing write; a failed second read adds exactly one");
  // The later run reads that entry like any other: its rows are still sent, and nothing is unfinished.
  const next = await runWith(rows, [], { dir: r.dir });
  assert.equal(next.result.eligible, 0);
  assert.equal(next.lines.some((l) => l.startsWith("NOTE")), false);

  // The record is written with a warning on failure, never instead of the failure: the run still ends on G3.
  const errors = [];
  const realError = console.error;
  console.error = (line) => errors.push(String(line));
  let unrecorded;
  try {
    let calls = 0;
    unrecorded = await runWith(rows, SINK_CONFIRM(3), {
      ledger: second({ n: 2, handedOver: 0 }),
      writeMarker: (marker, entries) => {
        calls += 1;
        if (calls === 9) throw Object.assign(new Error("fixture: the disk is full"), { code: "ENOSPC" });
        writeMarker(marker, entries);
      },
    });
  } finally {
    console.error = realError;
  }
  assert.match(unrecorded.halt.message, /^G3: 2 reminder ledger row\(s\) /);
  assert.deepEqual(errors, [`WARNING: could not update ${unrecorded.markerPath}. Keep every line above and below; they are the record.`]);
  assert.equal(unrecorded.marker.history[0].state, "done", "the fixture's write failed, so the marker keeps what the closing write said");
  assert.equal(existsSync(unrecorded.lockPath), false);

  // A run that stopped on a failed send says THAT, with the G3 line still printed above it.
  const dir = mkdtempSync(join(tmpdir(), "inc1007-run-"));
  mkdirSync(join(dir, "sink.jsonl"));
  const stopped = await runWith(rows, SINK_CONFIRM(3), { dir, ledger: second({ n: 1, handedOver: 1 }) });
  assert.match(stopped.halt.message, /^stopped at bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001: could not write the sink file/);
  assert.equal(stopped.lines.at(-1), "G3 AFTER THIS RUN: 1  (appointments checked: 1; handed to a provider: 1; expected 0)");
  // The marker says which of the two is the graver: a ledger row. The attempted row still says where the run stopped.
  assert.equal(stopped.marker.history[0].state, "g3_failed");
  assert.deepEqual(stopped.marker.history[0].rows.map((x) => x.state), ["attempted"]);

  // Out of time AND a ledger row: the G3 failure, and no OUT OF TIME line to read as a normal ending.
  const clock = [0, 1_000, 390_000, 390_001];
  let calls = 0;
  const late = await runWith(rows, SINK_CONFIRM(3), { now: () => clock[Math.min(calls++, clock.length - 1)], ledger: second({ n: 1, handedOver: 1 }) });
  assert.match(late.halt.message, /^G3: 1 reminder ledger row\(s\) /);
  assert.equal(late.marker.history[0].state, "g3_failed");
  assert.equal(late.lines.some((l) => l.startsWith("OUT OF TIME")), false);
});

test("G3: a ledger read that fails, answers late or answers without a count is a failure, never a zero", async () => {
  const rows = [dbRow(1), dbRow(2)];
  // The first read, in a dry run and in a confirm: nothing is sent.
  for (const argv of [[], SINK_CONFIRM(2)]) {
    const r = await runWith(rows, argv, {
      ledger: () => {
        throw leaky("PostgresError", "57014");
      },
    });
    assert.equal(r.halt?.code, 1);
    assert.equal(r.halt.message, "the G3 ledger read failed: PostgresError 57014");
    assertNoLeak([r.halt.message, ...r.lines].join("\n"));
    assert.equal(r.lines.some((l) => l.startsWith("G3 ") || l.startsWith("THIS RUN:")), false);
    assert.equal(r.events.length, 0);
    assert.equal(r.marker, null);
    assert.deepEqual(r.reader.rechecked, []);
    assert.equal(existsSync(r.lockPath), false, "a failed ledger read left the lock behind");
  }
  // An answer that is not two whole numbers. `null > 0` is false, so without the check each of these would read as "no message left".
  for (const answer of [undefined, null, {}, { n: 0 }, { handedOver: 0 }, { n: null, handedOver: 0 }, { n: "0", handedOver: 0 }, { n: 0, handedOver: "0" }, { n: -1, handedOver: 0 }, { n: 0, handedOver: -1 }, { n: 0.5, handedOver: 0 }, { n: Number.NaN, handedOver: 0 }]) {
    const r = await runWith(rows, SINK_CONFIRM(2), { ledger: () => answer });
    assert.equal(r.halt?.message, "the G3 ledger read failed: Error NO_COUNT", JSON.stringify(answer));
    assert.equal(r.events.length, 0);
  }
  assert.equal((await runWith(rows, [], { ledger: () => ({ n: 0, handedOver: 0 }) })).halt, null);

  // The second read: the sends stand, the line says the ledger was NOT READ, and the run fails.
  const after = await runWith(rows, SINK_CONFIRM(2), {
    ledger: (call) => {
      if (call === 2) throw leaky("PostgresError", "57014");
      return ZERO;
    },
  });
  assert.equal(after.halt?.code, 1);
  assert.equal(after.halt.message, "the G3 ledger read failed: PostgresError 57014");
  assert.deepEqual(after.lines.slice(-3), [
    "G4 ATTEMPTED EQUALS SENT: yes (2 requests started, 2 sent)",
    "settle   waited 20 s for the scheduler before the second ledger read",
    "G3 AFTER THIS RUN: NOT READ  (the G3 ledger read failed: PostgresError 57014)",
  ]);
  assertNoLeak([after.halt.message, ...after.lines].join("\n"));
  assert.equal(after.events.length, 2);
  assert.deepEqual(after.marker.history[0].rows.map((x) => x.state), ["sent", "sent"]);
  // A second read that could not be made is recorded the same way: nobody knows that no message left.
  assert.equal(after.marker.history[0].state, "g3_failed");
  assert.equal(existsSync(after.lockPath), false);
  const noCount = await runWith(rows, SINK_CONFIRM(2), { ledger: (call) => (call === 2 ? { n: null, handedOver: 0 } : ZERO) });
  assert.equal(noCount.halt.message, "the G3 ledger read failed: Error NO_COUNT");
  assert.equal(noCount.marker.history[0].state, "g3_failed");

  // And a read that never answers loses to its bound.
  const started = Date.now();
  const slow = await runWith(rows, [], { ledger: () => new Promise(() => {}) });
  assert.equal(slow.halt?.message, "the G3 ledger read failed: Error TIMEOUT");
  const took = Date.now() - started;
  assert.ok(took >= LEDGER_BOUND_MS - 100 && took < LEDGER_BOUND_MS + 3000, `the ledger bound is not ${LEDGER_BOUND_MS} ms (took ${took})`);
});

test("the script and its document carry no em dash, and the document carries what the operator needs", () => {
  const doc = readFileSync(join(ROOT, "docs/data-op-inc-1007-rearm-reminders.md"), "utf8");
  for (const [name, text] of [["script", SRC], ["document", doc]]) assert.doesNotMatch(text, /\u2014/, `${name} carries an em dash`);
  for (const word of [
    "blocked_what",
    "options",
    "recommendation",
    "NOT REHEARSED",
    "--i-checked-inngest-settings",
    "--fix-deployed-sha",
    "--resend-attempted",
    "attempted",
    ".lock",
    "465",
    "690",
    "caffeinate -i",
    "23 hours",
    "ONLY with the new scheduler settings live",
    "cannot tell old settings from new",
    "--max-days-ahead",
    "G1",
    "G3",
    "G4",
    "Lembretes SMS",
    "Replay",
    "20000",
    "event.data.confirmationEligible == true",
  ]) {
    assert.ok(doc.includes(word), `the document does not carry ${word}`);
  }
  assert.doesNotMatch(doc, /drops? a repeat|inc1007-rearm:/, "the document claims again that a repeated event id is dropped");
});
