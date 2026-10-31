// R36: packages/db/scripts/r36-fallback-rearm-emit.mjs, the fallback re-arm of 2026-11-04.
//
// WHAT THIS PROVES, with no database and no network:
//   * its own arguments: the owner's word is taken off before the 2026-10-12 program reads the rest;
//     --max-days-ahead is required in every mode and is 2 to 28; --max is at most 200; every other
//     argument is judged by the 2026-10-12 program BEFORE anything is read;
//   * THE SWEEP REFUSAL: the switch of this shell compared exactly as sweep-mode.ts compares it, the
//     owner's word, and production's heartbeats, each refusing on its own, in that order, each
//     before the 2026-10-12 program is called, and the heartbeat read before nothing else;
//   * the heartbeat read is one READ ONLY statement of one tenant, counts and a mode word only, and
//     an answer that is not exactly that is an error, never a pass;
//   * COUNTS ONLY: a whole sitting (dry run, canary, rest, closing) run through the REAL run() of
//     the 2026-10-12 program, with a fake reader and a sink, prints no uuid on any line, and still
//     prints every line the document's blocks look for;
//   * its marker lives in its own folder, never in the 2026-10-12 sitting's marker;
//   * it never prints the value of an environment variable or any part of the connection string.
// WHAT IT DOES NOT PROVE: the heartbeat read on a database, and anything on production. The
// document says so ("Rehearsal", NOT REHEARSED).
//
// Run: pnpm test:scripts

import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Halt, buildEvent } from "../packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";
import { wholeSitting } from "./r36-fallback-rearm-sitting.mjs";
import {
  HEARTBEAT_FRESH_S,
  HEARTBEAT_READ,
  HORIZON_DAYS,
  MAX_PER_RUN,
  OWNER_FLAG,
  R36_HOME_NAME,
  SWEEP_OK_LINE,
  countsOnly,
  heartbeatAnswer,
  heartbeatVerdict,
  redact,
  runFallback,
  splitArgs,
  sweepSwitchWord,
} from "../packages/db/scripts/r36-fallback-rearm-emit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/r36-fallback-rearm-emit.mjs");
const SRC = readFileSync(SCRIPT, "utf8");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** A self-declared fixture password. Never a credential. The hosts are .invalid or the loopback. */
const PW = "s3cr3t-do-not-print";
const LANE_URL = `postgresql://postgres:${PW}@127.0.0.1:1/postgres`;
const OTHER_URL = `postgresql://someone:${PW}@db.invalid:5432/postgres`;
const SLUG = ["--tenant-slug", "osteojp"];
const SCOPE = ["--max-days-ahead", "28"];
const SHA_OK = "abcdef0123abcdef0123abcdef0123abcdef0123";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-11-04T21:30:00.000Z");
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apptId = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(n).padStart(4, "0")}`;

/** What production's heartbeats answer when the sweep is in shadow and running. */
const SHADOW_OK = { tenants: 1, latestMode: "shadow", latestAgeS: 600, shadowLast3h: 12, notShadowLast7d: 0 };

/** A heartbeat reader that answers `answer`, and records that it was asked. */
function heartbeat(answer = SHADOW_OK, log = []) {
  return async (raw) => {
    log.push(["open", raw === LANE_URL]);
    return {
      read: async (slug) => {
        log.push(["read", slug]);
        if (answer instanceof Error) throw answer;
        return answer;
      },
      close: async () => log.push(["close"]),
    };
  };
}

/** A rearm that must never be reached. */
const noRearm = async () => {
  throw new Error("the 2026-10-12 program was called");
};

async function fallback(argv, opts = {}) {
  const lines = [];
  const log = [];
  let halt = null;
  let result = null;
  try {
    result = await runFallback(argv, {
      env: opts.env ?? { DATABASE_URL_DIRECT: LANE_URL },
      out: (l) => lines.push(l),
      home: opts.home ?? mkdtempSync(join(tmpdir(), "r36-home-")),
      openHeartbeat: opts.openHeartbeat ?? heartbeat(opts.answer, log),
      rearm: opts.rearm ?? noRearm,
      ...(opts.deps ?? {}),
    });
  } catch (e) {
    if (!(e instanceof Halt)) throw e;
    halt = e;
  }
  return { lines, log, halt, result, text: lines.join("\n") };
}

/* ---- the arguments ------------------------------------------------------------------------ */

test("its own arguments: the owner's word is taken off, the rest goes on unchanged", () => {
  const a = splitArgs([...SLUG, ...SCOPE, "--max", "200", OWNER_FLAG, "--min-days-ahead", "3"]);
  assert.deepEqual(a.rearmArgv, [...SLUG, ...SCOPE, "--max", "200", "--min-days-ahead", "3"]);
  assert.equal(a.ownerSays, true);
  assert.equal(a.tenantSlug, "osteojp");
  assert.equal(a.maxDaysAhead, 28);
  assert.equal(a.confirm, false);
  assert.equal(a.sink, false);
  assert.equal(splitArgs([...SLUG, ...SCOPE]).ownerSays, false);
  assert.equal(splitArgs([...SLUG, ...SCOPE, "--confirm", "--expect", "1"]).confirm, true);
  assert.equal(splitArgs([...SLUG, ...SCOPE, "--sink-file", "/tmp/x"]).sink, true);
});

test("--max-days-ahead is required in EVERY mode and is a whole number from 2 to 28", () => {
  const code = (argv) => {
    try {
      splitArgs(argv);
      return 0;
    } catch (e) {
      assert.ok(e instanceof Halt);
      return e.code;
    }
  };
  assert.equal(HORIZON_DAYS, 28);
  assert.equal(code([...SLUG]), 2, "a dry run without it");
  assert.equal(code([...SLUG, "--max-days-ahead"]), 2);
  assert.equal(code([...SLUG, "--max-days-ahead", "--max"]), 2);
  for (const ok of ["2", "27", "28"]) assert.equal(code([...SLUG, "--max-days-ahead", ok]), 0, ok);
  for (const no of ["1", "29", "30", "9999", "028", "28.0", "-28", "x"]) assert.equal(code([...SLUG, "--max-days-ahead", no]), 2, no);
  assert.equal(code([...SLUG, ...SCOPE, ...SCOPE]), 2, "given twice");
});

test("--max is at most 200, and the tenant slug is required", () => {
  const code = (argv) => {
    try {
      splitArgs(argv);
      return 0;
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(MAX_PER_RUN, 200);
  assert.equal(code([...SLUG, ...SCOPE, "--max", "200"]), 0);
  assert.equal(code([...SLUG, ...SCOPE, "--max", "5"]), 0);
  assert.equal(code([...SLUG, ...SCOPE]), 0, "absent is the 2026-10-12 default, 25");
  for (const no of ["201", "1000", "0", "x"]) assert.equal(code([...SLUG, ...SCOPE, "--max", no]), 2, no);
  assert.equal(code([...SLUG, ...SCOPE, "--max"]), 2);
  assert.equal(code([...SCOPE]), 2);
  assert.equal(code(["--tenant-slug", "Osteo JP", ...SCOPE]), 2);
});

test("every argument of the 2026-10-12 program is judged BEFORE anything is read", async () => {
  for (const argv of [
    [...SLUG, ...SCOPE, OWNER_FLAG, "--confirm"],
    [...SLUG, ...SCOPE, OWNER_FLAG, "--unknown"],
    [...SLUG, ...SCOPE, OWNER_FLAG, "--confirm", "--expect", "1"],
    [...SLUG, ...SCOPE, OWNER_FLAG, "--min-days-ahead", "28"],
  ]) {
    const r = await fallback(argv);
    assert.equal(r.halt?.code, 2, argv.join(" "));
    assert.deepEqual(r.log, [], `${argv.join(" ")}: the heartbeats were read`);
  }
});

/* ---- the sweep refusal ---------------------------------------------------------------------- */

test("this shell's switch is compared EXACTLY as sweep-mode.ts compares it, and its value is never returned", () => {
  assert.match(read("apps/web/lib/reminders/sweep-mode.ts"), /return env\.REMINDERS_SWEEP_MODE === "send" \? "send" : "shadow";/);
  assert.deepEqual(sweepSwitchWord({}), { set: false, mode: "shadow" });
  assert.deepEqual(sweepSwitchWord({ REMINDERS_SWEEP_MODE: "send" }), { set: true, mode: "send" });
  for (const v of ["shadow", "SEND", "Send", " send", "send ", "send\n", "true", "1", "on", ""]) {
    assert.deepEqual(sweepSwitchWord({ REMINDERS_SWEEP_MODE: v }), { set: true, mode: "shadow" }, JSON.stringify(v));
  }
  assert.deepEqual(Object.keys(sweepSwitchWord({ REMINDERS_SWEEP_MODE: "x" })).sort(), ["mode", "set"]);
});

test("a switch that reads send refuses first: nothing is read and the 2026-10-12 program is not called", async () => {
  const r = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], { env: { DATABASE_URL_DIRECT: LANE_URL, REMINDERS_SWEEP_MODE: "send" } });
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, /reads send in this shell's environment.*nothing was read and nothing was sent/);
  assert.match(r.text, /^sweep {4}the send switch in this shell's environment: SET, it reads as send$/m);
  assert.deepEqual(r.log, []);
  assert.doesNotMatch(r.text, /owner's word/, "it went on past the switch");
});

test("without the owner's word it refuses before reading anything", async () => {
  const r = await fallback([...SLUG, ...SCOPE]);
  assert.equal(r.halt?.code, 1);
  assert.match(r.halt.message, new RegExp(`has not said .*\\(${OWNER_FLAG}\\).*Vercel`));
  assert.match(r.text, /^sweep {4}the owner's word that the switch is not send in production: NOT GIVEN$/m);
  assert.deepEqual(r.log, []);
});

test("the target: only the exact production target or a strict local one is read, the heartbeats included", async () => {
  const other = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], { env: { DATABASE_URL_DIRECT: OTHER_URL } });
  assert.equal(other.halt?.code, 1);
  assert.deepEqual(other.log, []);
  const none = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], { env: {} });
  assert.equal(none.halt?.code, 2);
  const junk = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], { env: { DATABASE_URL_DIRECT: `not a url ${PW}` } });
  assert.equal(junk.halt?.code, 2);
  for (const r of [other, none, junk]) assert.ok(!(r.text + r.halt.message).includes(PW), "the password was printed");
});

test("the heartbeats: each refusal is its own, and only a fresh shadow with no other mode this week passes", () => {
  const v = (over) => heartbeatVerdict({ ...SHADOW_OK, ...over });
  assert.equal(v({}).ok, true);
  assert.equal(v({ latestAgeS: HEARTBEAT_FRESH_S }).ok, true, "exactly 12 hours old");
  assert.equal(HEARTBEAT_FRESH_S, 12 * 3600);
  const no = (over, why) => {
    const r = v(over);
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.match(r.why, why);
  };
  no({ latestAgeS: HEARTBEAT_FRESH_S + 1 }, /more than 12 hours old/);
  no({ latestMode: "send" }, /not shadow \(it reads send\)/);
  no({ latestMode: "weird" }, /not shadow \(it reads unrecognised\)/);
  no({ latestMode: null, latestAgeS: null }, /no heartbeat/);
  no({ notShadowLast7d: 1 }, /1 heartbeat\(s\) of the last 7 days are not shadow.*fresh ruling/);
  no({ tenants: 0 }, /matched 0 tenants/);
  no({ tenants: 2 }, /matched 2 tenants/);
  assert.deepEqual(v({}).lines, [
    "sweep    production's heartbeats: newest shadow, 10 minutes ago; shadow in the last 3 hours: 12; anything but shadow in the last 7 days: 0",
  ]);
});

test("the heartbeat answer is ONE row of the five values, read by name, and anything else is NO_COUNT", () => {
  const row = { tenants: 1, latest_mode: "shadow", latest_age_s: 60, shadow_last_3h: 3, not_shadow_last_7d: 0 };
  assert.deepEqual(heartbeatAnswer([row]), { tenants: 1, latestMode: "shadow", latestAgeS: 60, shadowLast3h: 3, notShadowLast7d: 0 });
  assert.deepEqual(heartbeatAnswer([{ ...row, latest_mode: null, latest_age_s: null }]).latestMode, null);
  for (const bad of [
    [],
    [row, row],
    null,
    [{ ...row, tenants: "1" }],
    [{ ...row, latest_mode: "Shadow" }],
    [{ ...row, latest_mode: "shadow; drop" }],
    [{ ...row, latest_age_s: -1 }],
    [{ ...row, latest_age_s: 1.5 }],
    [{ ...row, shadow_last_3h: null }],
    [{ ...row, not_shadow_last_7d: undefined }],
  ]) {
    assert.throws(() => heartbeatAnswer(bad), (e) => e.code === "NO_COUNT", JSON.stringify(bad));
  }
});

test("a refusal by the heartbeats, or a heartbeat read that fails, stops it before the 2026-10-12 program", async () => {
  for (const answer of [{ ...SHADOW_OK, latestMode: "send" }, { ...SHADOW_OK, notShadowLast7d: 3 }, { ...SHADOW_OK, latestAgeS: 50_000 }]) {
    const r = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], { answer });
    assert.equal(r.halt?.code, 1);
    assert.match(r.halt.message, /Nothing was sent\.$/);
    assert.doesNotMatch(r.text, /SWEEP GUARD/);
    assert.deepEqual(r.log.map((x) => x[0]), ["open", "read", "close"], "the connection was not closed");
  }
  const leaky = Object.assign(new Error(`connect ECONNREFUSED db.invalid:5432 user postgres password ${PW}`), { code: "ECONNREFUSED" });
  const r = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], { answer: leaky });
  assert.equal(r.halt?.code, 1);
  assert.equal(r.halt.message, "the sweep heartbeat read failed: Error ECONNREFUSED. Nothing was sent.");
  const r2 = await fallback([...SLUG, ...SCOPE, OWNER_FLAG], {
    openHeartbeat: async () => {
      throw Object.assign(new Error("password authentication failed for user x"), { code: "28P01" });
    },
  });
  assert.equal(r2.halt?.message, "the sweep heartbeat read failed: Error 28P01. Nothing was sent.");
});

test("all three passed: the guard line, then the 2026-10-12 program with the owner's word taken off, its own marker folder and counts only", async () => {
  const home = mkdtempSync(join(tmpdir(), "r36-home-"));
  const calls = [];
  const r = await fallback([...SLUG, ...SCOPE, "--max", "200", OWNER_FLAG], {
    home,
    rearm: async (argv, deps) => {
      calls.push({ argv, deps });
      deps.out(`  ${apptId(1)}  starts 2026-11-10T08:00:00.000Z  scheduled  would schedule: 48h email, 24h sms`);
      deps.out(`tenant   osteojp = ${TENANT}`);
      deps.out("ELIGIBLE: 1");
      return { sent: 0 };
    },
  });
  assert.equal(r.halt, null);
  assert.deepEqual(r.result, { sent: 0 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].argv, [...SLUG, ...SCOPE, "--max", "200"]);
  assert.equal(calls[0].deps.home, join(home, R36_HOME_NAME));
  assert.equal(R36_HOME_NAME, ".osteojp-r36-fallback-rearm");
  assert.deepEqual(r.lines.slice(-3), [SWEEP_OK_LINE, "tenant   osteojp = <id>", "ELIGIBLE: 1"]);
  assert.deepEqual(r.log.map((x) => x[0]), ["open", "read", "close"]);
  assert.equal(existsSync(join(home, R36_HOME_NAME)), false, "a dry run made the marker's folder");
});

test("a real confirm makes the marker's own folder, mode 700, before the 2026-10-12 program runs; a sink confirm does not", async () => {
  const home = mkdtempSync(join(tmpdir(), "r36-home-"));
  let seen = null;
  const confirm = [...SLUG, ...SCOPE, OWNER_FLAG, "--confirm", "--expect", "1", "--fix-deployed-sha", SHA_OK, "--i-checked-inngest-settings"];
  const r = await fallback(confirm, {
    home,
    rearm: async (argv, deps) => {
      seen = existsSync(deps.home) && statSync(deps.home).isDirectory() ? statSync(deps.home).mode & 0o777 : null;
      return { sent: 0 };
    },
  });
  assert.equal(r.halt, null);
  assert.equal(seen, 0o700);
  const home2 = mkdtempSync(join(tmpdir(), "r36-home-"));
  await fallback([...confirm.filter((x) => x !== "--fix-deployed-sha" && x !== SHA_OK), "--sink-file", join(home2, "sink.jsonl")], {
    home: home2,
    rearm: async () => ({ sent: 0 }),
  });
  assert.equal(existsSync(join(home2, R36_HOME_NAME)), false);
});

/* ---- counts only ---------------------------------------------------------------------------- */

test("countsOnly drops the lines that name one appointment, and every uuid left reads <id>", () => {
  const id = apptId(7);
  assert.equal(countsOnly(`  ${id}  starts 2026-11-10T08:00:00.000Z  confirmed  would schedule: 24h sms`), null);
  assert.equal(countsOnly(`  sent ${id}  starts 2026-11-10T08:00:00.000Z  scheduled`), null);
  assert.equal(countsOnly(`  skip ${id}  starts 2026-11-10T08:00:00.000Z  changed since the read (moved)`), null);
  assert.equal(countsOnly("the first 20 eligible, in the order they would be sent:"), "the eligible appointments are not listed: this operation prints counts only");
  assert.equal(countsOnly("ELIGIBLE: 12"), "ELIGIBLE: 12");
  assert.equal(countsOnly(`tenant   osteojp = ${TENANT}`), "tenant   osteojp = <id>");
  assert.equal(redact(`stopped at ${id}: HTTP 500 and ${id.toUpperCase()}`), "stopped at <id>: HTTP 500 and <id>");
  assert.equal(countsOnly("  by status: scheduled=1 confirmed=0"), "  by status: scheduled=1 confirmed=0");
});

test("a whole sitting through the REAL run(): no uuid on any line, and every line the blocks look for is there", async () => {
  const { steps, events, home } = await wholeSitting();
  for (const [name, lines] of Object.entries(steps)) {
    for (const l of lines) assert.doesNotMatch(l, UUID, `${name}: ${l}`);
    assert.ok(lines.includes(SWEEP_OK_LINE), `${name}: no guard line`);
    assert.ok(lines.includes("target   NOT production (a strict local database)"), name);
  }
  const has = (name, line) => assert.ok(steps[name].includes(line), `${name} lacks: ${line}\n${steps[name].join("\n")}`);
  const like = (name, re) => assert.ok(steps[name].some((l) => re.test(l)), `${name} lacks ${re}\n${steps[name].join("\n")}`);
  for (const name of ["dryA", "canaryDry", "restDry", "closing"]) {
    has(name, "mode     DRY RUN - nothing is sent");
    has(name, "G1 UNDER THE LIMIT OF 20000: yes");
    has(name, "the eligible appointments are not listed: this operation prints counts only");
    like(name, /^G4 NEXT 48 HOURS, NOT RE-ARMED: [0-9]+ /);
    like(name, /^held back: starts more than --max-days-ahead 28 days after the read: [0-9]+$/);
  }
  for (const name of ["dryA", "canaryDry"]) {
    has(name, "skipped: already sent by an earlier run (marker): 0");
    has(name, "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 0; handed to a provider: 0; not checkable: 0; expected 0)");
  }
  has("dryA", "skipped: attempted by an earlier run, outcome unknown (marker): 0");
  has("dryA", "ELIGIBLE: 12");
  has("canaryDry", "ELIGIBLE: 12");
  like("canaryDry", /^THIS RUN: 5 of 12 /);
  like("canarySend", /^SENT: 5 of 5 {2}/);
  has("canarySend", "G4 ATTEMPTED EQUALS SENT: yes (5 requests started, 5 sent)");
  has("canarySend", "G3 AFTER THIS RUN: 0  (appointments checked: 5; handed to a provider: 0; expected 0)");
  has("restDry", "ELIGIBLE: 7");
  has("restDry", "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 5; handed to a provider: 0; not checkable: 0; expected 0)");
  like("restSend", /^SENT: 7 of 7 {2}/);
  like("restSend", /^G4 ATTEMPTED EQUALS SENT: yes \(/);
  like("restSend", /^G3 AFTER THIS RUN: 0 {2}\(appointments checked: [0-9]+; handed to a provider: 0; expected 0\)$/);
  has("closing", "ELIGIBLE: 0");
  has("closing", "G3 LEDGER ROWS FOR APPOINTMENTS THIS OPERATION SENT, INSIDE THE MARGIN OF THEIR RUN: 0  (appointments checked: 12; handed to a provider: 0; not checkable: 0; expected 0)");
  // One event per appointment, with no id of its own, never a confirmation.
  assert.equal(events.length, 12);
  assert.equal(new Set(events.map((e) => e.data.appointmentId)).size, 12);
  for (const e of events) {
    assert.deepEqual(Object.keys(e).sort(), ["data", "name"]);
    assert.equal(e.data.confirmationEligible, false);
  }
  // A sink run keeps its marker beside the sink, and nothing was written in the home folder.
  assert.equal(existsSync(join(home, R36_HOME_NAME)), false);
});

test("the event is the 2026-10-12 program's own, with no id: the scheduler gives every send a fresh one", () => {
  const e = buildEvent({ id: apptId(1), tenantId: TENANT, startsAt: "2026-11-10T08:00:00.000Z" });
  assert.equal("id" in e, false);
  assert.match(SRC, /from "\.\/inc-1007-rearm-reminders-emit\.mjs";/);
  assert.doesNotMatch(SRC, /\bfetch\(|sendToInngest|inn\.gs/, "this file sends on its own");
});

/* ---- the heartbeat read, as text ------------------------------------------------------------ */

test("the heartbeat read is one tenant, read only, counts and a mode word, of the sweep's own table", () => {
  const sql = HEARTBEAT_READ.replace(/\s+/g, " ").trim();
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|call|set|lock)\b/i);
  assert.deepEqual([...new Set(sql.match(/\$\d/g))], ["$1"]);
  assert.deepEqual([...new Set([...sql.matchAll(/\bfrom (\w+)/gi)].map((m) => m[1]))].sort(), ["k", "reminder_sweep_passes", "tenants"]);
  assert.match(sql, /where t\.slug = \$1/);
  for (const col of ["tenants", "latest_mode", "latest_age_s", "shadow_last_3h", "not_shadow_last_7d"]) assert.match(sql, new RegExp(` as ${col}\\b`));
  assert.match(sql, /p\.mode <> 'shadow' and p\.created_at >= now\(\) - interval '7 days'/);
  assert.match(sql, /order by p\.created_at desc, p\.id desc limit 1/);
  assert.match(SRC, /sql\.begin\("read only", \(tx\) => tx\.unsafe\(HEARTBEAT_READ, \[tenantSlug\]\)\)/);
});

test("the table, its columns and its two mode words are the ones 0106, schema.ts and the sweep carry", () => {
  const mig = read("packages/db/migrations/0106_reminder_claims.sql");
  assert.match(mig, /CREATE TABLE public\.reminder_sweep_passes \(/);
  assert.match(mig, /mode\s+text NOT NULL\s+CONSTRAINT reminder_sweep_passes_mode_check CHECK \(mode IN \('shadow', 'send'\)\)/);
  const schema = read("packages/db/src/schema.ts");
  assert.match(schema, /export const reminderSweepPasses = pgTable\("reminder_sweep_passes", \{/);
  assert.match(schema, /mode: text\("mode"\)\.notNull\(\)/);
  assert.match(schema, /createdAt: timestamp\("created_at", \{ withTimezone: true \}\)\.notNull\(\)\.defaultNow\(\),\n\}\);\n/);
  assert.match(read("apps/web/lib/reminders/sweep.ts"), /export const SWEEP_PASS_MODE = "shadow";/);
  assert.match(read("apps/web/lib/reminders/sweep-send.ts"), /export const SWEEP_SEND_PASS_MODE = "send";/);
  assert.match(read("apps/web/lib/reminders/inngest/sweep.ts"), /if \(sweepSends\(\)\) \{\n\s+return runReminderSweepSend\(/);
});

/* ---- the command line ----------------------------------------------------------------------- */

function cli(args, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "r36-cli-"));
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH, HOME: home, ...env }, encoding: "utf8", timeout: 15_000 });
  assert.equal(r.signal, null, `the program did not exit by itself: ${r.stderr}`);
  return { ...r, all: r.stdout + r.stderr, home };
}

test("the command line: exit 2 on a bad invocation, exit 1 on a refusal, and no value of the environment is ever printed", () => {
  assert.equal(cli([]).status, 2);
  const marker = "XYZZY-value-of-the-switch";
  const r1 = cli([...SLUG, ...SCOPE], { REMINDERS_SWEEP_MODE: marker, DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r1.status, 1);
  assert.match(r1.all, /SET, it reads as shadow/);
  assert.match(r1.all, /^FAILED: the owner has not said/m);
  const r2 = cli([...SLUG, ...SCOPE, OWNER_FLAG], { REMINDERS_SWEEP_MODE: "send", DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r2.status, 1);
  assert.match(r2.all, /^FAILED: the sweep's send switch reads send/m);
  const r3 = cli([...SLUG, ...SCOPE, OWNER_FLAG], { DATABASE_URL_DIRECT: OTHER_URL });
  assert.equal(r3.status, 1);
  for (const r of [r1, r2, r3]) {
    assert.ok(!r.all.includes(marker), "the switch's value was printed");
    assert.ok(!r.all.includes(PW), "the password was printed");
    assert.ok(!r.all.includes("127.0.0.1") && !r.all.includes("db.invalid"), "a host was printed");
    assert.equal(existsSync(join(r.home, R36_HOME_NAME)), false);
    assert.equal(existsSync(join(r.home, ".osteojp-inc1007-rearm.json")), false);
  }
});

test("the 2026-10-12 program is imported, never edited: this file names it and adds no sender of its own", () => {
  assert.match(SRC, /run as runRearm,/);
  assert.match(SRC, /parseArgs as parseRearmArgs,/);
  assert.doesNotMatch(SRC, /writeFileSync|appendFileSync|unlinkSync|renameSync/, "this file writes a file of its own");
  for (const f of [SCRIPT, join(ROOT, "scripts/r36-fallback-rearm-emit.test.mjs")]) assert.ok(!readFileSync(f, "utf8").includes(String.fromCharCode(0x2014)), `${f} carries an em dash`);
});
