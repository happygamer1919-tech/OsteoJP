#!/usr/bin/env node
// render-board.mjs - regenerate the Pre-Launch Board artifact HTML FROM the
// committed JSON. The JSON (docs/board/prelaunch-board.json) is the source of
// truth; this script is the ONLY way the artifact is produced, so the artifact
// can never drift from the repo (BOARD-SPEC.md: "never hand-edited").
//
// The artifact is now INTERACTIVE: the page seeds its state from the JSON
// (inlined as a <script type="application/json"> data island) and lets you edit,
// add, delete, re-status, re-prioritise and mark-done cards, toggle launch-gate
// conditions, and Export the resulting JSON to paste back into the repo. Edits
// live in the browser's localStorage; this file never writes back to the JSON.
// All CSS + JS are inlined from the sibling board.css / board-app.js, so the
// page makes ZERO external requests (a strict artifact CSP blocks CDNs anyway).
//
// Usage:  node docs/board/render-board.mjs [board.json] [out.html]
//         defaults: ./prelaunch-board.json  ->  ./prelaunch-board.rendered.html
//
// Validate BEFORE rendering: a red validator must block the render. This script
// re-checks the one rule it depends on (shipped/pass need evidence) and refuses
// to emit if violated. Zero runtime dependencies. Never writes anything but out.

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

// --- sibling assets, inlined so the artifact is fully self-contained ----------
const css = readFileSync(`${HERE}/board.css`, "utf8");
const appJs = readFileSync(`${HERE}/board-app.js`, "utf8");

// --- JSON data island: escape "<" so it can never break out of the script tag -
const dataIsland = JSON.stringify(board).replace(/</g, "\\u003c");

const lg = board.launch_gate ?? { denominator: 9, conditions: [] };
const passed = (lg.conditions ?? []).filter((g) => g.state === "pass").length;
const denom = lg.denominator ?? 9;

const html = `<meta charset="utf-8" />
<title>OsteoJP · Pre-Launch Board</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<style>
${css}
</style>

<div class="wrap" id="app">
  <noscript style="display:block;padding:24px;font-family:system-ui">
    This board is interactive and needs JavaScript. The source of truth is
    <code>docs/board/prelaunch-board.json</code>.
  </noscript>
</div>

<script type="application/json" id="board-data">${dataIsland}</script>
<script>
${appJs}
</script>
`;

writeFileSync(outPath, html);
console.log(
  `rendered ${board.cards?.length ?? 0} cards + ${passed}/${denom} gates (interactive) -> ${outPath}`,
);
