// R36: a whole sitting of packages/db/scripts/r36-fallback-rearm-emit.mjs, run in this process
// through the REAL run() of the 2026-10-12 program, with a fake database and a sink file.
// Shared by its two test files: scripts/r36-fallback-rearm-emit.test.mjs reads every line it
// prints, and scripts/r36-fallback-rearm-20261104.test.mjs feeds those same lines to the
// document's blocks as what the program prints, so the blocks are run against the program's
// real output and not against a copy written by hand.
//
// Nothing here opens a connection or a socket: the reader, the heartbeat read and the sleep are
// replaced, and every event goes to a local file. The hosts are the loopback only.

import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Halt, run as realRearm } from "../packages/db/scripts/inc-1007-rearm-reminders-emit.mjs";
import { OWNER_FLAG, runFallback } from "../packages/db/scripts/r36-fallback-rearm-emit.mjs";

/** A self-declared fixture password. Never a credential. */
export const SITTING_URL = "postgresql://postgres:s3cr3t-do-not-print@127.0.0.1:1/postgres";
export const SITTING_SHA = "abcdef0123abcdef0123abcdef0123abcdef0123";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const SITTING_T0 = Date.parse("2026-11-04T21:30:00.000Z");
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const apptId = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb${String(n).padStart(4, "0")}`;

/** A row as the 2026-10-12 program's database read returns it: 4 to 15 days ahead, saved 40 days ago. */
const dbRow = (n) => ({
  id: apptId(n),
  tenant_id: TENANT,
  starts_at: new Date(SITTING_T0 + (3 + n) * DAY + 10 * HOUR),
  status: n % 3 === 0 ? "confirmed" : "scheduled",
  unaccepted_request: false,
  last_emit_at: new Date(SITTING_T0 - 40 * DAY),
  emit_events: 1,
  t0: new Date(SITTING_T0),
});

/** A fake database for the REAL run(): the rows, an unchanged re-read, and a ledger that holds nothing. */
function fakeReader(rows) {
  return async () => ({
    selection: async () => ({ tenantId: TENANT, t0: new Date(SITTING_T0), rows }),
    recheck: async (_t, id) => {
      const r = rows.find((x) => x.id === id);
      return { starts_at: r.starts_at, status: r.status, patient_deleted: false, unaccepted_request: false, last_emit_at: r.last_emit_at };
    },
    ledger: async () => ({ n: 0, handedOver: 0 }),
    close: async () => {},
  });
}

/** Production's heartbeats, the sweep in shadow and running. */
const shadowHeartbeat = async () => ({
  read: async () => ({ tenants: 1, latestMode: "shadow", latestAgeS: 600, shadowLast3h: 12, notShadowLast7d: 0 }),
  close: async () => {},
});

/**
 * The sitting the document runs: BEFORE YOU START's dry run, the canary's dry run and send, THE
 * REST's dry run and send, and the closing dry run, over twelve appointments. Returns each step's
 * printed lines, the events the sink received, the home folder and the sink.
 */
export async function wholeSitting() {
  const dir = mkdtempSync(join(tmpdir(), "r36-sitting-"));
  const home = join(dir, "home");
  mkdirSync(home);
  const sink = join(dir, "sink.jsonl");
  const rows = Array.from({ length: 12 }, (_, i) => dbRow(i + 1));
  const step = async (extra) => {
    const lines = [];
    try {
      await runFallback(["--tenant-slug", "osteojp", "--max-days-ahead", "28", OWNER_FLAG, "--sink-file", sink, ...extra], {
        env: { DATABASE_URL_DIRECT: SITTING_URL },
        out: (l) => lines.push(l),
        home,
        openHeartbeat: shadowHeartbeat,
        rearm: realRearm,
        openReader: fakeReader(rows),
        sleep: async () => {},
      });
    } catch (e) {
      if (e instanceof Halt) throw new Error(`a step of the sitting halted: ${e.message}\n${lines.join("\n")}`);
      throw e;
    }
    return lines;
  };
  const confirm = ["--confirm", "--fix-deployed-sha", SITTING_SHA, "--i-checked-inngest-settings"];
  const steps = {};
  steps.dryA = await step(["--max", "200"]);
  steps.canaryDry = await step(["--min-days-ahead", "3", "--max", "5"]);
  steps.canarySend = await step(["--min-days-ahead", "3", "--max", "5", ...confirm, "--expect", "12"]);
  steps.restDry = await step(["--max", "200"]);
  steps.restSend = await step(["--max", "200", ...confirm, "--expect", "7"]);
  steps.closing = await step(["--max", "200"]);
  const events = readFileSync(sink, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { steps, events, home, sink };
}
