import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgement,
  citedPrs,
  claimedGates,
  reconcile,
} from "./reconcile-board.mjs";

/**
 * The reconciler's own proof.
 *
 * IT IS A CHECK, SO ITS FAILURE MODE IS SILENCE, and a silent check is
 * indistinguishable from a board that is in sync. Every rule here is therefore
 * asserted in BOTH directions: the state that must be flagged, and the adjacent
 * state that must NOT be, because a rule that flags everything gets switched off
 * within a week and a rule that flags nothing was never protection.
 *
 * The fixtures below are the real cases this project has actually produced -
 * W13-06's three cards citing no PR at all, the four LE-* cards that recorded
 * "#843 OPEN" after #843 merged, and INC-11 shipping on a production read while
 * its prose named the open PR where the failure was first seen.
 */

const board = (cards, gates = {}) => ({
  cards,
  launch_gate: {
    conditions: Object.entries(gates).map(([id, state]) => ({ id, state })),
  },
});

const card = (over = {}) => ({
  id: "CARD-1",
  title: "a card",
  status: "todo",
  notes: "",
  evidence: null,
  ...over,
});

describe("citedPrs", () => {
  test("reads PR numbers from evidence.ref only", () => {
    const c = card({
      evidence: { kind: "pr", ref: "shipped in #843, squashed to 45f05c4" },
      notes: "blocked for a while on #999",
    });
    // #999 is in the NOTES. Notes narrate - they name blockers, neighbours and
    // things to read. evidence.ref is the only field whose whole job is to be
    // the claim, so it is the only one whose numbers are treated as one.
    assert.deepEqual(citedPrs(c), [843]);
  });

  test("de-duplicates and sorts", () => {
    const c = card({ evidence: { kind: "pr", ref: "#843 and #12 and #843 again" } });
    assert.deepEqual(citedPrs(c), [12, 843]);
  });

  test("returns nothing for a card with no evidence", () => {
    assert.deepEqual(citedPrs(card()), []);
  });
});

describe("claimedGates", () => {
  test("finds the claim wherever it is written, case-insensitively", () => {
    assert.deepEqual(claimedGates(card({ notes: "Closes PG6. Provisional id." })), ["PG6"]);
    assert.deepEqual(claimedGates(card({ title: "closes pg1 eventually" })), ["PG1"]);
  });

  test("does not invent a claim from a bare gate mention", () => {
    // "PG6 is passing" is a statement about the world, not a claim to close it.
    assert.deepEqual(claimedGates(card({ notes: "PG6 is already passing, see above" })), []);
  });
});

describe("acknowledgement", () => {
  test("requires a non-empty reason", () => {
    assert.equal(acknowledgement(card({ open_on_purpose: "because X" })), "because X");
    // A bare `true` would let somebody silence a rule without saying why, and
    // the why is the only part a later reader can act on.
    assert.equal(acknowledgement(card({ open_on_purpose: true })), null);
    assert.equal(acknowledgement(card({ open_on_purpose: "   " })), null);
    assert.equal(acknowledgement(card()), null);
  });
});

describe("rule A - gate-claim, the one that needs no network", () => {
  test("FLAGS the W13-06 shape: unfinished card claiming a gate that already passes", () => {
    // The three W13-06 cards cited NO PR AT ALL, so every PR-based rule was
    // silent on them for six days. This is the rule that catches them.
    const { mismatches } = reconcile(
      board([card({ id: "W13-06a", status: "todo", notes: "Closes PG6." })], { PG6: "pass" }),
      null,
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].rule, "gate-claim");
    assert.match(mismatches[0].message, /PG6/);
  });

  test("SILENT when the gate has not passed yet - that is just work remaining", () => {
    const { mismatches } = reconcile(
      board([card({ status: "todo", notes: "Closes PG6." })], { PG6: "fail" }),
      null,
    );
    assert.deepEqual(mismatches, []);
  });

  test("SILENT once the card is shipped", () => {
    const { mismatches } = reconcile(
      board([card({ status: "shipped", notes: "Closes PG6." })], { PG6: "pass" }),
      null,
    );
    assert.deepEqual(mismatches, []);
  });
});

describe("rule C - stale-card, the '#843 OPEN' shape", () => {
  const merged = new Map([[843, "merged"]]);

  test("FLAGS an unfinished card whose cited PR has merged", () => {
    const { mismatches } = reconcile(
      board([card({ status: "in_flight", evidence: { kind: "pr", ref: "#843 OPEN" } })]),
      merged,
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].rule, "stale-card");
  });

  test("SILENT when the cited PR is still open", () => {
    const { mismatches } = reconcile(
      board([card({ status: "in_flight", evidence: { kind: "pr", ref: "#843" } })]),
      new Map([[843, "open"]]),
    );
    assert.deepEqual(mismatches, []);
  });
});

describe("rule B - shipped-unmerged, and the false positive it had on day one", () => {
  test("FLAGS a card shipped on a PR that never landed", () => {
    const { mismatches } = reconcile(
      board([card({ status: "shipped", evidence: { kind: "pr", ref: "shipped in #900" } })]),
      new Map([[900, "closed"]]),
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].rule, "shipped-unmerged");
  });

  test("SILENT when any cited PR merged - the others are narration", () => {
    const { mismatches } = reconcile(
      board([
        card({
          status: "shipped",
          evidence: { kind: "pr", ref: "shipped in #843; found by #917" },
        }),
      ]),
      new Map([
        [843, "merged"],
        [917, "open"],
      ]),
    );
    assert.deepEqual(mismatches, []);
  });

  test("SILENT for a card whose evidence is NOT a PR - the INC-11 case", () => {
    // INC-11 shipped on kind "journal": a production read the owner ran. Its ref
    // names #917 because that is where the failure was first SEEN. Reading that
    // number as a shipping claim flagged a card with nothing wrong with it, on
    // the first real run, and taught exactly the wrong lesson: strip citations.
    const { mismatches } = reconcile(
      board([
        card({
          status: "shipped",
          evidence: { kind: "journal", ref: "closed on a prod read; found by #917" },
        }),
      ]),
      new Map([[917, "open"]]),
    );
    assert.deepEqual(mismatches, []);
  });
});

describe("rule D - a citation pointing at nothing", () => {
  test("FLAGS a PR that does not exist", () => {
    const { mismatches } = reconcile(
      board([card({ status: "shipped", evidence: { kind: "pr", ref: "#4242 and #843" } })]),
      new Map([
        [843, "merged"],
        [4242, "missing"],
      ]),
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].rule, "pr-missing");
    assert.match(mismatches[0].message, /#4242/);
  });
});

describe("acknowledgement moves a finding, it does not delete it", () => {
  const stale = () =>
    board([
      card({
        id: "LE-x",
        status: "in_flight",
        evidence: { kind: "pr", ref: "#843" },
        open_on_purpose: "waiting on the owner's deployed-screen check",
      }),
    ]);

  test("an acknowledged finding leaves the mismatch list", () => {
    const { mismatches } = reconcile(stale(), new Map([[843, "merged"]]));
    assert.deepEqual(mismatches, []);
  });

  test("and appears in ACKNOWLEDGED, carrying its reason", () => {
    // The reason is printed on every run. An exemption nobody sees is an
    // exemption nobody revisits, which is how the four LE-* cards sat for a week.
    const { acknowledged } = reconcile(stale(), new Map([[843, "merged"]]));
    assert.equal(acknowledged.length, 1);
    assert.equal(acknowledged[0].id, "LE-x");
    assert.match(acknowledged[0].ack, /deployed-screen/);
  });
});

describe("THE COUNTERWEIGHT: a board that is genuinely in sync produces nothing", () => {
  test("no rule fires on a correct board", () => {
    // Without this, every assertion above would still pass if `reconcile` simply
    // flagged everything it was given.
    const { mismatches, acknowledged } = reconcile(
      board(
        [
          card({ id: "A", status: "shipped", evidence: { kind: "pr", ref: "#843" } }),
          card({ id: "B", status: "todo", notes: "Closes PG6." }),
          card({ id: "C", status: "in_flight", evidence: { kind: "pr", ref: "#900" } }),
        ],
        { PG6: "fail" },
      ),
      new Map([
        [843, "merged"],
        [900, "open"],
      ]),
    );
    assert.deepEqual(mismatches, []);
    assert.deepEqual(acknowledged, []);
  });
});
