// obs-05-backfill-emit.test.mjs - the reminder exposure backfill's refusals, its
// contract with the reminder pipeline it feeds, and its agreement with the
// production read that selects for it.
//
// No database is needed and none is contacted: every refusal below fires before
// the script opens a connection, which is itself one of the properties tested.
// The contract tests read the APP's source, so a renamed event, a changed status
// set, a moved offset or a renamed audit action reddens this file instead of
// producing a backfill that emits into nothing or selects the wrong rows.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "packages/db/scripts/obs-05-backfill-emit.mjs");
const READ = join(ROOT, "scripts/reminder-exposure-read-2026-09-11.sql");
const SRC = readFileSync(SCRIPT, "utf8");
const READ_SRC = readFileSync(READ, "utf8");

const PROD_URL = "postgresql://postgres.dfotoodqvmjhbdcxyaxf:x@db.invalid:5432/postgres";
const LANE_URL = "postgresql://postgres:postgres@127.0.0.1:1/postgres";
const OK_ARGS = ["--tenant-slug", "osteojp", "--classes", "batch"];

function run(args, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "obs05-"));
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, HOME: home, ...env },
    encoding: "utf8",
  });
}

/** Every block between the classification markers, in file order. */
function classifications(text) {
  const re = /-- >>> EXPOSURE CLASSIFICATION\n([\s\S]*?)-- <<< EXPOSURE CLASSIFICATION/g;
  return [...text.matchAll(re)].map((m) => m[1]);
}

/* ---- invocation ------------------------------------------------------------ */

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

test("--classes is required: nothing is selected by default", () => {
  const r = run(["--tenant-slug", "osteojp"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--classes is required/);
});

test("a class that is not an EXPOSED path is refused, staff_drawer included", () => {
  for (const c of ["staff_drawer", "portal_awaiting_acceptance", "portal_confirmed_unknown_path", "bogus"]) {
    const r = run(["--tenant-slug", "osteojp", "--classes", `batch,${c}`]);
    assert.equal(r.status, 2, c);
    assert.match(r.stderr, /unknown class/, c);
  }
});

test("--created-before is retired, and says why instead of being silently ignored", () => {
  const r = run([...OK_ARGS, "--created-before", "2026-09-10T22:45:15Z"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--created-before is retired/);
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

test("an unreadable marker is refused, never treated as an empty history", () => {
  const home = mkdtempSync(join(tmpdir(), "obs05-garbled-"));
  writeFileSync(join(home, ".osteojp-obs05-backfill.json"), "not json\n");
  const r = spawnSync(process.execPath, [SCRIPT, ...OK_ARGS], {
    env: { PATH: process.env.PATH, HOME: home, DATABASE_URL_DIRECT: LANE_URL },
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is not JSON/);
});

test("the claim is written before the first event is sent", () => {
  const claim = SRC.indexOf('state: "sending"');
  const firstSend = SRC.indexOf("await fetch(");
  assert.ok(claim > 0 && firstSend > 0 && claim < firstSend, "the marker claim no longer precedes the first send");
});

test("the dry run reads the send history too, so its count is the count --confirm finds", () => {
  const history = SRC.indexOf("const history = readHistory(marker)");
  const confirmOnly = SRC.indexOf("if (!args.confirm) {");
  assert.ok(history > 0 && confirmOnly > history, "the history is no longer read before the dry-run exit");
});

test("the connection string is never echoed", () => {
  const r = run(OK_ARGS, { DATABASE_URL_DIRECT: "not a url at all" });
  assert.equal(r.status, 2);
  assert.doesNotMatch(r.stdout + r.stderr, /not a url at all/);
});

/* ---- agreement with the production read ------------------------------------ */

test("the classification is byte-identical in the read (both copies) and the script", () => {
  const read = classifications(READ_SRC);
  const script = classifications(SRC);
  assert.equal(read.length, 2, "the read should carry the classification twice (summary and row list)");
  assert.equal(script.length, 1, "the script should carry the classification once");
  assert.equal(read[0], read[1], "the read's two copies have drifted apart");
  assert.equal(script[0], read[0], "the script's copy has drifted from the read's");
});

test("every class the script accepts is one the classification marks EXPOSED, and no other", () => {
  const block = classifications(SRC)[0];
  const exposedList = block.match(/s\.path in \(([^)]+)\)/)?.[1];
  assert.ok(exposedList, "the exposed list was not found in the classification");
  const fromSql = [...exposedList.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const fromScript = SRC.match(/const EXPOSED_CLASSES = \[([^\]]+)\]/)?.[1];
  assert.ok(fromScript);
  assert.deepEqual([...fromScript.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort(), fromSql);
});

/* ---- the contract with the pipeline it feeds ------------------------------ */

test("the event name is the app's EVENT_APPOINTMENT_SCHEDULED", () => {
  const client = readFileSync(join(ROOT, "apps/web/lib/reminders/inngest/client.ts"), "utf8");
  const appName = client.match(/EVENT_APPOINTMENT_SCHEDULED = "([^"]+)"/)?.[1];
  assert.ok(appName, "EVENT_APPOINTMENT_SCHEDULED not found in client.ts");
  assert.match(SRC, new RegExp(`const EVENT_NAME = "${appName.replace("/", "\\/")}"`));
});

test("the selected statuses are exactly the dispatcher's REMINDABLE_STATUSES", () => {
  const dispatch = readFileSync(join(ROOT, "apps/web/lib/reminders/dispatch.ts"), "utf8");
  const app = dispatch.match(/REMINDABLE_STATUSES = new Set\(\[([^\]]+)\]\)/)?.[1];
  const mine = classifications(SRC)[0].match(/a\.status::text in \(([^)]+)\)/)?.[1];
  assert.ok(app && mine);
  const norm = (s) => [...s.matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]).sort().join(",");
  assert.equal(norm(mine), norm(app));
});

test("the pedido origin is exactly the dispatcher's PEDIDO_ORIGINS", () => {
  const dispatch = readFileSync(join(ROOT, "apps/web/lib/reminders/dispatch.ts"), "utf8");
  const app = dispatch.match(/PEDIDO_ORIGINS = new Set\(\[([^\]]+)\]\)/)?.[1];
  assert.ok(app);
  const origins = [...app.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(origins, ["patient_portal"], "PEDIDO_ORIGINS changed; the classification names one origin");
  assert.match(classifications(SRC)[0], /c\.origin = 'patient_portal' and c\.status = 'scheduled'/);
});

test("every audit action and metadata key the classification reads is still written by the app", () => {
  const actions = readFileSync(join(ROOT, "apps/web/lib/scheduling/actions.ts"), "utf8");
  const store = readFileSync(join(ROOT, "apps/web/lib/reminders/inbound-store.ts"), "utf8");
  const reply = readFileSync(join(ROOT, "apps/web/lib/reminders/inbound-reply.ts"), "utf8");
  const pairs = [
    [actions, 'action: "appointment.create"'],
    [actions, 'action: "appointment.reschedule"'],
    [actions, 'action: "appointment.update"'],
    [actions, 'via: "portal_request_confirm"'],
    [actions, "toStatus: patch.status"],
    [store, 'action: "appointment.sms_reply_reviewed"'],
    [store, "resolution: row.resolution"],
    [store, "applied: row.applied"],
    [reply, 'action: "appointment.patient_sms_reply"'],
    [reply, "outcome: row.outcome"],
  ];
  for (const [src, needle] of pairs) assert.ok(src.includes(needle), `the app no longer writes ${needle}`);
});

test("the ledger template ids the classification reads are the dispatcher's", () => {
  const dir = join(ROOT, "apps/web/lib/reminders");
  const all = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  for (const id of ["reminder.48h.email", "reminder.24h.sms"]) {
    assert.ok(all.includes(id), `no reminders source names the template ${id}`);
    assert.ok(classifications(SRC)[0].includes(`'${id}'`), `the classification no longer reads ${id}`);
  }
});

test("the preview offsets are the app's REMINDER_OFFSETS", () => {
  const offsets = readFileSync(join(ROOT, "apps/web/lib/reminders/offsets.ts"), "utf8");
  for (const [id, mins, ch] of [["48h", "48 \\* 60", "email"], ["24h", "24 \\* 60", "sms"]]) {
    const re = new RegExp(`id: "${id}", minutesBefore: ${mins}, channel: "${ch}"`);
    assert.match(offsets, re, `offsets.ts no longer says ${id}`);
    assert.match(SRC, re, `the script no longer says ${id}`);
  }
});

test("every event is confirmationEligible FALSE and carries the SAME row-derived event id as before", () => {
  assert.match(SRC, /confirmationEligible: false/);
  assert.doesNotMatch(SRC, /confirmationEligible: true/);
  assert.match(SRC, /id: `obs05-backfill:\$\{r\.id\}:\$\{startsAt\}`/);
});

test("the read is single-tenant and read-only, and never selects a row a reminder already touched", () => {
  assert.match(SRC, /sql\.begin\("read only"/);
  assert.match(SRC, /with k as \(select \$1::uuid as tenant_id, now\(\) as t0\)/);
  assert.match(SRC, /where e\.exposed\s+and not e\.any_reminder_row\s+and e\.starts_at > now\(\) \+ interval '24 hours'/);
});
