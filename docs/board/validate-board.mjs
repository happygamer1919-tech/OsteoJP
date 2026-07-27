#!/usr/bin/env node
// validate-board.mjs - the Pre-Launch Board's own definition of done.
//
// The committed JSON (docs/board/prelaunch-board.json) is the source of truth;
// the claude.ai artifact is only a RENDER of it. A board claim is never truth on
// its own - the `evidence` field carries the proof. This script enforces that.
//
// Exit 0 = board is well-formed and every shipped/passed claim carries evidence.
// Exit non-zero = at least one violation; every violation is printed.
//
// Usage:  node docs/board/validate-board.mjs [path-to-board.json]
//         (defaults to ./prelaunch-board.json next to this script)
//
// Zero dependencies. Node ESM. Never writes; read-only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const boardPath = resolve(process.argv[2] ?? `${HERE}/prelaunch-board.json`);

// ---- enums (kept in lock-step with docs/board/BOARD-SPEC.md) ----------------
const LANES_IN_ORDER = [
  "launch_gate",
  "blocked_on_people",
  "in_flight",
  "rodica_batch",
  "incidents",
  "loose_ends",
  "shipped",
];
const STATUS = ["todo", "in_flight", "halted", "blocked", "shipped"];
const GATE = [
  "green_self_merge",
  "cyan_clear",
  "owner_merge",
  "owner_authorizo",
  "stakeholder",
];
const BLOCKED_ON = [null, "ivan", "jp", "rodica", "infra"];
const EVIDENCE_KIND = ["pr", "journal", "sha256", "e2e", "screenshot"];
const GATE_STATE = ["pass", "fail"];
const LAUNCH_GATE_DENOMINATOR = 9;

// ISO 8601: date-only or full timestamp; must also parse to a real date.
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

const violations = [];
const fail = (id, msg) => violations.push(`[${id}] ${msg}`);

function isValidIso(v) {
  return typeof v === "string" && ISO_RE.test(v) && !Number.isNaN(Date.parse(v));
}

// evidence is null, OR {kind, ref, at} with a valid kind, non-empty ref, ISO at.
function checkEvidence(ownerId, evidence) {
  if (evidence === null || evidence === undefined) return false; // present? no.
  if (typeof evidence !== "object" || Array.isArray(evidence)) {
    fail(ownerId, `evidence must be null or an object, got ${typeof evidence}`);
    return false;
  }
  let ok = true;
  if (!EVIDENCE_KIND.includes(evidence.kind)) {
    fail(ownerId, `evidence.kind "${evidence.kind}" not in ${EVIDENCE_KIND.join("|")}`);
    ok = false;
  }
  if (typeof evidence.ref !== "string" || evidence.ref.trim() === "") {
    fail(ownerId, `evidence.ref must be a non-empty string`);
    ok = false;
  }
  if (!isValidIso(evidence.at)) {
    fail(ownerId, `evidence.at "${evidence.at}" is not an ISO 8601 date/timestamp`);
    ok = false;
  }
  return ok; // "has real evidence"
}

// ---- load --------------------------------------------------------------------
let board;
try {
  board = JSON.parse(readFileSync(boardPath, "utf8"));
} catch (err) {
  console.error(`FATAL: cannot read/parse ${boardPath}\n  ${err.message}`);
  process.exit(2);
}

// ---- top-level ---------------------------------------------------------------
if (board.board !== "OsteoJP - Pre-Launch Board") {
  fail("board", `board name must be "OsteoJP - Pre-Launch Board", got "${board.board}"`);
}

// ---- lanes (exact set + order) ----------------------------------------------
const laneIds = Array.isArray(board.lanes) ? board.lanes.map((l) => l.id) : [];
if (JSON.stringify(laneIds) !== JSON.stringify(LANES_IN_ORDER)) {
  fail(
    "lanes",
    `lanes must be exactly [${LANES_IN_ORDER.join(", ")}] in order, got [${laneIds.join(", ")}]`,
  );
}

// ---- launch gate (lane 1: pass/fail conditions, denominator fixed at 9) ------
const lg = board.launch_gate ?? {};
const conds = Array.isArray(lg.conditions) ? lg.conditions : [];
if (lg.denominator !== LAUNCH_GATE_DENOMINATOR) {
  fail("launch_gate", `denominator must be ${LAUNCH_GATE_DENOMINATOR}, got ${lg.denominator}`);
}
if (conds.length !== LAUNCH_GATE_DENOMINATOR) {
  fail("launch_gate", `expected ${LAUNCH_GATE_DENOMINATOR} conditions, got ${conds.length}`);
}
const gateIds = new Set();
let passed = 0;
for (const c of conds) {
  const id = c.id ?? "G?";
  if (gateIds.has(id)) fail("launch_gate", `duplicate gate id ${id}`);
  gateIds.add(id);
  if (!GATE_STATE.includes(c.state)) {
    fail(id, `gate state "${c.state}" not in ${GATE_STATE.join("|")} (no partial credit)`);
    continue;
  }
  if (!BLOCKED_ON.includes(c.blocked_on ?? null)) {
    fail(id, `blocked_on "${c.blocked_on}" not in ${BLOCKED_ON.map(String).join("|")}`);
  }
  const hasEvidence = checkEvidence(id, c.evidence ?? null);
  if (c.state === "pass") {
    passed += 1;
    // A pass without proof is the same anti-pattern as a shipped card with no
    // evidence: readiness is only as real as its evidence.
    if (!hasEvidence) fail(id, `gate is state=pass but evidence is null - a passed gate MUST carry proof`);
  }
}
// readiness is COUNTED, never estimated: passed / 9.
if (typeof lg.readiness_passed === "number" && lg.readiness_passed !== passed) {
  fail("launch_gate", `readiness_passed says ${lg.readiness_passed} but ${passed} conditions are state=pass`);
}

// ---- cards -------------------------------------------------------------------
const cards = Array.isArray(board.cards) ? board.cards : [];
const seenIds = new Set();
for (const card of cards) {
  const id = card.id ?? "card?";
  if (seenIds.has(id)) fail(id, `duplicate card id`);
  seenIds.add(id);

  if (typeof card.title !== "string" || card.title.trim() === "")
    fail(id, `title must be a non-empty string`);

  // lane must be a real lane, and not launch_gate (gate lives in launch_gate).
  if (!LANES_IN_ORDER.includes(card.lane)) fail(id, `lane "${card.lane}" is not a known lane`);
  if (card.lane === "launch_gate")
    fail(id, `cards may not live in the launch_gate lane (use launch_gate.conditions)`);

  if (!STATUS.includes(card.status)) fail(id, `status "${card.status}" not in ${STATUS.join("|")}`);
  if (!GATE.includes(card.gate)) fail(id, `gate "${card.gate}" not in ${GATE.join("|")}`);
  if (!BLOCKED_ON.includes(card.blocked_on ?? null))
    fail(id, `blocked_on "${card.blocked_on}" not in ${BLOCKED_ON.map(String).join("|")}`);

  if (!isValidIso(card.last_checkpoint))
    fail(id, `last_checkpoint "${card.last_checkpoint}" is not an ISO 8601 date/timestamp`);

  const hasEvidence = checkEvidence(id, card.evidence ?? null);

  // ---- THE RULE: shipped without evidence is forbidden. -----------------
  if (card.status === "shipped" && !hasEvidence)
    fail(id, `status=shipped but evidence is null - a shipped card MUST carry evidence`);

  // A blocked card blocked on nothing is a defect - it hides who we wait on.
  if (card.status === "blocked" && (card.blocked_on ?? null) === null)
    fail(id, `status=blocked but blocked_on is null - name who/what it is blocked on`);

  // The BLOCKED ON PEOPLE lane is split by person; every card there needs one.
  if (card.lane === "blocked_on_people" && !["ivan", "jp", "rodica"].includes(card.blocked_on))
    fail(id, `lane=blocked_on_people requires blocked_on in ivan|jp|rodica, got "${card.blocked_on}"`);
}

// ---- report ------------------------------------------------------------------
if (violations.length > 0) {
  console.error(`BOARD INVALID - ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

const laneCount = (id) => cards.filter((c) => c.lane === id).length;
console.log(`BOARD VALID  ${boardPath}`);
console.log(`  launch readiness: ${passed}/${LAUNCH_GATE_DENOMINATOR} gates passed (counted, not estimated)`);
console.log(`  cards: ${cards.length} across lanes ->`);
for (const id of LANES_IN_ORDER.filter((l) => l !== "launch_gate"))
  console.log(`    ${id.padEnd(18)} ${laneCount(id)}`);
process.exit(0);
