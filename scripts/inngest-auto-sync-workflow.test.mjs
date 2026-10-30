// R6: THE AUTO-SYNC WORKFLOW, ITS SHAPE AND ITS STEPS.
//
// Two layers, like auto-update-prs-fails-on-404.test.mjs.
//
// THE SHAPE. .github/workflows/inngest-auto-sync.yml runs on EVERY
// deployment_status event (previews of the api and portal projects, inactive
// updates, production). So its concurrency group must sit on the `sync` job,
// which only runs that pass the production `if` reach, and must never cancel a
// sync in progress. A workflow-level group with cancel-in-progress let any
// preview event cancel a running production sync before its `if` was read
// (R4 round 1, BLOCKER). Seeded copies with the old shapes are shown to fail.
//
// THE STEPS. The shipped `run:` blocks of the wait, sync and check steps are
// extracted and run against a fake app on 127.0.0.1 (a child process), never
// the real host: a confirmed sync passes; an HTTP 500, an unconfirmed
// registration, a wrong count and a domain that never serves the commit each
// fail with the reason. The wait's deadline is shortened through the two WAIT_*
// variables, which nothing in the workflow sets.
//
// R27: EXACTLY TWO APPS. The workflow syncs osteojp-reminders and
// osteojp-consultation and nothing else. The shape check reads every step that
// sends a PUT and requires exactly those two serve paths, in that order, each
// sync followed by a check of the same app, and the consultation sync preceded
// by its readiness check; seeded copies with a third app, a missing
// consultation sync and a sync before the readiness check each fail. The
// simulation runs all seven steps against the fake app and records which serve
// paths were PUT: exactly the two on success, and only the reminders one when
// the consultation endpoint is missing, names another app, or counts wrong.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = join(ROOT, ".github/workflows/inngest-auto-sync.yml");
const TEXT = readFileSync(WORKFLOW, "utf8");

/** Every problem with the workflow's shape. Empty means the shape holds. */
function shapeProblems(text) {
  const problems = [];
  if (!/\non:\n  deployment_status:\n/.test(text)) problems.push("not triggered by deployment_status alone");
  if (/^concurrency:/m.test(text)) problems.push("a WORKFLOW-level concurrency group: any deployment_status run can cancel a production sync");
  if (!/\n    concurrency:\n      group: inngest-auto-sync\n      cancel-in-progress: false\n/.test(text)) {
    problems.push("the sync job's concurrency is not group inngest-auto-sync with cancel-in-progress false");
  }
  if (/cancel-in-progress: true/.test(text)) problems.push("something cancels in progress");
  if (!/\npermissions:\n  contents: read\n/.test(text)) problems.push("permissions are not contents: read");
  if (/secrets\./.test(text)) problems.push("the workflow reads a secret");
  if (!/github\.event\.deployment_status\.state == 'success' &&\n\s*startsWith\(github\.event\.deployment\.environment, 'Production'\) &&\n\s*endsWith\(github\.event\.deployment\.environment, 'osteojp-platform'\)/.test(text)) {
    problems.push("the job's if is not production osteojp-platform success");
  }
  const timeout = Number((text.match(/\n    timeout-minutes: (\d+)\n/) ?? [])[1]);
  const deadline = Number((text.match(/WAIT_DEADLINE_SECONDS:-(\d+)/) ?? [])[1]);
  if (!(timeout * 60 > deadline + 120)) problems.push(`timeout-minutes ${timeout} does not leave room after the ${deadline}s wait`);
  return problems;
}

test("the shape holds: job-level concurrency, never cancelling, production only, no secret", () => {
  assert.deepEqual(shapeProblems(TEXT), []);
});

test("SEEDED: a workflow-level concurrency group is caught", () => {
  const seeded = TEXT.replace("\njobs:\n", "\nconcurrency:\n  group: inngest-auto-sync\n  cancel-in-progress: true\n\njobs:\n");
  assert.notEqual(seeded, TEXT);
  const p = shapeProblems(seeded);
  assert.ok(p.some((x) => /WORKFLOW-level/.test(x)), p.join("; "));
});

test("SEEDED: a job-level group that cancels in progress is caught", () => {
  const seeded = TEXT.replace("      cancel-in-progress: false\n", "      cancel-in-progress: true\n");
  assert.notEqual(seeded, TEXT);
  assert.ok(shapeProblems(seeded).length > 0);
});

test("SEEDED: a timeout shorter than the wait is caught", () => {
  const seeded = TEXT.replace("\n    timeout-minutes: 20\n", "\n    timeout-minutes: 10\n");
  assert.notEqual(seeded, TEXT);
  assert.ok(shapeProblems(seeded).some((x) => /timeout-minutes/.test(x)));
});

// ---------------------------------------------------------------------------
// The steps, parsed from the shipped file.
// ---------------------------------------------------------------------------

/** The steps of the sync job, in order: name, literal env, and the `run: |` body. */
function parseSteps(text) {
  const lines = text.split("\n");
  const out = [];
  let cur = null;
  let inEnv = false;
  for (let i = 0; i < lines.length; i++) {
    const n = lines[i].match(/^ {6}- name: (.*)$/);
    if (n) {
      cur = { name: n[1], env: {}, run: null };
      out.push(cur);
      inEnv = false;
      continue;
    }
    if (!cur) continue;
    if (/^ {8}env:\s*$/.test(lines[i])) { inEnv = true; continue; }
    const kv = lines[i].match(/^ {10}([A-Z_]+): (.*)$/);
    if (inEnv && kv) { cur.env[kv[1]] = kv[2]; continue; }
    inEnv = false;
    if (/^ {8}run: \|\s*$/.test(lines[i])) {
      const body = [];
      let k = i + 1;
      for (; k < lines.length; k++) {
        if (lines[k].trim() === "") { body.push(""); continue; }
        if (!lines[k].startsWith(" ".repeat(10))) break;
        body.push(lines[k].slice(10));
      }
      cur.run = body.join("\n").replace(/\n+$/, "\n");
      i = k - 1;
    }
  }
  return out;
}

const REMINDERS = { app: "osteojp-reminders", serve: "/api/inngest", deployed: "/api/inngest/deployed" };
const CONSULTATION = { app: "osteojp-consultation", serve: "/api/inngest/consultation", deployed: "/api/inngest/consultation/deployed" };

/** Every problem with "exactly these two apps". Empty means it holds. */
function appProblems(text) {
  const problems = [];
  const steps = parseSteps(text);
  const code = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const syncs = steps.filter((s) => s.run && /-X PUT/.test(s.run));
  const putCount = (code.match(/-X PUT/g) ?? []).length;
  if (putCount !== syncs.length) problems.push(`${putCount} PUT call(s) but ${syncs.length} sync step(s)`);
  for (const s of syncs) {
    if (!s.run.includes('-X PUT "${APP_ORIGIN}${SERVE_PATH}"')) problems.push(`"${s.name}" does not PUT to \${APP_ORIGIN}\${SERVE_PATH}`);
  }
  const paths = syncs.map((s) => s.env.SERVE_PATH);
  if (JSON.stringify(paths) !== JSON.stringify([REMINDERS.serve, CONSULTATION.serve])) {
    problems.push(`the synced serve paths are ${JSON.stringify(paths)}, not exactly ${REMINDERS.serve} then ${CONSULTATION.serve}`);
  }
  if (new Set(syncs.map((s) => s.run)).size > 1) problems.push("the sync steps do not run the same commands");
  const checks = steps.filter((s) => s.name.startsWith("Check the live function count"));
  const checked = checks.map((s) => `${s.env.APP_ID} ${s.env.DEPLOYED_PATH}`);
  if (JSON.stringify(checked) !== JSON.stringify([`${REMINDERS.app} ${REMINDERS.deployed}`, `${CONSULTATION.app} ${CONSULTATION.deployed}`])) {
    problems.push(`the after-sync checks are ${JSON.stringify(checked)}`);
  }
  if (new Set(checks.map((s) => s.run)).size > 1) problems.push("the after-sync checks do not run the same commands");
  const names = steps.map((s) => s.name);
  const at = (prefix) => names.findIndex((n) => n.startsWith(prefix));
  const order = [
    at("Wait until"),
    at(`Sync ${REMINDERS.app}`),
    at(`Check the live function count against the code (${REMINDERS.app})`),
    at(`Check ${CONSULTATION.app} is ready to sync`),
    at(`Sync ${CONSULTATION.app}`),
    at(`Check the live function count against the code (${CONSULTATION.app})`),
  ];
  if (order.some((x) => x < 0) || order.some((x, k) => k > 0 && x <= order[k - 1])) {
    problems.push(`the steps are not wait, sync and check reminders, ready, sync and check consultation: ${names.join(" | ")}`);
  }
  const ready = steps.find((s) => s.name.startsWith(`Check ${CONSULTATION.app} is ready`));
  if (!ready || ready.env.APP_ID !== CONSULTATION.app || ready.env.DEPLOYED_PATH !== CONSULTATION.deployed) {
    problems.push("the readiness check does not read the consultation app's own endpoint");
  }
  const apps = [...code.matchAll(/inngest-expected-functions\.mjs([^\n|]*)/g)].map((m) => (m[1].match(/--app ([\w-]+)/) ?? [, "(default)"])[1]);
  if (JSON.stringify([...new Set(apps)]) !== JSON.stringify(["(default)", CONSULTATION.app])) {
    problems.push(`the counted apps are ${JSON.stringify([...new Set(apps)])}`);
  }
  if (/\/api\/inngest\/(stripe|ifthenpay|invoicexpress)/.test(code)) problems.push("a third app's endpoint is named outside a comment");
  return problems;
}

test("EXACTLY TWO APPS: osteojp-reminders then osteojp-consultation, each synced, checked and counted the same way", () => {
  assert.deepEqual(appProblems(TEXT), []);
});

test("SEEDED: a third app's sync is caught", () => {
  const consultationSync = parseSteps(TEXT).find((s) => s.name.startsWith(`Sync ${CONSULTATION.app}`));
  const start = TEXT.indexOf(`      - name: ${consultationSync.name}`);
  const end = TEXT.indexOf("      - name: ", start + 10);
  const third = TEXT.slice(start, end)
    .replace(consultationSync.name, "Sync osteojp-stripe (PUT /api/inngest/stripe)")
    .replace("id: sync_consultation", "id: sync_stripe")
    .replace(`SERVE_PATH: ${CONSULTATION.serve}`, "SERVE_PATH: /api/inngest/stripe");
  const seeded = TEXT.slice(0, end) + third + TEXT.slice(end);
  assert.notEqual(seeded, TEXT);
  const p = appProblems(seeded);
  assert.ok(p.some((x) => /synced serve paths/.test(x)), p.join("; "));
  assert.ok(p.some((x) => /third app/.test(x)), p.join("; "));
});

test("SEEDED: a workflow that syncs the reminders app only (as before R27) is caught", () => {
  const start = TEXT.indexOf(`      - name: Check ${CONSULTATION.app} is ready to sync`);
  assert.ok(start > 0);
  const seeded = TEXT.slice(0, start).replace(/\n+$/, "\n");
  const p = appProblems(seeded);
  assert.ok(p.some((x) => /synced serve paths/.test(x)), p.join("; "));
});

test("SEEDED: the consultation sync before its readiness check is caught", () => {
  const steps = parseSteps(TEXT);
  const readyName = steps.find((s) => s.name.startsWith(`Check ${CONSULTATION.app} is ready`)).name;
  const syncName = steps.find((s) => s.name.startsWith(`Sync ${CONSULTATION.app}`)).name;
  const a = TEXT.indexOf(`      - name: ${readyName}`);
  const b = TEXT.indexOf(`      - name: ${syncName}`);
  const c = TEXT.indexOf("      - name: ", b + 10);
  const seeded = TEXT.slice(0, a) + TEXT.slice(b, c) + TEXT.slice(a, b) + TEXT.slice(c);
  assert.notEqual(seeded, TEXT);
  assert.ok(appProblems(seeded).some((x) => /not wait, sync and check/.test(x)));
});

test("SEEDED: a consultation count that is not asked for by --app is caught", () => {
  const seeded = TEXT.replaceAll("inngest-expected-functions.mjs --app osteojp-consultation", "inngest-expected-functions.mjs");
  assert.notEqual(seeded, TEXT);
  assert.ok(appProblems(seeded).some((x) => /counted apps/.test(x)));
});

// ---------------------------------------------------------------------------
// The steps, against a fake app.
// ---------------------------------------------------------------------------

const STEPS = parseSteps(TEXT);
const step = (prefix) => STEPS.find((s) => s.name.startsWith(prefix));
const WAIT = step("Wait until");
const SYNC = step(`Sync ${REMINDERS.app}`);
const CHECK = step(`Check the live function count against the code (${REMINDERS.app})`);
const READY = step(`Check ${CONSULTATION.app} is ready to sync`);
const SYNC_C = step(`Sync ${CONSULTATION.app}`);
const CHECK_C = step(`Check the live function count against the code (${CONSULTATION.app})`);
const SHA = "a".repeat(40);

test("the six steps the simulation runs are found, each with its run block", () => {
  for (const s of [WAIT, SYNC, CHECK, READY, SYNC_C, CHECK_C]) assert.ok(s && s.run, STEPS.map((x) => x.name).join(" | "));
});

const SERVER = `
const http = require("node:http");
const fs = require("node:fs");
const [mode, log] = process.argv.slice(1);
const sha = "${SHA}";
let consultationSynced = false;
const srv = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/inngest/deployed") {
    return res.end(JSON.stringify({
      app: mode === "app" ? "osteojp-consultation" : "osteojp-reminders",
      commit: mode === "stale" ? "b".repeat(40) : sha,
      functionCount: mode === "count" ? 6 : 7,
    }));
  }
  if (req.url === "/api/inngest/consultation/deployed") {
    if (mode === "c404") { res.statusCode = 404; return res.end("{}"); }
    return res.end(JSON.stringify({
      app: mode === "capp" ? "osteojp-reminders" : "osteojp-consultation",
      commit: mode === "cmoved" && consultationSynced ? "c".repeat(40) : sha,
      functionCount: mode === "ccount" ? 2 : 1,
    }));
  }
  if (req.method === "PUT" && (req.url === "/api/inngest" || req.url === "/api/inngest/consultation")) {
    fs.appendFileSync(log, req.url + "\\n");
    const consultation = req.url === "/api/inngest/consultation";
    if (consultation) consultationSynced = true;
    if (mode === (consultation ? "c500" : "500")) { res.statusCode = 500; return res.end(JSON.stringify({ message: "Failed to register", modified: false })); }
    if (mode === "msg") return res.end(JSON.stringify({ message: "Something else", modified: false }));
    return res.end(JSON.stringify({ message: "Successfully registered", modified: true }));
  }
  if (req.method === "PUT") fs.appendFileSync(log, req.url + "\\n");
  res.statusCode = 404; res.end("{}");
});
srv.listen(0, "127.0.0.1", () => console.log(srv.address().port));
`;

async function fakeApp(mode, log) {
  const child = spawn(process.execPath, ["-e", SERVER, mode, log], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve, reject) => {
    child.stdout.once("data", (d) => resolve(Number(String(d).trim())));
    child.once("error", reject);
  });
  return { origin: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

/**
 * Runs the six steps in order, as the job would, each with its own literal env
 * from the file plus what GitHub would fill in (the counts 7 and 1, and the
 * modified flag of the sync before it). First failure wins. `synced` lists the
 * serve paths the fake app received a PUT on.
 */
async function simulate(mode) {
  const dir = mkdtempSync(join(tmpdir(), "r6-sync-"));
  const log = join(dir, "puts");
  writeFileSync(log, "");
  const app = await fakeApp(mode, log);
  const synced = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
  try {
    const base = {
      PATH: process.env.PATH,
      APP_ORIGIN: app.origin,
      DEPLOYED_SHA: SHA,
      RUNNER_TEMP: dir,
      GITHUB_STEP_SUMMARY: join(dir, "summary"),
      WAIT_DEADLINE_SECONDS: "2",
      WAIT_SLEEP_SECONDS: "1",
    };
    let modified = "";
    const plan = [
      [WAIT, {}],
      [SYNC, {}],
      [CHECK, { EXPECTED: "7" }],
      [READY, { EXPECTED: "1" }],
      [SYNC_C, {}],
      [CHECK_C, { EXPECTED: "1" }],
    ];
    for (const [s, filled] of plan) {
      const output = join(dir, "output");
      writeFileSync(output, "");
      const literal = Object.fromEntries(Object.entries(s.env).filter(([, v]) => !v.includes("${{")));
      const env = { ...base, ...literal, ...filled, GITHUB_OUTPUT: output };
      if (s === CHECK || s === CHECK_C) env.MODIFIED = modified;
      const r = spawnSync("bash", ["--noprofile", "--norc", "-c", s.run], { env, encoding: "utf8" });
      if (r.status !== 0) return { ok: false, step: s.name, out: `${r.stdout}${r.stderr}`, synced: synced() };
      const m = readFileSync(output, "utf8").match(/modified=(\S+)/);
      if (m) modified = m[1];
    }
    const summary = readFileSync(join(dir, "summary"), "utf8");
    return { ok: true, synced: synced(), summary };
  } finally {
    app.stop();
  }
}

test("a confirmed sync of both apps with the right counts passes, and exactly the two serve paths are PUT", async () => {
  const r = await simulate("ok");
  assert.equal(r.ok, true, r.out);
  assert.deepEqual(r.synced, [REMINDERS.serve, CONSULTATION.serve]);
  assert.match(r.summary, /### osteojp-reminders synced[\s\S]*Functions served and registered: 7/);
  assert.match(r.summary, /### osteojp-consultation synced[\s\S]*Functions served and registered: 1/);
});

test("an HTTP 500 on the sync fails, NOT SYNCED", async () => {
  const r = await simulate("500");
  assert.equal(r.step, SYNC.name);
  assert.match(r.out, /The sync call failed \(HTTP 500\)\. NOT SYNCED/);
});

test("a registration Inngest did not confirm fails, NOT SYNCED", async () => {
  const r = await simulate("msg");
  assert.equal(r.step, SYNC.name);
  assert.match(r.out, /Inngest did not confirm the registration\. Its message: 'Something else'\. NOT SYNCED/);
});

test("a live count that differs from the code fails", async () => {
  const r = await simulate("count");
  assert.equal(r.step, CHECK.name);
  assert.match(r.out, /The live deployment serves 6 function\(s\); the code at a{40} lists 7/);
});

test("a reminders endpoint that names another app fails", async () => {
  const r = await simulate("app");
  assert.equal(r.step, CHECK.name);
  assert.match(r.out, /\/api\/inngest\/deployed names the app 'osteojp-consultation', not osteojp-reminders/);
});

test("a domain that never serves the commit fails at the deadline, NOT SYNCED, and nothing is synced", async () => {
  const r = await simulate("stale");
  assert.equal(r.step, WAIT.name);
  assert.match(r.out, /still serves 'b{40}', not a{40}\. NOT SYNCED/);
  assert.deepEqual(r.synced, []);
});

test("SEEDED: a deployment without the consultation endpoint (older than R27) syncs the reminders app only", async () => {
  const r = await simulate("c404");
  assert.equal(r.step, READY.name);
  assert.match(r.out, /Could not read http:\/\/127\.0\.0\.1:\d+\/api\/inngest\/consultation\/deployed\. NOT SYNCED: osteojp-consultation/);
  assert.deepEqual(r.synced, [REMINDERS.serve]);
});

test("SEEDED: a consultation count that differs from the code fails BEFORE its sync", async () => {
  const r = await simulate("ccount");
  assert.equal(r.step, READY.name);
  assert.match(r.out, /answers commit 'a{40}', app 'osteojp-consultation', 2 function\(s\); expected a{40}, osteojp-consultation, 1\. NOT SYNCED/);
  assert.deepEqual(r.synced, [REMINDERS.serve]);
});

test("SEEDED: a consultation endpoint that names another app fails BEFORE its sync", async () => {
  const r = await simulate("capp");
  assert.equal(r.step, READY.name);
  assert.match(r.out, /app 'osteojp-reminders'.*NOT SYNCED: osteojp-consultation/);
  assert.deepEqual(r.synced, [REMINDERS.serve]);
});

test("an HTTP 500 on the consultation sync fails, NOT SYNCED", async () => {
  const r = await simulate("c500");
  assert.equal(r.step, SYNC_C.name);
  assert.match(r.out, /The sync call failed \(HTTP 500\)\. NOT SYNCED/);
  assert.deepEqual(r.synced, [REMINDERS.serve, CONSULTATION.serve]);
});

test("a domain that moves during the consultation sync fails its after-sync check", async () => {
  const r = await simulate("cmoved");
  assert.equal(r.step, CHECK_C.name);
  assert.match(r.out, /The domain moved to 'c{40}' during the sync/);
});
