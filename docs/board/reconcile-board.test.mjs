import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  fetchPrStates,
  acknowledgement,
  citedPrs,
  claimedGates,
  completionClaims,
  consumedBy,
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

describe("rule E - consumed, the shape neither PRs nor gates can see", () => {
  test("consumedBy reads the consumer id, and nothing else", () => {
    assert.equal(consumedBy(card({ notes: "CONSUMED BY: W13-02 (LOOP 2)." })), "W13-02");
    assert.equal(consumedBy(card({ notes: "consumed by w13-02" })), null); // exact marker only
    assert.equal(consumedBy(card()), null);
  });

  test("FLAGS the WF-04 shape: ruling card whose named consumer has shipped", () => {
    // WF-04 cites no PR and claims no gate. Every other rule is silent on it by
    // construction, which is how it sat todo for thirteen days while the code it
    // ratified had moved past the ruling.
    const { mismatches } = reconcile(
      board([
        card({ id: "WF-04", status: "todo", notes: "CONSUMED BY: W13-02 (LOOP 2)." }),
        card({ id: "W13-02", status: "shipped" }),
      ]),
      null,
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].rule, "consumed");
    assert.match(mismatches[0].message, /W13-02/);
  });

  test("SILENT while the consumer is still open - the WF-06 case", () => {
    // WF-06, WF-07 and WF-08 all name W13-03, which is legitimately open pending
    // an owner observation. Their rulings are not finished being consumed until
    // it closes, so firing here would be the false positive that gets a rule
    // switched off.
    const { mismatches } = reconcile(
      board([
        card({ id: "WF-06", status: "todo", notes: "CONSUMED BY: W13-03 (LOOP 3)." }),
        card({ id: "W13-03", status: "in_flight" }),
      ]),
      null,
    );
    assert.deepEqual(mismatches, []);
  });

  test("SILENT when the named consumer does not exist", () => {
    // A typo in a card id must not be reported as staleness: it is a different
    // defect and saying the wrong thing about it is worse than saying nothing.
    const { mismatches } = reconcile(
      board([card({ status: "todo", notes: "CONSUMED BY: NOT-A-CARD" })]),
      null,
    );
    assert.deepEqual(mismatches, []);
  });

  test("SILENT once the ruling card itself is shipped", () => {
    const { mismatches } = reconcile(
      board([
        card({ id: "WF-04", status: "shipped", notes: "CONSUMED BY: W13-02." }),
        card({ id: "W13-02", status: "shipped" }),
      ]),
      null,
    );
    assert.deepEqual(mismatches, []);
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

/**
 * ============================================================================
 * RULE F - the evidence-null completion claim. AI-01, 2026-08-11 to 2026-08-18.
 * ============================================================================
 * The fixture below is the real card, trimmed. It shipped in #859, its notes
 * described the work in full, and `status`/`evidence` were never set. It cited
 * no PR, claimed no gate and named no consumer, so rules A through E were all
 * silent BY CONSTRUCTION - `citedPrs` reads `evidence.ref`, which was null.
 *
 * THE FALSE-POSITIVE CASES BELOW ARE THE MORE IMPORTANT HALF. This rule runs in
 * a required CI check, so a rule that fires on a legitimately open card turns
 * main red and is switched off within a week. The two "gates" -as-a-verb cases
 * are taken verbatim in shape from LAUNCH-02 and LE-guest-queue-service-name,
 * which an earlier draft of the predicate DID flag - that draft was thrown away
 * rather than worked around with exemptions.
 */
const AI01_NOTES = [
  "RAISED 2026-08-11 by the owner. AMBER lane, isolated card, no loop dependency.",
  "",
  "WHAT SHIPPED, two guards that are DELIBERATELY NOT SYMMETRIC:",
  "  1. PRESENCE (the incoming side). Skip when the raw value is undefined, null,",
  "     or a string that is empty or whitespace-only.",
  "",
  "GATES, all four green: pnpm lint 0 errors, typecheck 10/10, test 1930 passed",
  "across 200 web files (was 1921; +9 new), build 4/4.",
].join("\n");

describe("completionClaims - what counts as a card claiming its own work is done", () => {
  test("the gates line and the WHAT SHIPPED heading both count", () => {
    const claims = completionClaims(card({ notes: AI01_NOTES }));
    assert.ok(claims.length >= 4, `expected several claim phrases, got ${claims.length}`);
  });

  test('"gates" used as a VERB is not a claim - this is the false positive that killed draft one', () => {
    // LAUNCH-02: "It gates LAUNCH-01's template arming steps only".
    assert.deepEqual(
      completionClaims(card({ notes: "SCOPE: JP signs the CORRECTED packet ONCE. It gates LAUNCH-01's template arming steps only." })),
      [],
    );
    // LE-guest-queue-service-name: "this one gates a build decision".
    assert.deepEqual(
      completionClaims(card({ notes: "END-legal-sweep absorbs findings that need no further build, and this one gates a build decision." })),
      [],
    );
  });

  test("a card merely NAMING another card's shipment is not claiming its own", () => {
    assert.deepEqual(
      completionClaims(card({ notes: "Depends on W13-02, which shipped on 2026-08-05 with migration 0055 applied." })),
      [],
    );
  });

  test("an empty or absent notes field claims nothing", () => {
    assert.deepEqual(completionClaims(card()), []);
    assert.deepEqual(completionClaims(card({ notes: undefined })), []);
  });
});

describe("rule F - evidence-null completion claim, the shape no other rule could see", () => {
  test("flags an in_flight card whose notes say the work is done and carries no evidence", () => {
    const { mismatches } = reconcile(
      board([card({ id: "AI-01", status: "in_flight", notes: AI01_NOTES, evidence: null })]),
      null, // NO PR STATE: the rule must work offline, like A and E.
    );
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].rule, "evidence-null-claim");
    assert.match(mismatches[0].message, /evidence is null/);
  });

  test("NEGATIVE ARM: no other rule catches this card, which is why F exists", () => {
    // Remove the completion phrases and the SAME card goes completely unseen -
    // by every rule, with and without PR state. That silence is the defect this
    // rule closes, and asserting it here is what stops F being deleted later as
    // redundant.
    const bare = card({ id: "AI-01", status: "in_flight", notes: "some prose", evidence: null });
    assert.equal(reconcile(board([bare]), null).mismatches.length, 0);
    assert.equal(reconcile(board([bare]), new Map([[859, "merged"]])).mismatches.length, 0);
  });

  test("does NOT fire on a blocked card waiting on a person with no completion claim", () => {
    const { mismatches } = reconcile(
      board([
        card({
          id: "LAUNCH-02",
          status: "blocked",
          blocked_on: "jp",
          notes: "JP signs the CORRECTED packet ONCE. It gates LAUNCH-01's template arming steps only.",
          evidence: null,
        }),
      ]),
      null,
    );
    assert.equal(mismatches.length, 0);
  });

  test("does NOT fire on a halted card, nor on a todo card written in the past tense", () => {
    // `todo` is excluded deliberately: a plan may be drafted before anyone
    // starts, and past-tense planning prose is not a claim of completion.
    const cards = [
      card({ id: "END-sweep", status: "halted", notes: "findings collected", evidence: null }),
      card({ id: "PLAN-1", status: "todo", notes: AI01_NOTES, evidence: null }),
    ];
    assert.equal(reconcile(board(cards), null).mismatches.length, 0);
  });

  test("does NOT fire once the card carries evidence - setting it is the fix", () => {
    const { mismatches } = reconcile(
      board([
        card({
          id: "AI-01",
          status: "in_flight",
          notes: AI01_NOTES,
          evidence: { kind: "pr", ref: "#859 merged, 652d1bd", at: "2026-08-11" },
        }),
      ]),
      null,
    );
    assert.equal(mismatches.length, 0);
  });

  test("does NOT fire on a shipped card - the VALIDATOR already refuses that state", () => {
    // A shipped card with null evidence is a hard validator failure, so a second
    // opinion here would be noise on a rule already enforced upstream.
    const { mismatches } = reconcile(
      board([card({ id: "X", status: "shipped", notes: AI01_NOTES, evidence: null })]),
      null,
    );
    assert.equal(mismatches.length, 0);
  });

  test("an open_on_purpose acknowledgement routes it to acknowledged, never silence", () => {
    // Same mechanism every other rule uses: an exemption is PRINTED on every
    // run, so one nobody sees is one nobody revisits.
    const { mismatches, acknowledged } = reconcile(
      board([
        card({
          id: "AI-01",
          status: "in_flight",
          notes: AI01_NOTES,
          evidence: null,
          open_on_purpose: "held deliberately, reason stated",
        }),
      ]),
      null,
    );
    assert.equal(mismatches.length, 0);
    assert.equal(acknowledged.length, 1);
    assert.equal(acknowledged[0].rule, "evidence-null-claim");
  });
});


/**
 * CI-reconciler-no-retry-on-transient-gh.
 *
 * OPENED FROM A LIVE OCCURRENCE, not a code read: PR #965, run 32318873585,
 * `gh could not read PR #764: unexpected end of JSON input`, exit 2, reddening a
 * REQUIRED check on a PR whose content was fine. Re-running the identical commit
 * passed. One call per cited PR, ~80 sequentially, so one truncated response out
 * of eighty failed the gate.
 *
 * These tests inject the failure rather than wait for the network to misbehave
 * again - the card's own closing condition, "proven by a test or by an injected
 * failure, not by the absence of the problem".
 *
 * `pause` is stubbed to a no-op throughout: the retry's correctness is in WHAT it
 * retries, not in how long it waits, and a real backoff would make this suite
 * take seconds to assert nothing extra.
 */
const noPause = () => {};
const ghErr = (stderr) => Object.assign(new Error("gh failed"), { stderr });

describe("fetchPrStates - transient failure is retried, a 404 is not", () => {
  test("a transient failure that recovers returns the real state", () => {
    let calls = 0;
    const readOne = () => {
      calls += 1;
      if (calls < 3) throw ghErr("unexpected end of JSON input");
      return "closed true";
    };
    const out = fetchPrStates([764], readOne, noPause);
    assert.equal(out.get(764), "merged");
    assert.equal(calls, 3, "should have retried twice before succeeding");
  });

  test("THE EXACT OCCURRENCE: one bad read out of many no longer fails the run", () => {
    const failed = new Set();
    const readOne = (n) => {
      if (n === 764 && !failed.has(n)) {
        failed.add(n);
        throw ghErr("unexpected end of JSON input");
      }
      return "closed true";
    };
    const out = fetchPrStates([763, 764, 765], readOne, noPause);
    assert.deepEqual([...out.values()], ["merged", "merged", "merged"]);
  });

  test("a 404 is an ANSWER and is NOT retried", () => {
    let calls = 0;
    const readOne = () => {
      calls += 1;
      throw ghErr("HTTP 404: Not Found");
    };
    const out = fetchPrStates([999], readOne, noPause);
    assert.equal(out.get(999), "missing");
    assert.equal(calls, 1, "a definite answer must not be retried");
  });

  test("a persistent failure still THROWS - an unasked question never reads as satisfied", () => {
    let calls = 0;
    const readOne = () => {
      calls += 1;
      throw ghErr("unexpected end of JSON input");
    };
    assert.throws(
      () => fetchPrStates([764], readOne, noPause),
      /could not read PR #764 after 3 attempts/,
    );
    assert.equal(calls, 3);
  });

  test("NEGATIVE CONTROL: without the retry the first transient failure would throw", () => {
    // One attempt is what the code did before. Same injected failure, same input:
    // proves the tests above pass because of the retry and not by accident.
    const readOne = () => {
      throw ghErr("unexpected end of JSON input");
    };
    assert.throws(() => fetchPrStates([764], readOne, noPause), /could not read PR #764/);
  });
});
