#!/usr/bin/env node
// render-portal-board.mjs - regenerate the Portal Board artifact HTML FROM the
// committed JSON. `docs/board/portal-board.json` is the source of truth; this
// script is the ONLY way `portal-board-render.html` is produced, so the artifact
// can never drift from the repo (BOARD-SPEC.md: "never hand-edited").
//
// Why this is a SECOND renderer and not an argument to render-board.mjs: that
// script inlines board-app.js, the interactive five-view portal, which hardcodes
// the Ivan/JP/Rodica people set, the "Pre-Launch" brandmark and the
// prelaunch-board.json export path in a dozen places. Repointing it at the
// portal board would mean rewriting the platform board's live app, which is a
// behaviour change to a working surface for no gain here. This file emits a
// STATIC page instead: no state, no localStorage, no export, nothing to drift.
// If the portal board ever needs the interactive views, generalise board-app.js
// deliberately - do not bolt it on here.
//
// Usage:  node docs/board/render-portal-board.mjs [board.json] [out.html]
//         defaults: ./portal-board.json -> ./portal-board-render.html
//
// Validate BEFORE rendering: a red validator must block the render. This script
// re-checks the one rule it depends on (shipped/pass need evidence) and refuses
// to emit if violated. Zero runtime dependencies. Never writes anything but out.
//
// DETERMINISTIC: same JSON in, byte-identical HTML out. Nothing here reads the
// clock, so a re-render with no board change produces an empty diff. Answer
// latency is therefore computed server-side against the board's own `as_of`,
// and upgraded to real wall-clock time by a few lines of inline script when a
// browser opens the page. Keep `as_of` current and the two agree.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const boardPath = resolve(process.argv[2] ?? `${HERE}/portal-board.json`);
const outPath = resolve(process.argv[3] ?? `${HERE}/portal-board-render.html`);

const board = JSON.parse(readFileSync(boardPath, "utf8"));

// --- guard: refuse to render a lie (mirrors validate-board.mjs's core rule) ---
const bad = [];
for (const c of board.cards ?? []) {
  if (c.status === "shipped" && !c.evidence) bad.push(`card ${c.id} shipped w/o evidence`);
}
for (const g of board.launch_gate?.conditions ?? []) {
  if (g.state === "pass" && !g.evidence) bad.push(`gate ${g.id} pass w/o evidence`);
}
if (bad.length) {
  console.error("RENDER BLOCKED - board is not green:\n  " + bad.join("\n  "));
  process.exit(1);
}

// --- content fingerprint, computed EXACTLY as render-board.mjs:71 does --------
// BOARD-SPEC.md does not define the fingerprint; render-board.mjs is its only
// definition, so this mirrors that implementation rather than inventing a
// second one. It is derived at render time and deliberately NOT stored in the
// JSON: a stored hash of a file that contains the hash is self-referential, and
// the pre-launch board does not store one either.
const fingerprint = createHash("sha256").update(JSON.stringify(board)).digest("hex").slice(0, 16);

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const lanes = Array.isArray(board.lanes) ? board.lanes : [];
const cards = Array.isArray(board.cards) ? board.cards : [];
const lg = board.launch_gate ?? { denominator: 9, conditions: [] };
const conds = lg.conditions ?? [];
const passed = conds.filter((g) => g.state === "pass").length;
const denom = lg.denominator ?? 9;
const asOf = board.as_of ?? "";
const peopleLane = lanes.find((l) => l.id === "blocked_on_people");
const PEOPLE = peopleLane?.columns ?? ["ivan", "jp", "rodica"];

const inLane = (id) => cards.filter((c) => c.lane === id);

// Whole days between two ISO dates, floored at 0. Server-side half of the
// latency figure; the inline script re-measures it against the real clock.
function daysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

function latency(card) {
  const d = daysBetween(card.last_checkpoint, asOf);
  const text = d === null ? "?" : d === 0 ? "today" : `${d}d`;
  return `<span class="lat" data-since="${esc(card.last_checkpoint)}">${esc(text)}</span>`;
}

function evidenceCell(ev) {
  if (!ev) return `<div class="ev none">no evidence</div>`;
  return `<div class="ev"><span class="kind">${esc(ev.kind)}</span> <span class="at">${esc(ev.at)}</span><div class="ref">${esc(ev.ref)}</div></div>`;
}

function cardHtml(c) {
  const blocked = c.blocked_on ? `<span class="chip who">blocked on ${esc(c.blocked_on)}</span>` : "";
  return `<article class="card s-${esc(c.status)}">
  <header>
    <span class="id">${esc(c.id)}</span>
    <span class="chip st st-${esc(c.status)}">${esc(c.status)}</span>
    <span class="chip pr-${esc(c.priority)}">${esc(c.priority)}</span>
    <span class="chip">${esc(c.owner_terminal)}</span>
    <span class="chip gate">${esc(c.gate)}</span>
    ${blocked}
    <span class="cp">checkpoint ${esc(c.last_checkpoint)} · ${latency(c)}</span>
  </header>
  <h4>${esc(c.title)}</h4>
  ${evidenceCell(c.evidence)}
  ${c.notes ? `<details><summary>notes</summary><p>${esc(c.notes)}</p></details>` : ""}
</article>`;
}

function laneSection(lane) {
  const list = inLane(lane.id);
  const note = lane.note ? `<p class="lane-note">${esc(lane.note)}</p>` : "";

  if (lane.id === "blocked_on_people") {
    const cols = PEOPLE.map((p) => {
      const mine = list.filter((c) => c.blocked_on === p);
      return `<div class="col"><h3>${esc(p)} <span class="count">${mine.length}</span></h3>
      ${mine.length ? mine.map(cardHtml).join("\n") : `<p class="empty">nothing waiting on ${esc(p)}</p>`}</div>`;
    }).join("\n");
    return `<section class="lane" id="lane-${esc(lane.id)}">
  <h2>${esc(lane.title)} <span class="count">${list.length}</span></h2>
  ${note}<p class="lane-note">Answer latency is now minus last_checkpoint, shown on every card.</p>
  <div class="cols">${cols}</div>
</section>`;
  }

  const body = list.length
    ? list.map(cardHtml).join("\n")
    : `<p class="empty">empty</p>`;
  if (lane.collapsed) {
    return `<section class="lane" id="lane-${esc(lane.id)}">
  <details><summary><h2>${esc(lane.title)} <span class="count">${list.length}</span></h2></summary>
  ${note}${body}</details>
</section>`;
  }
  return `<section class="lane" id="lane-${esc(lane.id)}">
  <h2>${esc(lane.title)} <span class="count">${list.length}</span></h2>
  ${note}${body}
</section>`;
}

const gateHtml = conds
  .map(
    (g) => `<article class="cond ${esc(g.state)}">
  <header><span class="id">${esc(g.id)}</span><span class="chip st-${esc(g.state)}">${esc(g.state)}</span>${
    g.blocked_on ? `<span class="chip who">blocked on ${esc(g.blocked_on)}</span>` : ""
  }</header>
  <h4>${esc(g.title)}</h4>
  ${evidenceCell(g.evidence)}
  ${g.notes ? `<details><summary>notes</summary><p>${esc(g.notes)}</p></details>` : ""}
</article>`,
  )
  .join("\n");

const laneCounts = lanes
  .filter((l) => l.id !== "launch_gate")
  .map((l) => `<li><span>${esc(l.title)}</span><b>${inLane(l.id).length}</b></li>`)
  .join("");

const dataIsland = JSON.stringify({ ...board, fingerprint }).replace(/</g, "\\u003c");

const css = `
:root{color-scheme:light dark;--bg:#fbfcfd;--fg:#101a20;--mut:#5c6c77;--line:#dbe3e8;--card:#fff;--pass:#2f7e72;--fail:#8b1863;--accent:#45b9a7}
@media (prefers-color-scheme:dark){:root{--bg:#0e1417;--fg:#e8eef1;--mut:#96a7b1;--line:#25333a;--card:#141c21;--pass:#5fc9b6;--fail:#e07ab5}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:28px 20px 80px}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
header.top h1{margin:0 0 4px;font-size:22px;letter-spacing:-.01em}
.truth{margin:10px 0 18px;padding:10px 12px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent);font-size:13px}
.readiness{display:flex;align-items:baseline;gap:12px;margin:18px 0 6px}
.readiness b{font-size:34px;letter-spacing:-.02em}
.meter{height:8px;border-radius:99px;background:var(--line);overflow:hidden;margin:6px 0 22px}
.meter i{display:block;height:100%;background:var(--pass)}
ul.counts{list-style:none;display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0 0 26px}
ul.counts li{display:flex;gap:8px;align-items:baseline;border:1px solid var(--line);border-radius:8px;padding:5px 10px;font-size:12px;color:var(--mut)}
ul.counts b{color:var(--fg);font-size:14px}
h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);margin:34px 0 8px;display:inline-flex;gap:8px;align-items:center}
.count{background:var(--line);color:var(--fg);border-radius:99px;padding:1px 8px;font-size:11px}
.lane-note{margin:0 0 12px;color:var(--mut);font-size:12.5px;max-width:80ch}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.col h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:0 0 8px}
.card,.cond{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 10px}
.cond.pass{border-left:3px solid var(--pass)}.cond.fail{border-left:3px solid var(--fail)}
.card header,.cond header{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.id{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700}
.chip{font-size:11px;border:1px solid var(--line);border-radius:99px;padding:1px 8px;color:var(--mut)}
.st-pass{color:var(--pass);border-color:var(--pass)}.st-fail{color:var(--fail);border-color:var(--fail)}
.st-shipped{color:var(--pass);border-color:var(--pass)}.st-in_flight{color:var(--accent);border-color:var(--accent)}
.st-blocked,.who{color:var(--fail);border-color:var(--fail)}
.pr-high{color:var(--fail)}
.gate{font-family:ui-monospace,Menlo,monospace}
.cp{margin-left:auto;font-size:11px;color:var(--mut)}
h4{margin:2px 0 8px;font-size:14.5px;font-weight:600;line-height:1.4}
.ev{font-size:12px;border-top:1px dashed var(--line);padding-top:7px;color:var(--mut)}
.ev.none{font-style:italic}
.ev .kind{text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--fg)}
.ev .ref{margin-top:3px;word-break:break-word}
details{margin-top:8px}summary{cursor:pointer;font-size:12px;color:var(--mut)}
details p{margin:8px 0 0;font-size:13px;color:var(--mut);white-space:pre-wrap}
.empty{color:var(--mut);font-size:12.5px;font-style:italic;margin:0 0 10px}
section.lane details>summary{list-style:none}
section.lane details>summary h2{display:inline-flex}
footer{margin-top:44px;border-top:1px solid var(--line);padding-top:14px;color:var(--mut);font-size:12px}
`;

const html = `<meta charset="utf-8" />
<title>OsteoJP · Portal Board</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<style>${css}</style>

<div class="wrap">
<header class="top">
  <h1>${esc(board.board)}</h1>
  <div class="mono">phase ${esc(board.phase)} · schema v${esc(board.schema_version)} · fingerprint ${esc(fingerprint)}</div>
  <p class="truth"><strong>RENDER of docs/board/portal-board.json as of ${esc(asOf)}. The JSON in the repo is the source of truth.</strong><br />${esc(board.doctrine ?? "")}</p>
</header>

<div class="readiness"><b>${passed}/${denom}</b><span class="mono">launch readiness, counted not estimated</span></div>
<div class="meter"><i style="width:${Math.round((passed / denom) * 100)}%"></i></div>

<ul class="counts">${laneCounts}</ul>

<section class="lane" id="lane-launch_gate">
  <h2>${esc(lanes.find((l) => l.id === "launch_gate")?.title ?? "LAUNCH GATE")} <span class="count">${denom}</span></h2>
  <p class="lane-note">${esc(lanes.find((l) => l.id === "launch_gate")?.note ?? "")}</p>
  ${lg.source_note ? `<p class="lane-note">${esc(lg.source_note)}</p>` : ""}
  ${gateHtml}
</section>

${lanes
  .filter((l) => l.id !== "launch_gate")
  .map(laneSection)
  .join("\n")}

<footer>
  Generated by <span class="mono">docs/board/render-portal-board.mjs</span> from
  <span class="mono">docs/board/portal-board.json</span> · fingerprint <span class="mono">${esc(fingerprint)}</span> ·
  ${cards.length} cards · ${passed}/${denom} gates passed.
  Never hand-edit this file: edit the JSON, run <span class="mono">node docs/board/validate-board.mjs docs/board/portal-board.json</span>, then re-render.
</footer>
</div>

<script type="application/json" id="board-data">${dataIsland}</script>
<script>
/* Upgrade every server-rendered latency figure (measured against as_of) to real
   wall-clock time when a browser opens the page. Static otherwise. */
(function () {
  var now = new Date();
  var els = document.querySelectorAll(".lat[data-since]");
  for (var i = 0; i < els.length; i++) {
    var t = Date.parse(els[i].getAttribute("data-since"));
    if (isNaN(t)) continue;
    var d = Math.max(0, Math.floor((now - t) / 86400000));
    els[i].textContent = d === 0 ? "today" : d + "d";
  }
})();
</script>
`;

writeFileSync(outPath, html);
console.log(`rendered ${cards.length} cards + ${passed}/${denom} gates -> ${outPath}`);
console.log(`  fingerprint: ${fingerprint}`);
console.log(
  "  lanes: " +
    lanes
      .filter((l) => l.id !== "launch_gate")
      .map((l) => `${l.id} ${inLane(l.id).length}`)
      .join(", "),
);
