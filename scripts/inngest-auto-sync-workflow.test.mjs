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
// The steps, against a fake app.
// ---------------------------------------------------------------------------

/** The `run: |` blocks of the sync job, by step name. */
function steps(text) {
  const lines = text.split("\n");
  const out = new Map();
  let name = null;
  for (let i = 0; i < lines.length; i++) {
    const n = lines[i].match(/^ {6}- name: (.*)$/);
    if (n) name = n[1];
    if (/^ {8}run: \|\s*$/.test(lines[i])) {
      const body = [];
      for (let k = i + 1; k < lines.length; k++) {
        if (lines[k].trim() === "") { body.push(""); continue; }
        if (!lines[k].startsWith(" ".repeat(10))) break;
        body.push(lines[k].slice(10));
      }
      out.set(name, body.join("\n"));
    }
  }
  return out;
}

const STEPS = steps(TEXT);
const WAIT = [...STEPS.keys()].find((k) => k.startsWith("Wait until"));
const SYNC = [...STEPS.keys()].find((k) => k.startsWith("Sync"));
const CHECK = [...STEPS.keys()].find((k) => k.startsWith("Check the live function count"));
const SHA = "a".repeat(40);

test("the three steps the simulation runs are found", () => {
  assert.ok(WAIT && SYNC && CHECK, [...STEPS.keys()].join(" | "));
});

const SERVER = `
const http = require("node:http");
const mode = process.argv[1];
const sha = "${SHA}";
const srv = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/inngest/deployed") {
    return res.end(JSON.stringify({ commit: mode === "stale" ? "b".repeat(40) : sha, functionCount: mode === "count" ? 6 : 7 }));
  }
  if (req.method === "PUT" && req.url === "/api/inngest") {
    if (mode === "500") { res.statusCode = 500; return res.end(JSON.stringify({ message: "Failed to register", modified: false })); }
    if (mode === "msg") return res.end(JSON.stringify({ message: "Something else", modified: false }));
    return res.end(JSON.stringify({ message: "Successfully registered", modified: true }));
  }
  res.statusCode = 404; res.end("{}");
});
srv.listen(0, "127.0.0.1", () => console.log(srv.address().port));
`;

async function fakeApp(mode) {
  const child = spawn(process.execPath, ["-e", SERVER, mode], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve, reject) => {
    child.stdout.once("data", (d) => resolve(Number(String(d).trim())));
    child.once("error", reject);
  });
  return { origin: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

/** Runs wait, sync and check in order, as the job would. First failure wins. */
async function simulate(mode) {
  const app = await fakeApp(mode);
  try {
    const dir = mkdtempSync(join(tmpdir(), "r6-sync-"));
    const output = join(dir, "output");
    writeFileSync(output, "");
    const env = {
      PATH: process.env.PATH,
      APP_ORIGIN: app.origin,
      DEPLOYED_SHA: SHA,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(dir, "summary"),
      EXPECTED: "7",
      WAIT_DEADLINE_SECONDS: "2",
      WAIT_SLEEP_SECONDS: "1",
    };
    for (const name of [WAIT, SYNC, CHECK]) {
      const modified = readFileSync(output, "utf8").match(/modified=(\S+)/);
      if (modified) env.MODIFIED = modified[1];
      const r = spawnSync("bash", ["--noprofile", "--norc", "-c", STEPS.get(name)], { env, encoding: "utf8" });
      if (r.status !== 0) return { ok: false, step: name, out: `${r.stdout}${r.stderr}` };
    }
    return { ok: true };
  } finally {
    app.stop();
  }
}

test("a confirmed sync with the right count passes", async () => {
  const r = await simulate("ok");
  assert.equal(r.ok, true, r.out);
});

test("an HTTP 500 on the sync fails, NOT SYNCED", async () => {
  const r = await simulate("500");
  assert.equal(r.step, SYNC);
  assert.match(r.out, /The sync call failed \(HTTP 500\)\. NOT SYNCED/);
});

test("a registration Inngest did not confirm fails, NOT SYNCED", async () => {
  const r = await simulate("msg");
  assert.equal(r.step, SYNC);
  assert.match(r.out, /Inngest did not confirm the registration\. Its message: 'Something else'\. NOT SYNCED/);
});

test("a live count that differs from the code fails", async () => {
  const r = await simulate("count");
  assert.equal(r.step, CHECK);
  assert.match(r.out, /The live deployment serves 6 function\(s\); the code at a{40} lists 7/);
});

test("a domain that never serves the commit fails at the deadline, NOT SYNCED, and nothing is synced", async () => {
  const r = await simulate("stale");
  assert.equal(r.step, WAIT);
  assert.match(r.out, /still serves 'b{40}', not a{40}\. NOT SYNCED/);
});
