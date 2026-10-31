#!/usr/bin/env node
// ===================================================================
// R36: THE FALLBACK RE-ARM OF THE REMINDERS, FOR THE NIGHT OF WEDNESDAY
// 2026-11-04, AND ONLY IF THE REMINDER SWEEP IS STILL IN SHADOW.
// RUN BY GREEN ON THE OWNER'S DISPATCH NAMING THIS FILE. THE BUILD LANE
// NEVER RUNS IT AGAINST PRODUCTION.
// ===================================================================
// The document is docs/data-op-r36-fallback-rearm-20261104.md. It says what
// breaks if neither the sweep's switch nor this re-arm happens, and why.
//
// ===================================================================
// IT IS THE RE-ARM OF 2026-10-12, UNCHANGED, BEHIND THREE THINGS
// ===================================================================
// The sending program is packages/db/scripts/inc-1007-rearm-reminders-emit.mjs,
// the script that ran clean on production on 2026-10-12 (532 appointments, in
// five runs). This file does NOT copy it and does NOT edit it: it imports its
// `run()` and calls it with the same arguments a person would type, so the
// selection, the margin around a reminder mark, the re-read before each send,
// the marker, the lock, the event with no id of its own, and the gate lines G1,
// G3 and G4 are exactly the reviewed ones. What this file adds:
//
//   1. THE SWEEP REFUSAL. Before that run reads anything, three checks, and a
//      refusal on any one of them:
//        a. the sweep's send switch in THIS shell's environment, read exactly
//           as apps/web/lib/reminders/sweep-mode.ts reads it (the value is
//           compared, never printed: the line says SET or UNSET and the word
//           it reads as, `shadow` or `send`);
//        b. the owner's word, given in the sitting, that the switch is not
//           `send` in production (OWNER_FLAG below). This shell is not
//           production: the switch the deployed app reads lives in Vercel;
//        c. production's own record: the sweep's heartbeats in
//           `reminder_sweep_passes` (migration 0106). A pass writes `send` on
//           its heartbeat only while the switch is on. The newest heartbeat
//           must be `shadow` and under HEARTBEAT_FRESH_S old, and no heartbeat
//           of the last 7 days may be anything but `shadow`. Counts and the
//           mode word only, in a READ ONLY transaction.
//      WHY: with the sweep sending, the sleeping reminder jobs are its
//      backstop and the sweep decides what is due from the AUDIT TRAIL. An
//      event from this program writes no audit row, so the sweep cannot see
//      the re-plan it causes (PR #1678, reminder-population.ts, R33): the
//      owner-run re-arm must not run while the sweep is in send mode without a
//      fresh ruling.
//   2. COUNTS ONLY. Every line the run prints goes through `countsOnly()`:
//      the lines that list one appointment (the dry run's first 20, and one
//      `sent` or `skip` line per row of a confirm) are dropped, and any uuid
//      left on a kept line (the tenant's, a stopped row's) reads `<id>`. The
//      marker on disk still holds the ids, as on 2026-10-12: it is the record
//      of what was sent.
//   3. ITS OWN MARKER, AND A CEILING. The run is given its own folder,
//      ~/.osteojp-r36-fallback-rearm, so its marker and its lock never touch
//      the marker of 2026-10-12, which is that sitting's record. And it
//      refuses a scope beyond HORIZON_DAYS (28) or a run larger than
//      MAX_PER_RUN (200), in every mode.
//
// USAGE, from the repository root with the production environment loaded:
//   node packages/db/scripts/r36-fallback-rearm-emit.mjs --tenant-slug osteojp
//        --max-days-ahead 28 --max 200 --owner-says-sweep-is-not-sending
//     DRY RUN. Reads, prints counts, sends nothing.
//   ... plus --confirm --expect <N> --fix-deployed-sha <40 hex>
//        --i-checked-inngest-settings
//     Sends, exactly as the script of 2026-10-12 does with those arguments.
//   --min-days-ahead 3 --max 5 makes the canary, as on 2026-10-12.
// Every other argument is the 2026-10-12 script's own, and it judges them.
//
// It prints counts, instants of reads, verdicts and fixed sentences. NEVER a
// patient's name, phone or email, never an appointment id or the tenant's id,
// never the connection string or any part of it, never the event key and
// never the value of any environment variable.
//
// EXIT 0 OK, 1 FAILED, 2 BAD_INVOCATION (the repository's tooling convention).

import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Halt,
  USAGE as REARM_USAGE,
  classifyTarget,
  describeError,
  parseArgs as parseRearmArgs,
  run as runRearm,
} from "./inc-1007-rearm-reminders-emit.mjs";

/** The furthest a run of this file reaches, in days after its read. See the document, "The horizon". */
export const HORIZON_DAYS = 28;
/** The largest --max this file lets through. 200 is what step 6 of 2026-10-12 sent with. */
export const MAX_PER_RUN = 200;
/** The owner's word, given in the sitting, that the sweep's switch is not `send` in production. */
export const OWNER_FLAG = "--owner-says-sweep-is-not-sending";
/** The folder of this operation's marker and lock, under the operator's home folder. */
export const R36_HOME_NAME = ".osteojp-r36-fallback-rearm";
/** The newest heartbeat may be at most this old. The last pass of a day is at 21:45 Lisbon. */
export const HEARTBEAT_FRESH_S = 12 * 3600;
/** The bound on the heartbeat read. */
export const HEARTBEAT_BOUND_MS = 10_000;
/** The words the heartbeat table holds (0106: CHECK (mode IN ('shadow', 'send'))). */
export const SHADOW = "shadow";
export const SEND = "send";
/** The line every check of the sweep ends with when all three pass. The document's blocks look for it. */
export const SWEEP_OK_LINE =
  "SWEEP GUARD: the sweep is in shadow by all three checks (this shell's switch, the owner's word, production's heartbeats)";

const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * THE HEARTBEAT READ. One tenant ($1, by slug), five values, nothing else: how
 * many tenants the slug matched, the mode of the newest heartbeat, its age in
 * whole seconds by the database's clock, how many `shadow` heartbeats were
 * written in the last 3 hours (shown, decides nothing), and how many heartbeats
 * of the last 7 days are not `shadow`. No appointment, no patient, no row id.
 */
export const HEARTBEAT_READ = `
with k as (select t.id as tenant_id from tenants t where t.slug = $1)
select (select count(*)::int from k) as tenants,
       (select p.mode from reminder_sweep_passes p join k on k.tenant_id = p.tenant_id
         order by p.created_at desc, p.id desc limit 1) as latest_mode,
       (select floor(extract(epoch from (now() - max(p.created_at))))::int
          from reminder_sweep_passes p join k on k.tenant_id = p.tenant_id) as latest_age_s,
       (select count(*)::int from reminder_sweep_passes p join k on k.tenant_id = p.tenant_id
         where p.mode = 'shadow' and p.created_at >= now() - interval '3 hours') as shadow_last_3h,
       (select count(*)::int from reminder_sweep_passes p join k on k.tenant_id = p.tenant_id
         where p.mode <> 'shadow' and p.created_at >= now() - interval '7 days') as not_shadow_last_7d`;

export const USAGE = `usage:
  node packages/db/scripts/r36-fallback-rearm-emit.mjs --tenant-slug <slug> --max-days-ahead <2 to ${HORIZON_DAYS}>
       ${OWNER_FLAG} [--max <1 to ${MAX_PER_RUN}>] [--min-days-ahead <D>]
       [--confirm --expect <N> --fix-deployed-sha <40 hex> --i-checked-inngest-settings]
  every other argument is the 2026-10-12 script's own:
${REARM_USAGE}`;

function bad(msg) {
  throw new Halt(2, msg);
}

function fail(msg) {
  throw new Halt(1, msg);
}

/**
 * This file's own arguments, read off the line before the 2026-10-12 script
 * reads the rest. PURE. Returns the arguments that script gets (the owner's
 * word taken out) and what this file needs to know. Only this file's bounds
 * are judged here; every other argument is judged by that script.
 */
export function splitArgs(argv) {
  const rearmArgv = [];
  let ownerSays = false;
  for (const a of argv) {
    if (a === OWNER_FLAG) ownerSays = true;
    else rearmArgv.push(a);
  }
  const valueOf = (flag) => {
    const at = rearmArgv.indexOf(flag);
    if (at < 0) return undefined;
    if (rearmArgv.indexOf(flag, at + 1) >= 0) bad(`${flag} is given more than once`);
    const v = rearmArgv[at + 1];
    return v === undefined || v.startsWith("--") ? null : v;
  };
  const tenantSlug = valueOf("--tenant-slug");
  if (typeof tenantSlug !== "string" || !SLUG.test(tenantSlug)) bad("--tenant-slug is required (lowercase slug)");
  const maxDays = valueOf("--max-days-ahead");
  if (maxDays === undefined || maxDays === null) {
    bad(`--max-days-ahead is required in every mode of this file: the scope is ${HORIZON_DAYS} days at most`);
  }
  if (!/^[1-9]\d{0,3}$/.test(maxDays) || Number(maxDays) < 2 || Number(maxDays) > HORIZON_DAYS) {
    bad(`--max-days-ahead must be a whole number from 2 to ${HORIZON_DAYS}`);
  }
  const max = valueOf("--max");
  if (max === null) bad("--max needs a value");
  if (max !== undefined && (!/^[1-9]\d{0,5}$/.test(max) || Number(max) > MAX_PER_RUN)) {
    bad(`--max must be a whole number from 1 to ${MAX_PER_RUN}`);
  }
  const sinkFile = valueOf("--sink-file");
  return {
    rearmArgv,
    ownerSays,
    tenantSlug,
    maxDaysAhead: Number(maxDays),
    confirm: rearmArgv.includes("--confirm"),
    sink: sinkFile !== undefined,
  };
}

/**
 * The sweep's send switch as THIS shell's environment holds it, read the way
 * apps/web/lib/reminders/sweep-mode.ts reads it: exactly `send` is send, and
 * anything else, unset included, is shadow. PURE. It returns whether the name
 * is set and the word it reads as. It never returns the value.
 */
export function sweepSwitchWord(env) {
  const raw = env.REMINDERS_SWEEP_MODE;
  return { set: raw !== undefined, mode: raw === SEND ? SEND : SHADOW };
}

/**
 * The heartbeat read's answer as this file reads it. PURE. Exactly ONE row: a
 * whole number of tenants, a mode that is null or one short lowercase word, an
 * age that is null or a whole number, and two whole counts. Anything else is
 * the error NO_COUNT, never a pass: an answer that did not arrive must not
 * read as "the sweep is in shadow".
 */
export function heartbeatAnswer(rows) {
  const whole = (v) => Number.isInteger(v) && v >= 0;
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const ok =
    row !== null &&
    whole(row.tenants) &&
    (row.latest_mode === null || (typeof row.latest_mode === "string" && /^[a-z]{1,16}$/.test(row.latest_mode))) &&
    (row.latest_age_s === null || whole(row.latest_age_s)) &&
    whole(row.shadow_last_3h) &&
    whole(row.not_shadow_last_7d);
  if (!ok) throw Object.assign(new Error("the heartbeat read returned no count"), { code: "NO_COUNT" });
  return {
    tenants: row.tenants,
    latestMode: row.latest_mode,
    latestAgeS: row.latest_age_s,
    shadowLast3h: row.shadow_last_3h,
    notShadowLast7d: row.not_shadow_last_7d,
  };
}

/**
 * What production's heartbeats say. PURE. Returns the lines to print and, on
 * a refusal, its sentence. The mode word is printed only when it is one the
 * table can hold.
 */
export function heartbeatVerdict(a) {
  const mode = a.latestMode === null ? "none" : a.latestMode === SHADOW || a.latestMode === SEND ? a.latestMode : "unrecognised";
  const age = a.latestAgeS === null ? "no heartbeat at all" : `${Math.floor(a.latestAgeS / 60)} minutes ago`;
  const lines = [
    `sweep    production's heartbeats: newest ${mode}, ${age}; shadow in the last 3 hours: ${a.shadowLast3h}; ` +
      `anything but shadow in the last 7 days: ${a.notShadowLast7d}`,
  ];
  if (a.tenants !== 1) return { ok: false, lines, why: `the tenant slug matched ${a.tenants} tenants, not 1. Refusing.` };
  if (a.latestMode === null || a.latestAgeS === null) {
    return { ok: false, lines, why: "the sweep has written no heartbeat for this tenant, so its mode cannot be read from production. Refusing." };
  }
  if (a.latestAgeS > HEARTBEAT_FRESH_S) {
    return {
      ok: false,
      lines,
      why: `the sweep's newest heartbeat is more than ${HEARTBEAT_FRESH_S / 3600} hours old, so the sweep is not shown to be running, and its mode now cannot be read from production. Refusing.`,
    };
  }
  if (a.latestMode !== SHADOW) {
    return { ok: false, lines, why: `the sweep's newest heartbeat is not shadow (it reads ${mode}): the sweep may be sending. This operation must not run while it is. Refusing.` };
  }
  if (a.notShadowLast7d > 0) {
    return {
      ok: false,
      lines,
      why: `${a.notShadowLast7d} heartbeat(s) of the last 7 days are not shadow: the sweep has sent this week. Running this operation now needs a fresh ruling. Refusing.`,
    };
  }
  return { ok: true, lines, why: null };
}

/** Every uuid in a line reads `<id>`. PURE. */
export function redact(text) {
  return String(text).replace(UUID_ANY, "<id>");
}

/**
 * One line of the run, as this file prints it, or null to drop it. PURE.
 * Dropped: each line that names one appointment. Every other line is kept,
 * with any uuid on it read as `<id>`.
 */
export function countsOnly(line) {
  const s = String(line);
  if (/^ {2}(sent|skip) [0-9a-f]{8}-[0-9a-f-]{27}\b/i.test(s)) return null;
  if (/^ {2}[0-9a-f]{8}-[0-9a-f-]{27} {2}starts /i.test(s)) return null;
  if (/^the first \d+ eligible, in the order they would be sent:$/.test(s)) {
    return "the eligible appointments are not listed: this operation prints counts only";
  }
  return redact(s);
}

/** A promise that loses to a clock. */
function within(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} took longer than ${ms} ms`), { code: "TIMEOUT" })), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** The heartbeat read, READ ONLY, one statement. Lazy on the driver, as the 2026-10-12 script is. */
export async function openHeartbeatReader(raw) {
  const { default: postgres } = await import("postgres");
  const sql = postgres(raw, { max: 1, prepare: false, onnotice: () => {} });
  return {
    async read(tenantSlug) {
      const rows = await sql.begin("read only", (tx) => tx.unsafe(HEARTBEAT_READ, [tenantSlug]));
      return heartbeatAnswer(rows);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * The whole operation. `deps` exists for the test file: `env`, `out`, `home`,
 * `openHeartbeat` and `rearm` replace the process's own and the 2026-10-12
 * script's `run`; `openReader`, `now`, `sleep` and `writeMarker` are handed on
 * to that run. The command line sets none of them.
 */
export async function runFallback(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((line) => console.log(line));
  const home = deps.home ?? homedir();
  const openHeartbeat = deps.openHeartbeat ?? openHeartbeatReader;
  const rearm = deps.rearm ?? runRearm;

  const a = splitArgs(argv);
  // Every argument the 2026-10-12 script takes is judged by it NOW, before
  // anything is read, so a bad invocation never costs a database read.
  parseRearmArgs(a.rearmArgv);
  out(`fallback R36: the re-arm of 2026-10-12, run again behind the sweep refusal; at most ${HORIZON_DAYS} days ahead, counts only`);

  // a. This shell's switch. Compared, never printed.
  const word = sweepSwitchWord(env);
  out(`sweep    the send switch in this shell's environment: ${word.set ? "SET" : "UNSET"}, it reads as ${word.mode}`);
  if (word.mode === SEND) {
    fail("the sweep's send switch reads send in this shell's environment. This operation must not run while the sweep is the sender. Refusing; nothing was read and nothing was sent.");
  }
  // b. The owner's word.
  out(`sweep    the owner's word that the switch is not send in production: ${a.ownerSays ? "given" : "NOT GIVEN"}`);
  if (!a.ownerSays) {
    fail(
      `the owner has not said that the sweep's switch is not send in production (${OWNER_FLAG}). This shell is not ` +
        "production: the switch the deployed application reads is in Vercel. Refusing; nothing was read and nothing was sent.",
    );
  }
  // c. Production's heartbeats. Only the two targets the 2026-10-12 script reads.
  const raw = env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;
  if (!raw) bad("neither DATABASE_URL_DIRECT nor DATABASE_URL is set; source the environment first");
  const target = classifyTarget(raw);
  if (target.kind === "unreadable") bad(`the connection string cannot be used: ${target.why}`);
  if (target.kind !== "production" && target.kind !== "local") {
    fail("this operation reads the exact production target or a strict local database, and nothing else. Refusing; nothing was read and nothing was sent.");
  }
  let answer;
  let reader = null;
  try {
    reader = await openHeartbeat(raw);
    answer = await within(reader.read(a.tenantSlug), HEARTBEAT_BOUND_MS, "the heartbeat read");
  } catch (e) {
    fail(`the sweep heartbeat read failed: ${describeError(e)}. Nothing was sent.`);
  } finally {
    if (reader) {
      try {
        await reader.close();
      } catch {
        // The verdict stands whether or not the connection closed cleanly.
      }
    }
  }
  const verdict = heartbeatVerdict(answer);
  for (const line of verdict.lines) out(line);
  if (!verdict.ok) fail(`${verdict.why} Nothing was sent.`);
  out(SWEEP_OK_LINE);

  // The run of 2026-10-12, with its own marker folder and counts only.
  const r36Home = join(home, R36_HOME_NAME);
  if (a.confirm && !a.sink) {
    try {
      mkdirSync(r36Home, { recursive: true, mode: 0o700 });
    } catch {
      fail("cannot make the folder of this operation's marker. Refusing to send without it.");
    }
  }
  const passed = {
    env,
    home: r36Home,
    out: (line) => {
      const kept = countsOnly(line);
      if (kept !== null) out(kept);
    },
  };
  for (const k of ["openReader", "now", "sleep", "writeMarker"]) if (deps[k] !== undefined) passed[k] = deps[k];
  return rearm(a.rearmArgv, passed);
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    await runFallback(process.argv.slice(2));
  } catch (e) {
    if (e instanceof Halt) {
      console.error(`${e.code === 2 ? "BAD INVOCATION" : "FAILED"}: ${redact(e.message)}`);
      if (e.code === 2) console.error(USAGE);
      process.exit(e.code);
    }
    // The name and the code only: an unexpected error's message is not known to be free of data.
    console.error(`FAILED: unexpected error (${describeError(e)})`);
    process.exit(1);
  }
}
