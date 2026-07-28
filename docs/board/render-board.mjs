#!/usr/bin/env node
// render-board.mjs - regenerate the Pre-Launch Board artifact HTML FROM the
// committed JSON. The JSON (docs/board/prelaunch-board.json) is the source of
// truth; this script is the ONLY way the artifact is produced, so the artifact
// can never drift from the repo (BOARD-SPEC.md: "never hand-edited").
//
// Usage:  node docs/board/render-board.mjs [board.json] [out.html]
//         defaults: ./prelaunch-board.json  ->  ./prelaunch-board.rendered.html
//
// Validate BEFORE rendering: a red validator must block the render. This script
// re-checks the one rule it depends on (shipped/pass need evidence) and refuses
// to emit if violated. Zero dependencies. Never writes anything but out.html.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const boardPath = resolve(process.argv[2] ?? `${HERE}/prelaunch-board.json`);
const outPath = resolve(process.argv[3] ?? `${HERE}/prelaunch-board.rendered.html`);

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

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const GATE_BADGE = {
  owner_merge: { label: "Owner merge", cls: "" },
  owner_authorizo: { label: "AUTORIZO", cls: "autorizo" },
  stakeholder: { label: "Stakeholder", cls: "stakeholder" },
  green_self_merge: { label: "Self-merge", cls: "selfmerge" },
  cyan_clear: { label: "CYAN", cls: "cyan" },
};
const STATUS = {
  todo: { pill: "To do", cls: "t-todo" },
  in_flight: { pill: "In flight", cls: "t-inflight" },
  blocked: { pill: "Blocked", cls: "t-blocked" },
  halted: { pill: "Halted", cls: "t-halted" },
  shipped: { pill: "Shipped", cls: "t-shipped" },
};
const WHO = { ivan: "Ivan", jp: "JP", rodica: "Rodica", infra: "Infra" };

const gateBadge = (g) => {
  const b = GATE_BADGE[g] ?? { label: g, cls: "" };
  return `<span class="gate-badge ${b.cls}">${esc(b.label)}</span>`;
};
const evidenceSlot = (ev) => {
  if (!ev) return `<span class="ev empty">no evidence</span>`;
  const kind = ev.kind === "pr" ? "PR " : ev.kind === "journal" ? "journal " : ev.kind === "sha256" ? "sha256 " : ev.kind === "e2e" ? "e2e " : "";
  return `<span class="ev"><b>${esc(kind)}${esc(ev.ref)}</b>${ev.at ? ` · ${esc(ev.at)}` : ""}</span>`;
};
const whoBadge = (w) => (w && WHO[w] ? `<span class="who ${w}">${esc(WHO[w])}</span>` : "");

function tile(c, { mini = false } = {}) {
  const st = STATUS[c.status] ?? { pill: c.status, cls: "" };
  const wait = c.lane === "blocked_on_people"
    ? `<span class="wait" data-since="${esc(c.last_checkpoint)}">0d</span>` : "";
  return `<div class="tile ${mini ? "mini " : ""}${st.cls}">
        <div class="top"><span class="id">${esc(c.id)}</span><span class="pill">${esc(st.pill)}</span>${wait}</div>
        <div class="ttl">${esc(c.title)}</div>
        <div class="notes">${esc(c.notes)}</div>
        <div class="foot">${gateBadge(c.gate)}${whoBadge(c.blocked_on)}${evidenceSlot(c.evidence)}</div>
      </div>`;
}

const cardsIn = (lane) => (board.cards ?? []).filter((c) => c.lane === lane);
const lg = board.launch_gate ?? { denominator: 9, conditions: [] };
const passed = (lg.conditions ?? []).filter((g) => g.state === "pass").length;
const denom = lg.denominator ?? 9;
const readPct = Math.round((passed / denom) * 100);

const gateChips = (lg.conditions ?? []).map((g) => `
      <div class="gate ${g.state === "pass" ? "pass" : "fail"}"><div class="gt"><span class="gid">${esc(g.id)}</span><span class="gs">${g.state === "pass" ? "PASS" : "FAIL"}</span></div><div class="gtt">${esc(g.title)}</div><div class="gm">${whoBadge(g.blocked_on)}${evidenceSlot(g.evidence)}</div></div>`).join("");

// Blocked-on-people: 3 columns keyed on blocked_on; empty columns show the
// launch-gate load on that person so the latency picture is complete.
function peopleColumn(person) {
  const cards = cardsIn("blocked_on_people").filter((c) => c.blocked_on === person);
  const gateLoad = (lg.conditions ?? []).filter((g) => g.blocked_on === person && g.state === "fail").map((g) => g.id);
  const body = cards.length
    ? cards.map((c) => tile(c, { mini: true })).join("")
    : `<div class="none">No card blocked directly on ${esc(WHO[person])}.${gateLoad.length ? ` Launch-gate load: ${esc(gateLoad.join(", "))}.` : ""}</div>`;
  return `<div class="pcol ${person}"><div class="ph">${esc(WHO[person])}</div>${body}</div>`;
}

const board_section = (lane) => cardsIn(lane).map((c) => tile(c)).join("\n      ");
const shipped = cardsIn("shipped");

const html = `<title>OsteoJP · Pre-Launch Board</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --bg:#F7F9F8;--surface:#FFFFFF;--surface-2:#F1F5F4;--border:#E1E9E7;--border-strong:#CFDBD8;
    --ink:#16221F;--muted:#5D6F6B;--faint:#8A9A96;--accent:#2E8A7C;--magenta:#8B1863;
    --done:#1F9C82;--done-bg:#E4F4EF;--review:#2F7FC4;--review-bg:#E4EEF8;--blocked:#C6544B;--blocked-bg:#FBE9E6;
    --halt:#7E5FC0;--halt-bg:#EEE9F8;--todo:#C6871F;--todo-bg:#FAEFDB;
    --ivan:#2F7FC4;--jp:#7E5FC0;--rodica:#C6544B;--infra:#8A9A96;
    --shadow:0 1px 2px rgba(20,40,36,.05),0 6px 20px -12px rgba(20,40,36,.22);
    --mono:ui-monospace,"SF Mono","SFMono-Regular",Menlo,Consolas,monospace;
    --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  @media (prefers-color-scheme: dark){:root{
    --bg:#0D1513;--surface:#15201D;--surface-2:#1B2825;--border:#26332F;--border-strong:#33433E;
    --ink:#E8EFEC;--muted:#93A29E;--faint:#6F807B;--accent:#45B9A7;--magenta:#D07AAE;
    --done:#3FC0A2;--done-bg:#133029;--review:#64A6E4;--review-bg:#14283a;--blocked:#E4776D;--blocked-bg:#34211F;
    --halt:#A98CE8;--halt-bg:#241f36;--todo:#E3AC4E;--todo-bg:#322813;
    --ivan:#64A6E4;--jp:#A98CE8;--rodica:#E4776D;--infra:#6F807B;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -14px rgba(0,0,0,.6);}}
  :root[data-theme="dark"]{
    --bg:#0D1513;--surface:#15201D;--surface-2:#1B2825;--border:#26332F;--border-strong:#33433E;
    --ink:#E8EFEC;--muted:#93A29E;--faint:#6F807B;--accent:#45B9A7;--magenta:#D07AAE;
    --done:#3FC0A2;--done-bg:#133029;--review:#64A6E4;--review-bg:#14283a;--blocked:#E4776D;--blocked-bg:#34211F;
    --halt:#A98CE8;--halt-bg:#241f36;--todo:#E3AC4E;--todo-bg:#322813;
    --ivan:#64A6E4;--jp:#A98CE8;--rodica:#E4776D;--infra:#6F807B;
    --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -14px rgba(0,0,0,.6);}
  :root[data-theme="light"]{
    --bg:#F7F9F8;--surface:#FFFFFF;--surface-2:#F1F5F4;--border:#E1E9E7;--border-strong:#CFDBD8;
    --ink:#16221F;--muted:#5D6F6B;--faint:#8A9A96;--accent:#2E8A7C;--magenta:#8B1863;
    --done:#1F9C82;--done-bg:#E4F4EF;--review:#2F7FC4;--review-bg:#E4EEF8;--blocked:#C6544B;--blocked-bg:#FBE9E6;
    --halt:#7E5FC0;--halt-bg:#EEE9F8;--todo:#C6871F;--todo-bg:#FAEFDB;
    --ivan:#2F7FC4;--jp:#7E5FC0;--rodica:#C6544B;--infra:#8A9A96;
    --shadow:0 1px 2px rgba(20,40,36,.05),0 6px 20px -12px rgba(20,40,36,.22);}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:40px 24px 72px}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:600}
  h1{font-size:clamp(26px,4vw,38px);line-height:1.1;margin:10px 0 6px;letter-spacing:-.01em;font-weight:650}
  .sub{color:var(--muted);font-size:14.5px;max-width:74ch}
  .live{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:14px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--done);animation:pulse 2.4s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(31,156,130,.5)}70%{box-shadow:0 0 0 7px rgba(31,156,130,0)}100%{box-shadow:0 0 0 0 rgba(31,156,130,0)}}
  @media (prefers-reduced-motion: reduce){.dot{animation:none}}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);font-family:var(--mono);font-weight:600;margin:38px 0 14px;display:flex;align-items:center;gap:12px}
  h2 .ct{color:var(--muted)}
  h2::after{content:"";flex:1;height:1px;background:var(--border)}
  .gate-wrap{background:var(--surface);border:1px solid var(--border-strong);border-radius:14px;padding:18px 18px 16px;box-shadow:var(--shadow);margin:26px 0 8px}
  .gate-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}
  .gate-head .lbl{font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);font-weight:600}
  .gate-head .read{font-family:var(--mono);font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
  .gate-head .read b{color:${passed === denom ? "var(--done)" : "var(--blocked)"}}
  .gate-head .note{font-size:12px;color:var(--muted)}
  .readbar{height:8px;border-radius:99px;background:var(--surface-2);border:1px solid var(--border);overflow:hidden;display:flex;margin:4px 0 16px}
  .readbar i{display:block;height:100%;background:var(--done)}
  .gates{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  @media (max-width:860px){.gates{grid-template-columns:repeat(2,1fr)}}
  @media (max-width:560px){.gates{grid-template-columns:1fr}}
  .gate{border:1px solid var(--border);border-left:3px solid var(--gc);border-radius:10px;padding:10px 12px;background:var(--surface-2);display:flex;flex-direction:column;gap:6px}
  .gate.pass{--gc:var(--done)}.gate.fail{--gc:var(--blocked)}
  .gate .gt{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .gate .gid{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--muted)}
  .gate .gs{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.06em;padding:2px 7px;border-radius:99px}
  .gate.pass .gs{background:var(--done-bg);color:var(--done)}.gate.fail .gs{background:var(--blocked-bg);color:var(--blocked)}
  .gate .gtt{font-size:12.5px;line-height:1.3}
  .gate .gm{display:flex;align-items:center;gap:6px;margin-top:2px}
  .who{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:5px;border:1px solid var(--wc);color:var(--wc)}
  .who.ivan{--wc:var(--ivan)}.who.jp{--wc:var(--jp)}.who.rodica{--wc:var(--rodica)}.who.infra{--wc:var(--infra)}
  .ev{font-family:var(--mono);font-size:10.5px;color:var(--muted)}
  .ev.empty{color:var(--faint);font-style:italic;opacity:.8}
  .ev b{color:var(--accent);font-style:normal}
  .people{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  @media (max-width:780px){.people{grid-template-columns:1fr}}
  .pcol{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;box-shadow:var(--shadow)}
  .pcol>.ph{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;margin:2px 2px 10px;display:flex;align-items:center;gap:8px}
  .pcol.ivan>.ph{color:var(--ivan)}.pcol.jp>.ph{color:var(--jp)}.pcol.rodica>.ph{color:var(--rodica)}
  .pcol .none{font-size:12px;color:var(--faint);font-style:italic;padding:6px 2px}
  .wait{font-family:var(--mono);font-size:10px;font-weight:700;padding:1px 6px;border-radius:5px;background:var(--surface-2);border:1px solid var(--border-strong);color:var(--muted);margin-left:auto}
  .board{display:grid;grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:12px}
  .tile{position:relative;background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--bd);border-radius:12px;padding:12px 13px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:8px}
  .tile.mini{padding:10px 12px}
  .tile .top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .tile .id{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.02em}
  .tile .ttl{font-size:13.5px;font-weight:550;line-height:1.3}
  .tile .notes{font-size:11.5px;color:var(--muted);line-height:1.45}
  .tile .foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px}
  .pill{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:99px;white-space:nowrap}
  .gate-badge{font-family:var(--mono);font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:5px;border:1px dashed var(--border-strong);color:var(--muted)}
  .gate-badge.autorizo{border-color:var(--halt);color:var(--halt);border-style:solid}
  .gate-badge.stakeholder{border-color:var(--rodica);color:var(--rodica)}
  .gate-badge.selfmerge{border-color:var(--done);color:var(--done)}
  .gate-badge.cyan{border-color:var(--review);color:var(--review)}
  .t-todo{--bd:var(--todo)}.t-todo .pill{background:var(--todo-bg);color:var(--todo)}
  .t-inflight{--bd:var(--review)}.t-inflight .pill{background:var(--review-bg);color:var(--review)}
  .t-blocked{--bd:var(--blocked)}.t-blocked .pill{background:var(--blocked-bg);color:var(--blocked)}
  .t-halted{--bd:var(--halt)}.t-halted .pill{background:var(--halt-bg);color:var(--halt)}
  .t-shipped{--bd:var(--done)}.t-shipped .pill{background:var(--done-bg);color:var(--done)}
  details.shipped{margin-top:6px;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
  details.shipped>summary{cursor:pointer;padding:12px 16px;font-family:var(--mono);font-size:12.5px;color:var(--muted);font-weight:600;list-style:none;display:flex;gap:10px;align-items:center}
  details.shipped>summary::-webkit-details-marker{display:none}
  details.shipped>summary::before{content:"▸";color:var(--faint)}
  details.shipped[open]>summary::before{content:"▾"}
  details.shipped .board{padding:0 14px 14px}
  footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--border);color:var(--faint);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  footer .mono{font-family:var(--mono)}
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">OsteoJP · Pre-Launch · GREEN executor</div>
    <h1>Pre-Launch Board</h1>
    <p class="sub">Rendered from <code>docs/board/prelaunch-board.json</code> by <code>render-board.mjs</code> - the committed source of truth. <b>Two separate meters:</b> the lanes below track DELIVERY work (what GREEN builds and ships); the Launch Gate tracks 9 GO-LIVE conditions that are human/prod actions, so it stays low until those people act - it is NOT a percentage of the build work. Wave 12 is closed; this is the pre-launch phase.</p>
    <div class="live"><span class="dot"></span> Snapshot ${esc(board.as_of ?? "")} · delivered: <b>${shipped.length} shipped</b> · ${cardsIn("in_flight").length} in flight · ${cardsIn("blocked_on_people").length} blocked on people · launch gate ${passed}/${denom} (go-live milestones, human/prod)</div>
  </header>

  <div class="gate-wrap">
    <div class="gate-head">
      <span class="lbl">Launch gate</span>
      <span class="read"><b>${passed}</b> / ${denom} passed</span>
      <span class="note">Counted, never estimated. No partial credit: each condition is pass or fail, fail-closed until its evidence exists.</span>
    </div>
    <div class="readbar"><i style="width:${readPct}%"></i></div>
    <div class="gates">${gateChips}
    </div>
  </div>

  <h2>Blocked on people <span class="ct">· answer latency made visible</span></h2>
  <div class="people">
    ${peopleColumn("ivan")}
    ${peopleColumn("jp")}
    ${peopleColumn("rodica")}
  </div>

  <h2>In flight <span class="ct">· ${cardsIn("in_flight").length}</span></h2>
  <div class="board">
      ${board_section("in_flight")}
  </div>

  <h2>Rodica batch <span class="ct">· live inbox · ${cardsIn("rodica_batch").length}</span></h2>
  <div class="board">
      ${board_section("rodica_batch")}
  </div>

  <h2>Incidents <span class="ct">· ${cardsIn("incidents").length}</span></h2>
  <div class="board">
      ${board_section("incidents")}
  </div>

  <h2>Loose ends <span class="ct">· ${cardsIn("loose_ends").length}</span></h2>
  <div class="board">
      ${board_section("loose_ends")}
  </div>

  <h2>Shipped</h2>
  <details class="shipped">
    <summary>Shipped · ${shipped.length} (every card carries evidence, guaranteed by the validator)</summary>
    <div class="board">
      ${shipped.map((c) => tile(c)).join("\n      ")}
    </div>
  </details>

  <footer>
    <span class="mono">osteojp · pre-launch board · GREEN executor</span>
    <span>Source: docs/board/prelaunch-board.json · rendered by render-board.mjs · validator green · readiness counted ${passed}/${denom}</span>
  </footer>
</div>

<script>
  (function(){var now=new Date();document.querySelectorAll('.wait[data-since]').forEach(function(el){var since=new Date(el.getAttribute('data-since')+'T00:00:00Z');if(isNaN(since))return;var days=Math.max(0,Math.floor((now-since)/86400000));el.textContent=days+'d';el.title='waiting since '+el.getAttribute('data-since');});})();
</script>
`;

writeFileSync(outPath, html);
console.log(`rendered ${board.cards?.length ?? 0} cards + ${passed}/${denom} gates -> ${outPath}`);
