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

describe("external_agenda is a field, and it takes exactly one value", () => {
  // WHY THESE EXIST. The field REMOVES a card from the rendered artifact and from
  // every count on it, so a malformed one either hides a card nobody meant to
  // hide or fails to hide one that was meant to go. Both are silent on the page,
  // which is the only place most readers look.

  test("ACCEPTS a card flagged true", () => {
    const r = validate([{ ...ORDINARY, status: "todo", external_agenda: true }]);
    assert.equal(r.code, 0, r.err);
  });

  test("ACCEPTS a SHIPPED card flagged true - the ledger stays", () => {
    // This is where it differs from `deferred`, deliberately. Deferring built
    // work is a contradiction; recording that built work is tracked elsewhere is
    // not, and several of these cards are closed rulings whose subject is still
    // owned off-board.
    const r = validate([
      {
        ...ORDINARY,
        status: "shipped",
        lane: "shipped",
        evidence: { kind: "pr", ref: "#1", at: "2026-08-20" },
        external_agenda: true,
      },
    ]);
    assert.equal(r.code, 0, r.err);
  });

  test("REJECTS false - a field meaning 'not external' makes absence mean nothing", () => {
    const r = validate([{ ...ORDINARY, status: "todo", external_agenda: false }]);
    assert.equal(r.code, 1);
    assert.match(r.err, /external_agenda must be exactly true/);
  });

  test("REJECTS a string, which is the shape a copied `deferred` would take", () => {
    const r = validate([{ ...ORDINARY, status: "todo", external_agenda: "legal" }]);
    assert.equal(r.code, 1);
    assert.match(r.err, /external_agenda must be exactly true/);
  });

  test("ACCEPTS a card with no external_agenda field at all - it is additive", () => {
    const r = validate([{ ...ORDINARY, status: "todo" }]);
    assert.equal(r.code, 0, r.err);
  });
});

describe("an owner deferral is a field, so the sweep predicate can see it", () => {
  // WHY THESE EXIST. The deferral's whole job is to be visible to the
  // out-of-scope predicate in PORTAL-REHYDRATE.md 4.11. A deferral that lives
  // only in `notes` is invisible to it, and a later sweep would build the thing
  // the owner deferred - reading an unhandled case as the harmless known one,
  // which is PORTAL-REHYDRATE 1.3. So the field is validated in both directions.

  test("ACCEPTS a deferred card carrying a reason", () => {
    const r = validate([{ ...ORDINARY, status: "todo", deferred: "DEFERRED by owner ruling 2026-08-20." }]);
    assert.equal(r.code, 0, r.err);
  });

  // The negative arm of the test above.
  test("REJECTS an empty deferral - a marker with no why is not actionable", () => {
    const r = validate([{ ...ORDINARY, status: "todo", deferred: "   " }]);
    assert.equal(r.code, 1);
    assert.match(r.err, /deferred must be a non-empty string/);
  });

  test("REJECTS a bare true, for the reason open_on_purpose rejects one", () => {
    const r = validate([{ ...ORDINARY, status: "todo", deferred: true }]);
    assert.equal(r.code, 1);
    assert.match(r.err, /deferred must be a non-empty string/);
  });

  test("REJECTS a shipped card that is still marked deferred", () => {
    const r = validate([
      {
        ...ORDINARY,
        status: "shipped",
        lane: "shipped",
        evidence: { kind: "pr", ref: "#1", at: "2026-08-20" },
        deferred: "DEFERRED by owner ruling 2026-08-20.",
      },
    ]);
    assert.equal(r.code, 1);
    assert.match(r.err, /built work cannot be deferred/);
  });

  // The adjacent state that must NOT be flagged: shipped, marker dropped.
  test("ACCEPTS a shipped card with the marker dropped", () => {
    const r = validate([
      {
        ...ORDINARY,
        status: "shipped",
        lane: "shipped",
        evidence: { kind: "pr", ref: "#1", at: "2026-08-20" },
      },
    ]);
    assert.equal(r.code, 0, r.err);
  });

  test("ACCEPTS a card with no deferred field at all - it is additive", () => {
    const r = validate([{ ...ORDINARY, status: "todo" }]);
    assert.equal(r.code, 0, r.err);
  });

  // A LIVE assertion, not a fixture: the card the 2026-08-20 ruling deferred
  // must actually carry the marker. A fixture proves the rule works; this proves
  // the rule is APPLIED to the card it was written for.
  test("the card deferred on 2026-08-20 carries the marker on the real board", () => {
    const board = JSON.parse(readFileSync(REAL_PORTAL, "utf8"));
    const card = board.cards.find((c) => c.id === "LE-portal-multi-appointment-booking");
    assert.ok(card, "LE-portal-multi-appointment-booking is missing from the board");
    assert.equal(typeof card.deferred, "string");
    assert.match(card.deferred, /2026-08-20/, "the deferral must say when it was ruled");
  });
});
