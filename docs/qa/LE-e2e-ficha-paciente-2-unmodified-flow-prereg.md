# LE-e2e-ficha-paciente-2: pre-registration of the unmodified-flow measurement (PURPLE R3 P-T2)

Written 2026-09-15, committed and pushed BEFORE the first run. The commit time is the timestamp that proves it.
Card: `LE-e2e-ficha-paciente-2-lands-back-on-agenda`.

## The question

R2 (P-T1, 2026-09-15 16:16-16:20Z) reproduced a click-timing split under a controlled harness: drawer
server-action POSTs held until the navigation request, the navigation GET held 3000 ms, tree 0231fe23.
Click dispatch to navigation request at or above 290 ms: 8 of 8 GREEN. Below 290 ms: 12 of 12 RED.

Does the same split hold on the UNMODIFIED flow, on current main, with no request holding and no
artificial navigation delay?

## Condition

- **Tree:** origin/main `0f25736f5b7b6d2f62656b857855eeac15fe2fb9`, worktree `osteojp-purple-d3`, detached. The
  app code is identical to main. The only working-tree difference is `apps/portal/next-env.d.ts`, which
  `next dev` rewrites on start.
- **Spec:** `apps/web/e2e/marcacao-patient-link.spec.ts:28` ("'Ficha do paciente' navigates to the primary
  profile"), sha256 `05f0e59a570b52a5244ec3cc6c6cd25213f8ba8163cdb2588e7f36a3abbfae95`, identical to main. It
  runs as committed: no `page.route`, no init script, no page probe, no edit.
- **Lane:** purple (Supabase 54521/54522, web 3020), migration journal 0088, NOT reset. It holds 65
  appointments, 10 of them at 09:00 more than 100 days out, which is the slot this test books. A booking can
  therefore be refused by the conflict check before the click is ever reached. The validity rule below
  handles that; a reset does not.
- **Procedure** (runner sha256 `da44299ba6561f2e93704c4fff0b92555f4fd40a334feb7560ea3c10407fd6fb`):
  1. `node apps/web/e2e/seed/seed-e2e.mjs`
  2. `pnpm --filter web e2e --project=setup -g "authenticate as (admin|therapist|reception)" --retries=0`
  3. ONE invocation: `pnpm --filter web e2e --project=chromium --no-deps e2e/marcacao-patient-link.spec.ts:28 --repeat-each=21 --workers=1 --retries=0 --trace=on --reporter=list,json`
  
  The runner refuses to start if the tree has tracked changes under `apps/web`, `packages` or `scripts`
  (`next-env.d.ts` excluded), and it logs the tree sha, the spec sha256 and the load average at every step.
- **The one deviation from a default local invocation is `--trace=on`.** The config says `on-first-retry`,
  which records nothing at `--retries=0`. The trace is the instrument. R2 and the D3 reproduction (6/10 red)
  also ran with the trace on.
- **Contention:** nothing else of mine runs on this Mac during the runs (no vitest, no build, no second e2e).
  Other lanes are outside my control, so the load average is logged. At 17:29Z it was 3.43 4.58 4.66, with
  the rc-inventory auth and storage containers in a restart loop.

## Warm-up

Every invocation starts its own dev servers, so its first execution compiles `/agenda` and `/patients/[id]`
cold. **Repeat 0 of every invocation is a WARM-UP.** It is recorded and reported, and never counted.

## Metrics, trace clock only

Anchor `t0` = the trace `before.startTime` of the click on the button named exactly "Ficha do paciente". That
is the test's click call dispatch.

- **M, the verdict metric** = the start of the first non-prefetch `GET /patients/<uuid>?_rsc` after `t0`
  (`0-trace.network` `_monotonicTime`), minus `t0`.
  - R2's verdict metric was the spec clock. There is no spec clock without editing the spec, so the verdict
    moves to the trace clock.
  - Calibration, computed from R2's saved data before this file was written: in all 20 R2 runs, trace M minus
    spec M was -3 to 0 ms, and the trace clock alone gives R2's identical split (8 GREEN at or above 290, 12 RED
    below).
- **C, the click offset**, reported beside M and never substituted for it = the time of the trace log line
  "performing click action" on that click, minus `t0`.
  - **Real click timestamp** = that log time converted to UTC through the trace's `context-options`
    `wallTime` and `monotonicTime`.
  - Calibration from R2: in 20 of 20 runs, the page's capture-phase DOM click listener fired 1-2 ms after
    this log line, and the navigation request left 2-3 ms after it.
- **Also reported:** time from the drawer's `toBeVisible` passing to the real click; the count of "element is
  not stable" retries; navigation status and duration; and drawer server-action POSTs to `/agenda` and to
  `/patients` that start inside the navigation.

## Validity, fixed now

A MEASURED execution is VALID when either:

- it passed, the Ficha click was performed, and a navigation GET followed it; or
- it failed at `toHaveURL` with the received URL on `/agenda`, the Ficha click was performed, and a navigation
  GET after it was answered.

Everything else is INVALID and is reported with its reason: a refused save before the click, a failure at
another call, a RED with no navigation GET, or one whose navigation was never answered.

## Top-up, fixed now

- **When to top up:** if invocation 1 yields fewer than 20 VALID measured runs, run another invocation by
  the same procedure.
- **Size:** `--repeat-each` = (20 minus valid so far) + 1, and its repeat 0 is again a warm-up.
- **Stop:** at 20 VALID, or when measured executions reach 40, whichever comes first.
- **Which runs count:** the verdict uses the first 20 VALID measured runs in execution order.

## Verdict rule, R2's, unchanged

- Threshold **290 ms on M**.
- **Contradiction** = M >= 290 and RED, or M < 290 and GREEN.
- **INCOMPLETE** if fewer than 20 VALID remain after the cap.
- **UNTESTABLE** if fewer than 3 of the 20 fall on either side of 290.
- Otherwise **HOLDS** if contradictions are at most 1, and **DOES NOT HOLD** if they are 2 or more.

## What each verdict does to the card, fixed now, per the dispatch

- **HOLDS:** outcome (a). Reclassify the card from test flake to product defect, state the user-visible
  symptom in one sentence, and stop. The limit is stated with it: this is the dev server, and a production
  build is unmeasured.
- **DOES NOT HOLD:** outcome (b). R2's split is a property of the harness. The card stays open with that
  recorded.
- **UNTESTABLE or INCOMPLETE:** neither outcome. The card stays open with that recorded, and it is not
  reclassified.
- **A null result is a valid report.** For example, 0 RED in 20 is DOES NOT HOLD when at least 3 runs fall
  below 290, and UNTESTABLE when fewer do.

No fix is written in this dispatch, and #1338 is not touched.

## Output

- `runs.csv`, one row per execution: run id, role, validity and reason, pass/fail, M, C (click offset),
  drawer-visible to real click, stability retries, click dispatch UTC, real click UTC, navigation request UTC,
  navigation status and ms, drawer action POSTs during the navigation, final URL.
- `actions.csv`, one row per trace action, log line and network request: the offset from `t0`.

## Analyser, embedded verbatim (sha256 `4c4929ee60a055374e5eb15c2f227ee480d989b8fd1a9defa35b480f95848017`)

It was dry-run before this commit on R2's own traces, wrapped in a synthetic results file. It reproduced
R2's per-run M and C, and its stability retries matched R2's card (GREEN 4, RED 0-3).

```js
// R3 P-T2 analysis. Written, dry-run on R2 traces, and sha256-pinned in the committed pre-registration
// BEFORE any R3 run. TRACE CLOCK ONLY: the spec under test is the unmodified committed file, so there is no
// spec clock and no page probe. Rules: docs/qa/LE-e2e-ficha-paciente-2-unmodified-flow-prereg.md
// usage: node analyse.mjs <batchDir> [<batchDir> ...]
//   each <batchDir> holds results.json (Playwright JSON reporter) and tests/ (--output) from ONE invocation,
//   given in execution order.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const THRESH = 290;
const NEED = 20;
const MARIA = "00000000-0000-0000-0000-00000000a301";
const batches = process.argv.slice(2);
const ESC = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const r0 = (x) => (typeof x === "number" ? Math.round(x) : null);

function collect(node, acc) {
  for (const s of node.suites ?? []) collect(s, acc);
  for (const sp of node.specs ?? []) for (const t of sp.tests ?? []) for (const r of t.results ?? []) acc.push(r);
  return acc;
}

const runs = [];
const actionRows = [["run_id", "result", "source", "action", "dispatch_offset_ms"]];

for (const [bi, bdir] of batches.entries()) {
  const results = collect(JSON.parse(fs.readFileSync(path.join(bdir, "results.json"), "utf8")), []);
  const parsed = results.map((r) => {
    const tz = (r.attachments ?? []).find((a) => a.name === "trace" && a.path)?.path ?? null;
    const dn = tz ? path.basename(path.dirname(tz)) : "";
    const m = dn.match(/-repeat(\d+)$/);
    return { r, tz, repeat: tz ? (m ? Number(m[1]) : 0) : null };
  }).sort((a, b) => (a.repeat ?? 1e9) - (b.repeat ?? 1e9));

  for (const { r, tz, repeat } of parsed) {
    const id = `b${bi + 1}-r${repeat ?? "?"}`;
    const row = { run_id: id, batch: bi + 1, repeat, role: repeat === 0 ? "WARMUP" : "MEASURED", status: r.status, result: r.status === "passed" ? "pass" : "fail",
      validity: "INVALID", reason: "", M_ms: null, C_ms: null, drawer_visible_to_real_click_ms: null, stability_retries: null,
      click_dispatch_utc: null, real_click_utc: null, nav_request_utc: null, nav_status: null, nav_ms: null, nav_is_maria: null,
      agenda_action_posts_during_nav: null, patients_action_posts_during_nav: null, final_url: null, failure: "" };
    runs.push(row);
    const msg = (r.errors ?? []).map((e) => e.message ?? "").join("\n").replace(ESC, "");
    row.failure = msg.split("\n")[0].slice(0, 120);
    const rec = msg.match(/Received string:\s*"([^"]+)"/);
    row.final_url = rec ? rec[1].replace(/^https?:\/\/[^/]+/, "") : null;
    if (!tz || !fs.existsSync(tz)) { row.reason = "no trace"; continue; }

    const td = path.join(bdir, "traces", `r${repeat}`);
    fs.mkdirSync(td, { recursive: true });
    execFileSync("unzip", ["-oq", tz, "-d", td]);
    const ctxFiles = fs.readdirSync(td).filter((f) => /^\d+-trace\.trace$/.test(f));
    let tr = [], nw = [], click = null;
    for (const f of ctxFiles) {
      const t = jsonl(path.join(td, f));
      const c = t.filter((e) => e.type === "before" && e.method === "click" && /\[name="Ficha do paciente"s\]/.test(e.params?.selector ?? "")).pop();
      if (c) { tr = t; nw = jsonl(path.join(td, f.replace(/\.trace$/, ".network"))); click = c; }
    }
    if (!click) { row.reason = "the Ficha do paciente click was never dispatched"; continue; }

    const co = tr.find((e) => e.type === "context-options");
    const wall = (t) => new Date(Math.round(co.wallTime + (t - co.monotonicTime))).toISOString();
    const t0 = click.startTime;
    const logs = tr.filter((e) => e.type === "log" && e.callId === click.callId);
    const perf = logs.find((l) => /performing click action/.test(l.message));
    row.stability_retries = logs.filter((l) => /element is not stable/.test(l.message)).length;
    row.click_dispatch_utc = wall(t0);
    if (!perf) { row.reason = "the Ficha do paciente click was dispatched but never performed"; continue; }
    row.C_ms = r0(perf.time - t0);
    row.real_click_utc = wall(perf.time);

    const befores = tr.filter((e) => e.type === "before");
    const afters = new Map(tr.filter((e) => e.type === "after").map((e) => [e.callId, e]));
    const drawerExpect = befores.filter((e) => e.method === "expect" && e.params?.selector === "internal:role=dialog" && /visible/.test(e.params?.expression ?? "") && e.startTime < t0).pop();
    const dvEnd = drawerExpect ? afters.get(drawerExpect.callId)?.endTime : null;
    row.drawer_visible_to_real_click_ms = dvEnd ? r0(perf.time - dvEnd) : null;

    const snaps = nw.filter((e) => e.type === "resource-snapshot").map((e) => e.snapshot);
    const hdr = (s, n) => (s.request.headers ?? []).find((h) => h.name.toLowerCase() === n)?.value;
    const nav = snaps.filter((s) => s.request.method === "GET" && /\/patients\/[0-9a-f-]{36}\?(.*&)?_rsc=/.test(s.request.url) && !hdr(s, "next-router-prefetch") && s._monotonicTime >= t0)
      .sort((a, b) => a._monotonicTime - b._monotonicTime)[0];
    if (nav) {
      row.M_ms = r0(nav._monotonicTime - t0);
      row.nav_request_utc = wall(nav._monotonicTime);
      row.nav_status = nav.response?.status ?? null;
      row.nav_ms = r0(nav.time);
      row.nav_is_maria = nav.request.url.includes(MARIA);
      const navEnd = nav._monotonicTime + (nav.time > 0 ? nav.time : 0);
      const during = snaps.filter((s) => s.request.method === "POST" && hdr(s, "next-action") && s._monotonicTime >= nav._monotonicTime && s._monotonicTime <= navEnd);
      row.agenda_action_posts_during_nav = during.filter((s) => new URL(s.request.url).pathname.startsWith("/agenda")).length;
      row.patients_action_posts_during_nav = during.filter((s) => new URL(s.request.url).pathname.startsWith("/patients")).length;
    }

    for (const b of befores) actionRows.push([id, row.result, "trace", `${b.class ?? ""}.${b.method} ${JSON.stringify(b.params?.selector ?? b.params?.expression ?? b.params?.url ?? "").slice(1, 90)}`, r0(b.startTime - t0)]);
    for (const l of logs) actionRows.push([id, row.result, "trace-log", `click log: ${l.message.trim().slice(0, 80)}`, r0(l.time - t0)]);
    for (const s of snaps.filter((x) => x._monotonicTime >= t0 - 2000)) actionRows.push([id, row.result, "trace-network", `${s.request.method} ${new URL(s.request.url).pathname.replace(/[0-9a-f-]{36}/, ":id")}${hdr(s, "next-action") ? " action=" + hdr(s, "next-action").slice(0, 6) : ""}${hdr(s, "rsc") ? " rsc" : ""}${hdr(s, "next-router-prefetch") ? " prefetch" : ""} status=${s.response?.status}`, r0(s._monotonicTime - t0)]);

    if (r.status === "passed") {
      if (!nav) row.reason = "passed but no navigation GET after the click";
      else { row.validity = "VALID"; row.final_url = `/patients/${MARIA}`; }
    } else if (r.status === "failed") {
      if (!/toHaveURL/.test(msg)) row.reason = "failed at a call other than toHaveURL";
      else if (!row.final_url || !row.final_url.startsWith("/agenda")) row.reason = `toHaveURL failed on ${row.final_url}, not /agenda`;
      else if (!nav) row.reason = "RED on /agenda with no navigation GET after the click";
      else if (!(nav.response?.status > 0)) row.reason = "RED on /agenda, navigation GET never answered";
      else row.validity = "VALID";
    } else row.reason = `status ${r.status}`;
  }
}

const cols = Object.keys(runs[0] ?? { run_id: 0 });
const csv = (rows) => rows.map((x) => x.map((v) => (v === null || v === undefined ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
const outDir = batches[batches.length - 1];
fs.writeFileSync(path.join(outDir, "runs.csv"), csv([cols, ...runs.map((r) => cols.map((c) => r[c]))]));
fs.writeFileSync(path.join(outDir, "actions.csv"), csv(actionRows));

const selected = runs.filter((r) => r.role === "MEASURED" && r.validity === "VALID").slice(0, NEED);
const verdict = (key) => {
  const v = selected.filter((t) => typeof t[key] === "number");
  const hi = v.filter((t) => t[key] >= THRESH), lo = v.filter((t) => t[key] < THRESH);
  const contra = hi.filter((t) => t.result === "fail").length + lo.filter((t) => t.result === "pass").length;
  const status = v.length < NEED ? `INCOMPLETE (${v.length}/${NEED})` : hi.length < 3 || lo.length < 3 ? "UNTESTABLE" : contra <= 1 ? "HOLDS" : "DOES NOT HOLD";
  return { key, measured: v.length, ge290: `${hi.length} (pass ${hi.filter((t) => t.result === "pass").length}, fail ${hi.filter((t) => t.result === "fail").length})`, lt290: `${lo.length} (pass ${lo.filter((t) => t.result === "pass").length}, fail ${lo.filter((t) => t.result === "fail").length})`, contradictions: contra, status };
};

console.log("run_id | role | validity | result | M ms | C ms | drawer visible to real click ms | not-stable retries | real click UTC | nav status | nav ms | /agenda action POSTs during nav | final url | reason");
for (const r of runs) console.log([r.run_id, r.role, r.validity, r.result, r.M_ms, r.C_ms, r.drawer_visible_to_real_click_ms, r.stability_retries, r.real_click_utc, r.nav_status, r.nav_ms, r.agenda_action_posts_during_nav, r.final_url, r.reason].join(" | "));
console.log(`executions ${runs.length}, warm-ups ${runs.filter((r) => r.role === "WARMUP").length}, measured ${runs.filter((r) => r.role === "MEASURED").length}, measured valid ${runs.filter((r) => r.role === "MEASURED" && r.validity === "VALID").length}, selected ${selected.length} (pass ${selected.filter((r) => r.result === "pass").length}, fail ${selected.filter((r) => r.result === "fail").length})`);
console.log("VERDICT", JSON.stringify(verdict("M_ms")));
console.log("SECONDARY (reported beside, never substituted)", JSON.stringify(verdict("C_ms")));
```
