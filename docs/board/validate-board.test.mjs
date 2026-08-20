import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The validator's own proof, for WF-01's rule: a loop card carries its full
 * spec, or it is not startable.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT EXISTS ON THE DAY THE RULE SHIPS.
 * The rule fires on ZERO cards today - no card on either board is a loop card,
 * because the eight Wave 13 loops all shipped before the ruling was executed
 * and the ruling is forward-looking ("from the NEXT authored loop onward"). A
 * guard that cannot fire is the exact defect this project keeps finding in its
 * own instruments: LEARNINGS.md entry 5 (a negative control that changed
 * nothing and reported a pass), and the `test.skip()` row in PORTAL-REHYDRATE
 * 1.3. So every rule below is asserted in BOTH directions - the state that must
 * be rejected, and the ADJACENT state that must be accepted - against fixtures
 * that exercise the rule rather than against a board that cannot reach it.
 *
 * THE VALIDATOR HAS NO EXPORTS. It reads argv and runs. So these tests spawn it
 * as a subprocess, which is also the only form that proves the EXIT CODE - and
 * the exit code is what CI reads.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(HERE, "validate-board.mjs");
const REAL_PORTAL = join(HERE, "portal-board.json");
const REAL_PLATFORM = join(HERE, "prelaunch-board.json");

const TMP = mkdtempSync(join(tmpdir(), "board-validate-"));
let seq = 0;

/** A real board with its cards replaced, so lanes, gate and denominator are
 *  never the thing under test. */
function boardWith(cards) {
  const board = JSON.parse(readFileSync(REAL_PORTAL, "utf8"));
  board.cards = cards;
  const path = join(TMP, `board-${seq++}.json`);
  writeFileSync(path, JSON.stringify(board, null, 2));
  return path;
}

function validate(cards) {
  const r = spawnSync(process.execPath, [VALIDATOR, boardWith(cards)], { encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const ORDINARY = {
  id: "ORD-1",
  title: "An ordinary card that knows nothing about loops",
  lane: "in_flight",
  home_lane: "in_flight",
  status: "in_flight",
  priority: "medium",
  owner_terminal: "purple",
  gate: "green_self_merge",
  evidence: null,
  blocked_on: null,
  last_checkpoint: "2026-08-20",
  notes: "",
};

const SECTIONS = [
  "scope_and_ground_truth",
  "ordered_steps",
  "definition_of_done",
  "verification",
  "restrictions_and_scope_boundary",
  "halt_loud_protocol",
  "report_back_format",
];

const fullSpec = () => Object.fromEntries(SECTIONS.map((k) => [k, `the ${k} section, written out`]));

const loopCard = (over = {}) => ({
  ...ORDINARY,
  id: "LOOP-1",
  title: "A loop card",
  card_kind: "loop",
  spec: fullSpec(),
  ...over,
});

describe("the committed boards are unaffected - the rule is additive", () => {
  // THE CONTROL FOR THE WHOLE FEATURE. If either real board went red, the rule
  // would not be additive, whatever the fixtures say.
  for (const [name, path] of [["portal", REAL_PORTAL], ["platform", REAL_PLATFORM]]) {
    test(`the real ${name} board still validates`, () => {
      const r = spawnSync(process.execPath, [VALIDATOR, path], { encoding: "utf8" });
      assert.equal(r.status, 0, `${name} board went red:\n${r.stderr}`);
    });
  }

  test("a card with neither card_kind nor spec is untouched", () => {
    const r = validate([ORDINARY]);
    assert.equal(r.code, 0, r.err);
  });
});

describe("a loop card must carry all seven sections before it is startable", () => {
  test("ACCEPTS a complete loop card that is in_flight", () => {
    const r = validate([loopCard({ status: "in_flight" })]);
    assert.equal(r.code, 0, r.err);
  });

  // The negative arm of the test above: same card, one section removed.
  for (const missing of SECTIONS) {
    test(`REJECTS an in_flight loop card missing ${missing}`, () => {
      const spec = fullSpec();
      delete spec[missing];
      const r = validate([loopCard({ status: "in_flight", spec })]);
      assert.equal(r.code, 1, "a loop card missing a section must not validate");
      assert.match(r.err, new RegExp(missing), "the error must NAME the missing section");
      assert.match(r.err, /must not be startable/);
    });
  }

  test("REJECTS an in_flight loop card with no spec at all", () => {
    const c = loopCard({ status: "in_flight" });
    delete c.spec;
    const r = validate([c]);
    assert.equal(r.code, 1);
    assert.match(r.err, /7 spec sections missing/);
  });

  test("REJECTS a section present but empty - a blank is not a section", () => {
    const spec = fullSpec();
    spec.definition_of_done = "   ";
    const r = validate([loopCard({ status: "in_flight", spec })]);
    assert.equal(r.code, 1);
    assert.match(r.err, /definition_of_done/);
  });

  test("REJECTS a shipped loop card with no spec - shipped implies it was doing", () => {
    const c = loopCard({ status: "shipped", lane: "shipped", evidence: { kind: "pr", ref: "#1", at: "2026-08-20" } });
    delete c.spec;
    const r = validate([c]);
    assert.equal(r.code, 1);
    assert.match(r.err, /status=shipped/);
  });
});

describe("the statuses where the rule deliberately does NOT fire", () => {
  // These are the mapping's stated consequences, asserted so that a later
  // reader can see the boundary was chosen rather than overlooked.
  test("ACCEPTS a todo loop card with no spec - authoring one is allowed", () => {
    const c = loopCard({ status: "todo" });
    delete c.spec;
    const r = validate([c]);
    assert.equal(r.code, 0, r.err);
  });

  test("ACCEPTS a blocked loop card with no spec - blocked is not doing", () => {
    const c = loopCard({ status: "blocked", blocked_on: "ivan", lane: "blocked_on_people" });
    delete c.spec;
    const r = validate([c]);
    assert.equal(r.code, 0, r.err);
  });

  test("ACCEPTS a halted loop card with no spec", () => {
    const c = loopCard({ status: "halted" });
    delete c.spec;
    const r = validate([c]);
    assert.equal(r.code, 0, r.err);
  });
});

describe("the half-states, which are the ones that would fail open", () => {
  test("REJECTS a spec on a card that has not declared itself a loop", () => {
    // Without this, a loop card whose author forgot the marker would validate
    // with a half-written spec and be startable. The marker is not inferred
    // FROM the spec precisely so that this case is loud.
    const c = loopCard({ status: "in_flight" });
    delete c.card_kind;
    const r = validate([c]);
    assert.equal(r.code, 1);
    assert.match(r.err, /a missing marker, not a bonus field/);
  });

  test("REJECTS an unknown card_kind", () => {
    const r = validate([loopCard({ card_kind: "lopo" })]);
    assert.equal(r.code, 1);
    assert.match(r.err, /card_kind "lopo"/);
  });

  test("REJECTS a misspelled spec section instead of silently counting it missing", () => {
    const spec = fullSpec();
    spec.ordered_stpes = spec.ordered_steps;
    delete spec.ordered_steps;
    const r = validate([loopCard({ status: "in_flight", spec })]);
    assert.equal(r.code, 1);
    assert.match(r.err, /ordered_stpes/, "the typo itself must be named, not only the absence");
  });

  test("REJECTS a spec that is not an object", () => {
    const r = validate([loopCard({ status: "in_flight", spec: "everything, honestly" })]);
    assert.equal(r.code, 1);
    assert.match(r.err, /spec must be an object/);
  });
});

describe("briefing is the optional eighth section", () => {
  // docs/loops/README.md defines SEVEN and does not include a briefing; WF-01's
  // parenthetical lists eight and does. README.md wins on what is REQUIRED, and
  // briefing is allowed rather than rejected, because every LOOP block in
  // WAVE-13.md carried one.
  test("ACCEPTS a loop card carrying a briefing as well", () => {
    const r = validate([loopCard({ status: "in_flight", spec: { ...fullSpec(), briefing: "paste this" } })]);
    assert.equal(r.code, 0, r.err);
  });

  test("ACCEPTS a complete loop card that omits the briefing", () => {
    const r = validate([loopCard({ status: "in_flight" })]);
    assert.equal(r.code, 0, r.err);
  });
});
