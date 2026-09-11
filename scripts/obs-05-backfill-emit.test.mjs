// obs-05-backfill-emit.test.mjs - the OBS-05 backfill's refusals, and its contract
// with the reminder pipeline it feeds.
//
// No database is needed and none is contacted: every refusal below fires before
// the script opens a connection, which is itself one of the properties tested.
// The contract tests read the APP's source, so a renamed event, a changed status
// set or a moved offset reddens this file instead of producing a backfill that
// emits into nothing.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/obs-05-backfill-emit.mjs");
const SRC = readFileSync(SCRIPT, "utf8");

const PROD_URL = "postgresql://postgres.dfotoodqvmjhbdcxyaxf:x@db.invalid:5432/postgres";
const LANE_URL = "postgresql://postgres:postgres@127.0.0.1:1/postgres";
const OK_ARGS = ["--tenant-slug", "osteojp", "--created-before", "2026-09-10T22:45:15Z"];

function run(args, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "obs05-"));
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, HOME: home, ...env },
    encoding: "utf8",
  });
}

test("no arguments is a bad invocation (exit 2), not a failure", () => {
  const r = run([]);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /--tenant-slug is required/);
});

test("an unknown flag is refused rather than ignored", () => {
  const r = run([...OK_ARGS, "--apply"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown argument/);
});

test("--created-before must be a UTC instant ending in Z", () => {
  const r = run(["--tenant-slug", "osteojp", "--created-before", "2026-09-10 22:45"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ending in Z/);
});

test("--confirm without --expect is refused: the count is carried from the dry run", () => {
  const r = run([...OK_ARGS, "--confirm"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--confirm needs --expect/);
});

test("--sink must be a LOCAL origin", () => {
  const r = run([...OK_ARGS, "--sink", "https://inn.gs"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /LOCAL http origin/);
});

test("with no connection string it refuses before doing anything", () => {
  const r = run(OK_ARGS);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /neither DATABASE_URL_DIRECT nor DATABASE_URL/);
});

test("a rehearsal sink is refused when the target is PRODUCTION", () => {
  const r = run([...OK_ARGS, "--sink", "http://127.0.0.1:9"], { DATABASE_URL_DIRECT: PROD_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--sink is for rehearsal and the target is PRODUCTION/);
});

test("--confirm to Inngest Cloud is refused when the target is NOT production", () => {
  const r = run([...OK_ARGS, "--confirm", "--expect", "1"], { DATABASE_URL_DIRECT: LANE_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /target is NOT production/);
});

test("--confirm without INNGEST_EVENT_KEY is refused, and the key's name is the only thing printed", () => {
  const r = run([...OK_ARGS, "--confirm", "--expect", "1"], { DATABASE_URL_DIRECT: PROD_URL });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /INNGEST_EVENT_KEY is not set/);
});

test("a second --confirm inside 25 hours is refused by the marker", () => {
  const home = mkdtempSync(join(tmpdir(), "obs05-marker-"));
  writeFileSync(join(home, ".osteojp-obs05-backfill.json"), "{}\n");
  const r = spawnSync(process.execPath, [SCRIPT, ...OK_ARGS, "--confirm", "--expect", "1"], {
    env: { PATH: process.env.PATH, HOME: home, DATABASE_URL_DIRECT: PROD_URL, INNGEST_EVENT_KEY: "k" },
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a previous --confirm ran/);
});

test("--confirm refuses BEFORE connecting when the marker cannot be written", () => {
  // Found in rehearsal: with a HOME that did not exist, the script sent every event,
  // crashed writing the marker, and the next run sent them all again.
  const r = spawnSync(process.execPath, [SCRIPT, ...OK_ARGS, "--confirm", "--expect", "1"], {
    env: {
      PATH: process.env.PATH,
      HOME: join(tmpdir(), "obs05-no-such-dir", "nested"),
      DATABASE_URL_DIRECT: PROD_URL,
      INNGEST_EVENT_KEY: "k",
    },
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot write the marker/);
});

test("the claim is written before the first event is sent", () => {
  const claim = SRC.indexOf('state: "sending"');
  const firstSend = SRC.indexOf("await fetch(");
  assert.ok(claim > 0 && firstSend > 0 && claim < firstSend, "the marker claim no longer precedes the first send");
});

test("the connection string is never echoed", () => {
  const r = run(OK_ARGS, { DATABASE_URL_DIRECT: "not a url at all" });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /not a url at all/);
});

/* ---- the contract with the pipeline it feeds ---------------------------- */

test("the event name is the app's EVENT_APPOINTMENT_SCHEDULED", () => {
  const client = readFileSync(join(ROOT, "apps/web/lib/reminders/inngest/client.ts"), "utf8");
  const appName = client.match(/EVENT_APPOINTMENT_SCHEDULED = "([^"]+)"/)?.[1];
  assert.ok(appName, "EVENT_APPOINTMENT_SCHEDULED not found in client.ts");
  assert.match(SRC, new RegExp(`const EVENT_NAME = "${appName.replace("/", "\\/")}"`));
});

test("the selected statuses are exactly the dispatcher's REMINDABLE_STATUSES", () => {
  const dispatch = readFileSync(join(ROOT, "apps/web/lib/reminders/dispatch.ts"), "utf8");
  const app = dispatch.match(/REMINDABLE_STATUSES = new Set\(\[([^\]]+)\]\)/)?.[1];
  const mine = SRC.match(/const REMINDABLE = \[([^\]]+)\]/)?.[1];
  assert.ok(app && mine);
  const norm = (s) => s.split(",").map((x) => x.trim()).sort().join(",");
  assert.equal(norm(mine), norm(app));
});

test("the preview offsets are the app's REMINDER_OFFSETS", () => {
  const offsets = readFileSync(join(ROOT, "apps/web/lib/reminders/offsets.ts"), "utf8");
  for (const [id, mins, ch] of [["48h", "48 \\* 60", "email"], ["24h", "24 \\* 60", "sms"]]) {
    const re = new RegExp(`id: "${id}", minutesBefore: ${mins}, channel: "${ch}"`);
    assert.match(offsets, re, `offsets.ts no longer says ${id}`);
    assert.match(SRC, re, `the script no longer says ${id}`);
  }
});

test("every event is confirmationEligible FALSE and carries a row-derived event id", () => {
  assert.match(SRC, /confirmationEligible: false/);
  assert.doesNotMatch(SRC, /confirmationEligible: true/);
  assert.match(SRC, /id: `obs05-backfill:\$\{r\.id\}:\$\{startsAt\}`/);
});

test("the read is single-tenant and read-only", () => {
  assert.match(SRC, /sql\.begin\("read only"/);
  assert.match(SRC, /where a\.tenant_id = \$\{t\[0\]\.id\}/);
});
