#!/usr/bin/env node
// validate-board.mjs - a board's own definition of done.
//
// Governs BOTH boards, which share this schema exactly:
//   docs/board/prelaunch-board.json  "OsteoJP - Pre-Launch Board"  (platform)
//   docs/board/portal-board.json     "OsteoJP - Portal Board"      (portal)
//
// The committed JSON is the source of truth; the claude.ai artifact is only a
// RENDER of it. A board claim is never truth on its own - the `evidence` field
// carries the proof. This script enforces that.
//
// Exit 0 = board is well-formed and every shipped/passed claim carries evidence.
// Exit non-zero = at least one violation; every violation is printed.
//
// Usage:  node docs/board/validate-board.mjs [path-to-board.json]
//         (defaults to ./prelaunch-board.json next to this script)
//         node docs/board/validate-board.mjs docs/board/portal-board.json
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
// A card's KIND. `home_lane` is the only lane fact a human sets; `lane` is
// DERIVED from it plus the card's state (see deriveLane below), so the board can
// never show a card in a place its own status contradicts.
const KIND_LANES = ["in_flight", "rodica_batch", "incidents", "loose_ends"];
const PRIORITY = ["high", "medium", "low"];
// The boards this script governs. Same schema, same lane ids, same rules; they
// differ only in which workstream they track, so the name is a membership check
// rather than a second copy of this file.
const BOARD_NAMES = ["OsteoJP - Pre-Launch Board", "OsteoJP - Portal Board"];
// The BLOCKED ON PEOPLE lane is split by person, and WHICH people differs per
// board: the pre-launch board waits on Ivan/JP/Rodica, the portal board on
// Ivan/JP/Lawyer. So the set is read from that lane's own `columns` (below,
// after the board loads) and these are only the fallback for a board that omits
// them - which keeps the pre-launch board's behaviour byte-for-byte unchanged.
const DEFAULT_PEOPLE = ["ivan", "jp", "rodica"];
let PEOPLE = DEFAULT_PEOPLE;
const GATE = [
  "green_self_merge",
  "cyan_clear",
  "owner_merge",
  "owner_authorizo",
  "stakeholder",
];
let BLOCKED_ON = [null, ...PEOPLE, "infra"];
const EVIDENCE_KIND = ["pr", "journal", "sha256", "e2e", "screenshot"];

// ---- WF-01: THE BOARD CARD IS THE LOOP SPEC ---------------------------------
// Owner ruling 2026-08-04: wave docs end after Wave 13; from the next authored
// loop onward the board card carries the loop's full spec. This block is the
// enforcement half of that ruling.
//
// THE SEVEN SECTIONS ARE docs/loops/README.md's, NOT WF-01's PARENTHETICAL, and
// the two disagree - reported rather than reconciled silently. The card's gloss
// lists "briefing, scope and ground truth, ordered steps, definition of done,
// evidence, restrictions and scope boundary, halt-loud protocol - plus the
// report-back format", which is EIGHT items and includes a briefing that
// README.md's seven do not. The card itself defers to README.md ("the full
// 7-field Loop Package that docs/loops/README.md requires"), so README.md wins
// and the gloss is the loose part. `briefing` is allowed as an eighth,
// OPTIONAL section, because every LOOP block in WAVE-13.md carried one and the
// gloss is right that it is useful - it is simply not one of the seven.
const LOOP_SPEC_SECTIONS = [
  "scope_and_ground_truth",
  "ordered_steps",
  "definition_of_done",
  "verification",
  "restrictions_and_scope_boundary",
  "halt_loud_protocol",
  "report_back_format",
];
const LOOP_SPEC_OPTIONAL = ["briefing"];
// A card declares itself a loop. It is NOT inferred from the presence of `spec`.
// Inferring it would fail OPEN in exactly the case the ruling names - "a loop
// card without a spec must not be startable" - because a loop card carrying no
// spec at all would be indistinguishable from an ordinary card. PORTAL-REHYDRATE
// 1.3: an unhandled case that maps onto a harmless-looking known one is read as
// the harmless one.
const CARD_KIND = ["loop"];
// "Entering ready or doing", in the ruling's words. That vocabulary is
// docs/design/BACKLOG.md's (DRAFT -> WRITTEN -> READY -> IN-FLIGHT -> DONE),
// and this board's status enum has no such values. The mapping, stated because
// it is a translation and not an inference: a card is READY-or-DOING once it
// has left `todo` for work. `blocked` and `halted` are states of NOT working,
// so a loop card parked in either before it ever started owes no spec yet;
// `shipped` owes one because it cannot have got there without doing.
const LOOP_SPEC_REQUIRED_AT = ["in_flight", "shipped"];

// THE ONE HOLE, NAMED RATHER THAN PAPERED OVER: a loop card authored with
// neither `card_kind` nor `spec` is, to this script, an ordinary card. Nothing
// mechanical can tell them apart, because loop-ness is a fact about intent.
// What IS closed is the pair of half-states: a spec without the marker is
// rejected, and the marker without a spec cannot be started.
/**
 * DEFERRED. An owner ruling that a card is not to be built YET, carried as an
 * EXPLICIT FIELD rather than as a sentence in `notes`.
 *
 * WHY A FIELD AND NOT PROSE, which is settled doctrine here rather than a
 * preference: reconcile-board.mjs's header already states it for
 * `open_on_purpose` - "a prose marker stops matching the day somebody rewords a
 * sentence, and it fails OPEN - the check goes quiet and reports success". A
 * deferral that lives only in notes is invisible to the out-of-scope predicate
 * in PORTAL-REHYDRATE.md 4.11, so a later sweep would read the card as available
 * and build the thing the owner deferred. That is PORTAL-REHYDRATE 1.3 exactly:
 * an unhandled case wearing the face of a harmless known one.
 *
 * Non-empty string or absent. A bare `true` would defer a card without saying
 * who ruled it or when, and the why is the only part a later reader can act on -
 * the same argument `acknowledgement()` makes for `open_on_purpose`.
 *
 * A SHIPPED CARD CANNOT BE DEFERRED. Deferring built work is a contradiction,
 * and it is the shape a stale field would take if somebody shipped a card and
 * left the marker behind.
 */
function checkDeferred(id, card) {
  const d = card.deferred;
  if (d === undefined || d === null) return;
  if (typeof d !== "string" || d.trim() === "") {
    fail(id, `deferred must be a non-empty string saying who ruled it and when, or be absent`);
    return;
  }
  if (card.status === "shipped")
    fail(id, `status=shipped and deferred is set - built work cannot be deferred; drop the marker`);
}

/**
 * EXTERNAL AGENDA. Work the owner tracks somewhere else - legal review and
 * counsel, credential rotation, force-rotation of staff passwords, and
 * security-breach response - carried as an EXPLICIT FIELD for the same reason
 * `deferred` is one.
 *
 * WHY THE CARDS ARE NOT DELETED, which is the first thing a reader will ask.
 * THE LEDGER STAYS. A deleted card takes its history with it: what was found,
 * when, who ruled on it, and what the ruling was. That record is the only
 * durable account of a decision nobody wants to re-litigate, and it is worth
 * more than the tidiness of a shorter file. What the field removes is DUPLICATE
 * TRACKING - the card stops appearing on a board that implies engineering owes
 * work on it - not the record.
 *
 * `true` OR ABSENT, AND NEVER `false`. A field that means "not external" is
 * noise on 180 cards and invites `external_agenda: false` to spread through the
 * file, at which point the absence of the field stops meaning anything. The one
 * value it takes is the one that changes behaviour.
 *
 * A SHIPPED CARD MAY CARRY IT, which is where this differs from `deferred`.
 * Deferring built work is a contradiction; recording that built work is tracked
 * elsewhere is not, and several of these cards are closed rulings whose subject
 * is still owned off-board.
 *
 * THE FIELD IS SHAPE-CHECKED HERE AND NOTHING ELSE. Whether every flagged card
 * appears in `docs/board/EXTERNAL-AGENDA.md` is a PORTAL-BOARD question, and
 * this validator is shared with the platform board - so that cross-check lives
 * in `scripts/external-agenda-ledger.test.mjs` rather than here. PORTAL-REHYDRATE
 * 4.11's scope note is explicit that anything added to a shared instrument is
 * additive or it does not ship.
 */
function checkExternalAgenda(id, card) {
  const e = card.external_agenda;
  if (e === undefined || e === null) return;
  if (e !== true)
    fail(
      id,
      `external_agenda must be exactly true, or be absent - "false" is not a value it takes`,
    );
}

function checkLoopSpec(id, card) {
  const kind = card.card_kind ?? null;
  if (kind !== null && !CARD_KIND.includes(kind))
    fail(id, `card_kind "${kind}" not in ${CARD_KIND.join("|")}`);

  const spec = card.spec ?? null;
  if (spec !== null) {
    if (typeof spec !== "object" || Array.isArray(spec)) {
      fail(id, `spec must be an object with the ${LOOP_SPEC_SECTIONS.length} Loop Package sections`);
      return;
    }
    if (kind !== "loop") {
      fail(
        id,
        `carries a spec but card_kind is "${kind}" - a spec on a card that has not ` +
          `declared itself a loop is a missing marker, not a bonus field`,
      );
    }
    const allowed = [...LOOP_SPEC_SECTIONS, ...LOOP_SPEC_OPTIONAL];
    for (const key of Object.keys(spec)) {
      if (!allowed.includes(key))
        fail(id, `spec section "${key}" is not one of ${allowed.join("|")}`);
    }
    for (const key of Object.keys(spec)) {
      if (allowed.includes(key) && (typeof spec[key] !== "string" || spec[key].trim() === ""))
        fail(id, `spec.${key} must be a non-empty string`);
    }
  }

  if (kind === "loop" && LOOP_SPEC_REQUIRED_AT.includes(card.status)) {
    const present = spec && typeof spec === "object" && !Array.isArray(spec) ? spec : {};
    const missing = LOOP_SPEC_SECTIONS.filter(
      (k) => typeof present[k] !== "string" || present[k].trim() === "",
    );
    if (missing.length > 0)
      fail(
        id,
        `loop card is status=${card.status} with ${missing.length} of ` +
          `${LOOP_SPEC_SECTIONS.length} spec sections missing or empty (${missing.join(", ")}) - ` +
          `a loop card without its full spec must not be startable`,
      );
  }
}
/**
 * ============================================================================
 * RULINGS - RECORDED DECISIONS, WHICH ARE NOT WORK AND MUST NOT RENDER AS WORK.
 * ============================================================================
 * Owner ruling, 2026-08-27: "recorded rulings are not build work and must stop
 * rendering as to-do tasks."
 *
 * A ruling records a decision somebody took. It has no acceptance line, so
 * nothing can ever finish it, and for fifteen of them that produced a board
 * saying nine items were `todo` when not one of them was buildable by anybody.
 * The WF-* family sat in the IN FLIGHT lane for three weeks being counted as
 * open work, and every sweep that read the board had to know, out of band, that
 * those particular ids were not tasks. A section is what makes that structural
 * instead of tribal.
 *
 * THE FIELDS ARE THE WHOLE ARGUMENT, AND SO ARE THE ABSENT ONES.
 *
 *   id, ruling, date, ruled_by  - who decided what, and when.
 *   superseded_by               - null, or the id of the ruling that replaced
 *                                 it. A ruling is never deleted and never
 *                                 edited to record that it stopped applying;
 *                                 a later ruling supersedes it and the chain
 *                                 stays readable.
 *   governs                     - the cards or files it binds. Non-empty: a
 *                                 ruling that governs nothing is either
 *                                 finished history or was never a ruling, and
 *                                 in both cases somebody has to say which.
 *
 *   NO status. NO gate. NO evidence. NO acceptance. A ruling is not done or
 *   not done, so a status field on one could only ever be a lie, and `evidence`
 *   would invite somebody to "close" it. These are REJECTED rather than
 *   ignored: a ruling carrying `status: "todo"` is exactly the state this
 *   section exists to end, and silently dropping the field would let it back in
 *   through a hand edit.
 *
 * OPTIONAL: `title` (the headline the card carried), `notes` (its full record),
 * and `external_agenda`, which means here exactly what it means on a card.
 *
 * THE SECTION IS OPTIONAL. The platform board has no rulings, and a shared
 * instrument is additive or it does not ship (PORTAL-REHYDRATE 4.11). A board
 * with no `rulings` key is as valid as it was before this rule existed.
 */
const RULING_REQUIRED = ["id", "ruling", "date", "ruled_by", "superseded_by", "governs"];
const RULING_OPTIONAL = ["title", "notes", "external_agenda"];
// The card-only fields, named one by one rather than by a catch-all "unknown
// key" rule, so the failure message says WHY the field is refused rather than
// only that it is unexpected.
const RULING_FORBIDDEN = {
  status: "a ruling is not done or not done - a status on one can only be a lie",
  gate: "nothing merges a ruling, so there is nothing for a gate to govern",
  evidence: "evidence proves work finished; a ruling has no work to finish",
  acceptance: "a card with a machine-checkable acceptance is WORK - move it to cards[]",
  lane: "rulings render in their own view and never in a lane",
  home_lane: "rulings render in their own view and never in a lane",
  blocked_on: "nothing is blocked on a decision that has already been taken",
  card_kind: "a ruling is not a loop card",
  spec: "a ruling is not a loop card",
  deferred: "a ruling is not built, so it cannot be deferred",
  open_on_purpose: "the reconciler's card exemption; a ruling is never open in that sense",
  priority: "rulings are not scheduled, so they carry no priority",
  owner_terminal: "no terminal owns a decision the owner took",
  last_checkpoint: "a ruling does not progress, so it has no checkpoint",
};

function checkRuling(id, r, ruleIds) {
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    fail(id, `ruling must be an object`);
    return;
  }
  for (const key of RULING_REQUIRED) {
    if (!(key in r)) fail(id, `ruling is missing required field "${key}"`);
  }
  for (const [key, why] of Object.entries(RULING_FORBIDDEN)) {
    if (key in r) fail(id, `ruling carries "${key}" - ${why}`);
  }
  const allowed = [...RULING_REQUIRED, ...RULING_OPTIONAL];
  for (const key of Object.keys(r)) {
    if (!allowed.includes(key) && !(key in RULING_FORBIDDEN))
      fail(id, `ruling field "${key}" is not one of ${allowed.join("|")}`);
  }

  if (typeof r.ruling !== "string" || r.ruling.trim() === "")
    fail(id, `ruling text must be a non-empty string - the decision itself, in the words it was taken in`);
  if (!isValidIso(r.date)) fail(id, `ruling date "${r.date}" is not an ISO 8601 date/timestamp`);
  if (typeof r.ruled_by !== "string" || r.ruled_by.trim() === "")
    fail(id, `ruled_by must name who took the decision`);

  // null, or a ruling that EXISTS. A supersession pointing at nothing breaks
  // the only chain that records why a ruling stopped applying.
  const sup = r.superseded_by ?? null;
  if (sup !== null) {
    if (typeof sup !== "string" || sup.trim() === "") {
      fail(id, `superseded_by must be null or the id of the ruling that replaced it`);
    } else if (!ruleIds.has(sup)) {
      fail(id, `superseded_by "${sup}" names no ruling on this board`);
    } else if (sup === r.id) {
      fail(id, `superseded_by names itself`);
    }
  }

  if (!Array.isArray(r.governs) || r.governs.length === 0) {
    fail(id, `governs must be a non-empty array of the card ids or file paths this ruling binds`);
  } else {
    for (const g of r.governs) {
      if (typeof g !== "string" || g.trim() === "")
        fail(id, `governs entries must be non-empty strings`);
    }
  }

  if ("title" in r && (typeof r.title !== "string" || r.title.trim() === ""))
    fail(id, `title, when present, must be a non-empty string`);
  if ("notes" in r && typeof r.notes !== "string")
    fail(id, `notes, when present, must be a string`);
  if ("external_agenda" in r && r.external_agenda !== true)
    fail(id, `external_agenda must be exactly true, or be absent - "false" is not a value it takes`);
}

const GATE_STATE = ["pass", "fail"];
const LAUNCH_GATE_DENOMINATOR = 9;

// ISO 8601: date-only or full timestamp; must also parse to a real date.
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

/**
 * THE DERIVATION (BOARD-SPEC.md "Lane is derived"). Marking a card done moves it
 * to Shipped; naming a person on a blocked work item moves it to Blocked on
 * people. Incidents and inbox items keep their kind while blocked - they are
 * categories, not states.
 */
function deriveLane(card) {
  if (card.status === "shipped") return "shipped";
  const home = KIND_LANES.includes(card.home_lane) ? card.home_lane : "in_flight";
  if (home === "in_flight" && card.status === "blocked" && PEOPLE.includes(card.blocked_on)) {
    return "blocked_on_people";
  }
  return home;
}

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
if (!BOARD_NAMES.includes(board.board)) {
  fail("board", `board name must be one of ${BOARD_NAMES.map((n) => `"${n}"`).join(" | ")}, got "${board.board}"`);
}

// The people columns are a property of THIS board's people lane. Read them
// before any card is checked, since blocked_on and deriveLane both depend on
// them. A board without columns keeps the historical set.
const peopleLane = (Array.isArray(board.lanes) ? board.lanes : []).find(
  (l) => l?.id === "blocked_on_people",
);
if (Array.isArray(peopleLane?.columns) && peopleLane.columns.length > 0) {
  PEOPLE = peopleLane.columns;
  BLOCKED_ON = [null, ...PEOPLE, "infra"];
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

// ---- rulings ----------------------------------------------------------------
// Recorded decisions. Checked BEFORE the cards, because the id namespace is
// shared: a ruling and a card may not carry the same id, or `governs` and every
// cross-reference on the board becomes ambiguous.
const rulings = Array.isArray(board.rulings) ? board.rulings : [];
if (board.rulings !== undefined && !Array.isArray(board.rulings))
  fail("rulings", `rulings must be an array, or be absent`);
const rulingIds = new Set();
for (const r of rulings) {
  const id = r?.id ?? "ruling?";
  if (rulingIds.has(id)) fail(id, `duplicate ruling id`);
  rulingIds.add(id);
}
for (const r of rulings) checkRuling(r?.id ?? "ruling?", r, rulingIds);

// ---- cards -------------------------------------------------------------------
const cards = Array.isArray(board.cards) ? board.cards : [];
const seenIds = new Set();
for (const card of cards) {
  const id = card.id ?? "card?";
  if (seenIds.has(id)) fail(id, `duplicate card id`);
  if (rulingIds.has(id))
    fail(
      id,
      `id exists in BOTH cards[] and rulings[] - a move is a MOVE, and a card left ` +
        `behind under the same id would be counted as work and recorded as a decision at once`,
    );
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
  if (card.lane === "blocked_on_people" && !PEOPLE.includes(card.blocked_on))
    fail(id, `lane=blocked_on_people requires blocked_on in ${PEOPLE.join("|")}, got "${card.blocked_on}"`);

  // ---- home_lane + priority (optional in older files, required from v2) ----
  if (!KIND_LANES.includes(card.home_lane))
    fail(id, `home_lane "${card.home_lane}" not in ${KIND_LANES.join("|")} - it is the card's KIND, never a state lane`);
  if (!PRIORITY.includes(card.priority ?? "medium"))
    fail(id, `priority "${card.priority}" not in ${PRIORITY.join("|")}`);

  // ---- THE SECOND RULE: the stored lane must equal the derived lane. -------
  // This is what keeps a card from sitting in the wrong place after its status
  // changes: the board computes the lane, and a hand-edit that disagrees is a
  // red gate, not a silent inconsistency.
  const derived = deriveLane(card);
  if (card.lane !== derived)
    fail(id, `lane "${card.lane}" contradicts status/blocked_on - derived lane is "${derived}"`);

  // ---- WF-01: a loop card carries its own spec, or it is not startable ----
  // ADDITIVE. A card with neither `card_kind` nor `spec` is untouched by this,
  // which is what keeps the platform board - and every existing card on both
  // boards - byte-for-byte as valid as it was.
  checkLoopSpec(id, card);

  // ---- an owner deferral is a FIELD, so the sweep predicate can see it ----
  checkDeferred(id, card);
  checkExternalAgenda(id, card);
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
// COUNTED SEPARATELY AND NEVER ADDED IN. A ruling is not an open card and not a
// shipped one, so folding it into either number would restate the problem the
// section exists to end.
if (rulings.length > 0) {
  const superseded = rulings.filter((r) => (r.superseded_by ?? null) !== null).length;
  console.log(
    `  rulings: ${rulings.length} recorded decision(s), NOT cards and NOT counted above` +
      (superseded > 0 ? ` (${superseded} superseded)` : ""),
  );
}
process.exit(0);
