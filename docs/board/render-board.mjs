#!/usr/bin/env node
// render-board.mjs - regenerate a board's artifact HTML FROM the committed
// JSON. The JSON is the source of truth; this script is the ONLY way the
// artifact is produced, so the artifact can never drift from the repo
// (BOARD-SPEC.md: "never hand-edited").
//
// It renders BOTH boards. Which board is decided by the JSON's own `board`
// field, which docs/board/board-config.mjs maps to that board's display
// configuration. An unknown board name is a hard error, never a silent fallback
// to another board's identity.
//
// The artifact is a PORTAL: the page seeds its state from the JSON (inlined as a
// <script type="application/json"> data island) and gives five views over it
// (Focus, Board, Launch gate, List, Timeline), drag-and-drop between lanes,
// evidence-gated "mark done", undo, filters and an Export that diffs against
// this seed. Edits live in the browser's localStorage; this file never writes
// back to the JSON. All CSS + JS are inlined from the sibling board.css /
// board-app.js, so the page makes ZERO external requests (the artifact CSP
// blocks CDNs anyway, and a silently-failing font link is worse than none).
//
// Lane placement is DERIVED in both directions: validate-board.mjs computes the
// same lane the page does, so a card can never sit in a lane its own status
// contradicts - neither in the repo nor on screen.
//
// Usage:  node docs/board/render-board.mjs [board.json] [out.html]
//         defaults: ./prelaunch-board.json  ->  ./prelaunch-board.rendered.html
//         portal:   node docs/board/render-board.mjs docs/board/portal-board.json
//                   (out defaults to the board's own configured render path)
//
// Validate BEFORE rendering: a red validator must block the render. This script
// re-checks the one rule it depends on (shipped/pass need evidence) and refuses
// to emit if violated. Zero runtime dependencies. Never writes anything but out.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deriveConfig } from "./board-config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const boardPath = resolve(process.argv[2] ?? `${HERE}/prelaunch-board.json`);

const board = JSON.parse(readFileSync(boardPath, "utf8"));

// Per-board display configuration, derived in Node so a test can assert it
// without rendering. Throws on an unknown board name.
const config = deriveConfig(board);

// The default out path follows the board, so the pre-launch defaults are
// unchanged and every existing invocation keeps working.
const outPath = resolve(process.argv[3] ?? `${HERE}/${config.outputPath}`);

/**
 * EXTERNAL AGENDA — the cards the owner tracks somewhere else are not rendered.
 *
 * Legal review and counsel, credential rotation, force-rotation of staff
 * passwords and security-breach response left this board by owner ruling. THE
 * CARDS STAY IN THE JSON — the ledger is the point, and a deleted card takes its
 * history with it — but a card on a rendered engineering board reads as work
 * engineering owes, and duplicate tracking is what the ruling removes. They are
 * listed instead, one line of status each, in docs/board/EXTERNAL-AGENDA.md.
 *
 * EVERY COUNT ON THE PAGE FOLLOWS FROM `visible`, not from `board`. A card
 * excluded from the lanes but still inside the totals would be the worst of both
 * — invisible and yet counted — and "39 open" against a page showing 34 is the
 * kind of discrepancy that costs an hour to explain.
 */
const visible = {
  ...board,
  cards: (board.cards ?? []).filter((c) => c.external_agenda !== true),
};
const hidden = (board.cards?.length ?? 0) - visible.cards.length;

// --- guard: refuse to render a lie (mirrors validate-board.mjs's core rule) ---
// DELIBERATELY OVER THE FULL BOARD, NOT OVER `visible`. A shipped card with no
// evidence is a lie in the committed file whether or not this render shows it,
// and excluding it from the guard would mean flagging a card could SILENCE a
// check. The exclusion decides what is DISPLAYED; it must not decide what is
// VERIFIED.
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
/**
 * PL-28 — a content FINGERPRINT of this publish, so the portal can tell a
 * browser holding an older snapshot that a newer board exists.
 *
 * The staleness check used to compare `as_of`, which is a DATE. Every publish on
 * 2026-07-31 carried as_of "2026-07-31", so `SEED.as_of > board.as_of` was false
 * for all four of them and the "newer board" notice never appeared: the owner
 * sat on the intake snapshot (nothing shipped) while main said 30 shipped, with
 * nothing on screen to tell him. A date cannot express "changed again today".
 *
 * Hashing the whole file means ANY change counts - a status, an evidence ref, a
 * note - which is the property the notice needs. It is derived at render time,
 * so nobody has to remember to bump a version by hand (and so it cannot be
 * forgotten, which is how this bug happened in the first place).
 */
/**
 * HASHED OVER `visible`, NOT OVER THE WHOLE BOARD, and the distinction is the
 * fingerprint's own contract. It answers "did the board data change" for a
 * browser holding an older snapshot. Hashing a card the viewer cannot see would
 * fire the staleness notice at somebody for whom nothing changed — a
 * notification about invisible data, which is noise that teaches people to
 * ignore the notice.
 */
const fingerprint = createHash("sha256").update(JSON.stringify(visible)).digest("hex").slice(0, 16);
// #board-data carries EXACTLY {...board, fingerprint} and nothing else. The
// config goes in its own island: merging it here would change these bytes, and
// would put non-board keys into SEED, which diffVsSeed and exportJSON would then
// round-trip straight into the committed JSON.
const dataIsland = JSON.stringify({ ...visible, fingerprint }).replace(/</g, "\\u003c");
const configIsland = JSON.stringify(config).replace(/</g, "\\u003c");

const lg = visible.launch_gate ?? { denominator: 9, conditions: [] };
const passed = (lg.conditions ?? []).filter((g) => g.state === "pass").length;
const denom = lg.denominator ?? 9;

const html = `<meta charset="utf-8" />
<title>${config.pageTitle}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<style>
${css}
</style>

<div class="wrap" id="app">
  <noscript style="display:block;padding:24px;font-family:system-ui;line-height:1.6">
    This portal is interactive and needs JavaScript. The source of truth is the
    committed file <code>${config.sourcePath}</code>.
  </noscript>
</div>

<script type="application/json" id="board-data">${dataIsland}</script>
<script type="application/json" id="board-config">${configIsland}</script>
<script>
${appJs}
</script>
`;

writeFileSync(outPath, html);
const lanes = {};
for (const c of visible.cards) lanes[c.lane] = (lanes[c.lane] ?? 0) + 1;
console.log(
  `rendered ${visible.cards.length} cards + ${passed}/${denom} gates (portal) -> ${outPath}`,
);
// REPORTED, NEVER SILENT. A render that quietly dropped cards would be
// indistinguishable from a render of a board that never had them.
if (hidden > 0) {
  console.log(
    `  external agenda: ${hidden} card(s) NOT rendered and NOT counted - see docs/board/EXTERNAL-AGENDA.md`,
  );
}
console.log(`  fingerprint: ${fingerprint}`);
console.log("  lanes: " + Object.entries(lanes).map(([k, v]) => `${k} ${v}`).join(", "));
