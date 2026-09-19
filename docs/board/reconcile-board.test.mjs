import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchPrStates,
  acknowledgement,
  citedPrs,
  claimedGates,
  completionClaims,
  consumedBy,
  degradedPrStates,
  mergedFromSubjects,
  reconcile,
  reconcileRulings,
  run,
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

/**
 * CI-reconciler-403-offline-fallback. Owner ruling D2, 2026-09-19.
 *
 * OPENED FROM THREE LIVE OCCURRENCES ON ONE PR. #1399, runs 35349914675,
 * 35442130654 and 35442683579: `CANNOT VERIFY: gh could not read PR #760 after 3
 * attempts: gh: API rate limit exceeded for installation. ... (HTTP 403)`, exit 2,
 * on a PR whose board was fine. The board cites 246 PRs, the reconciler asks
 * GitHub about each one in turn, and every auto-update of every open PR runs it
 * again on the same installation token. A six-second backoff cannot outlast an
 * hourly quota, so the retry alone was never going to be the answer.
 *
 * THE RULING: retry with backoff, then fall back to offline mode AND SAY SO.
 *
 * THE TRAP IN THAT RULING, and the reason half of this suite exists: the offline
 * mode this file already had skips every PR rule, so falling back to IT would
 * turn a rate limit into a pass for a stale card - the one defect the reconciler
 * was written to catch. So the fallback brings its own merge truth: the squash
 * subjects in git history. A merged PR stays merged, which makes "git says
 * merged" a definite answer, and the stale-card rule keeps its teeth.
 *
 * Every arm below is paired. The seeded 403 that must PASS sits next to the
 * seeded 403 that must still FAIL.
 */
const RATE_LIMIT_403 =
  "gh: API rate limit exceeded for installation. If you reach out to GitHub Support " +
  "for help, please include the request ID and timestamp. (HTTP 403)";
const FORBIDDEN_403 = "gh: Resource not accessible by integration (HTTP 403)";
const alwaysRateLimited = () => {
  throw ghErr(RATE_LIMIT_403);
};
const staleCard = () =>
  card({ status: "in_flight", evidence: { kind: "pr", ref: "#843 OPEN" } });
const rateLimitedRun = (cards, merged, extra = {}) =>
  run({
    board: board(cards),
    boardPath: "fixture.json",
    offline: false,
    fetch: (wanted) => fetchPrStates(wanted, alwaysRateLimited, noPause),
    gitMerged: () => merged,
    ...extra,
  });

describe("fetchPrStates - a rate-limit 403 is retried, then NAMED rather than thrown blind", () => {
  test("retried three times with a growing pause, then throws RATE_LIMITED carrying what it learned", () => {
    const pauses = [];
    const readOne = (n) => {
      if (n === 763) return "closed true";
      throw ghErr(RATE_LIMIT_403);
    };
    let caught = null;
    try {
      fetchPrStates([763, 764, 765], readOne, (s) => pauses.push(s));
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "an exhausted rate limit must still throw out of fetchPrStates");
    assert.equal(caught.code, "RATE_LIMITED");
    assert.equal(caught.pr, 764);
    assert.deepEqual(pauses, [2, 4], "backoff must grow, and must stop at the FIRST exhausted PR");
    // What the API DID answer before the quota ran out is kept. Run 35442130654
    // died at #1033 with some 130 good answers in hand and threw them all away.
    assert.equal(caught.partial.get(763), "merged");
    assert.equal(caught.partial.has(765), false, "it must not walk the rest at six seconds each");
  });

  test("a rate limit that lifts on the second attempt returns the real state", () => {
    let calls = 0;
    const readOne = () => {
      calls += 1;
      if (calls === 1) throw ghErr(RATE_LIMIT_403);
      return "open false";
    };
    assert.equal(fetchPrStates([764], readOne, noPause).get(764), "open");
  });

  test("THE CLASSIFIER, as a table: every rate-limit wording is named with its status, and nothing else is", () => {
    const codeOf = (stderr) => {
      try {
        fetchPrStates([764], () => { throw ghErr(stderr); }, noPause);
      } catch (err) {
        return [err.code, err.status];
      }
      return ["did not throw"];
    };
    assert.deepEqual(codeOf(RATE_LIMIT_403), ["RATE_LIMITED", 403]);
    assert.deepEqual(
      codeOf("gh: You have exceeded a secondary rate limit. Please wait a few minutes before you try again. (HTTP 403)"),
      ["RATE_LIMITED", 403],
    );
    assert.deepEqual(codeOf("gh: API rate limit exceeded (HTTP 429)"), ["RATE_LIMITED", 429]);
    // The negatives. A token that may not ask, a server error that mentions
    // nothing, and a header name that merely contains the word.
    assert.deepEqual(codeOf(FORBIDDEN_403), [undefined, undefined]);
    assert.deepEqual(codeOf("gh: Bad Gateway (HTTP 502)"), [undefined, undefined]);
    assert.deepEqual(codeOf("X-RateLimit-Remaining: 0 (HTTP 403)"), [undefined, undefined]);
  });

  test("a 403 that is NOT a rate limit carries no RATE_LIMITED code - a token defect stays red", () => {
    let caught = null;
    try {
      fetchPrStates([764], () => { throw ghErr(FORBIDDEN_403); }, noPause);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught);
    assert.equal(caught.code, undefined);
    assert.match(caught.message, /could not read PR #764 after 3 attempts/);
  });
});

describe("mergedFromSubjects - merge truth that needs no network", () => {
  test("takes the TRAILING squash number and the merge-commit number, and nothing narrated", () => {
    const merged = mergedFromSubjects([
      "board: a card (#843)",
      'Revert "sched: a thing (#12)" (#900)',
      "Merge pull request #77 from someone/branch",
      "mentions #55 mid-line and nothing else",
      "no tag at all",
      "",
    ]);
    assert.deepEqual([...merged].sort((a, b) => a - b), [77, 843, 900]);
  });
});

describe("degradedPrStates - an API answer wins, git answers merged, the rest is UNKNOWN", () => {
  test("never invents 'missing', 'open' or 'closed' for a PR nobody answered for", () => {
    const out = degradedPrStates([10, 11, 12], new Map([[10, "open"]]), new Set([11]));
    assert.equal(out.get(10), "open");
    assert.equal(out.get(11), "merged");
    assert.equal(out.get(12), "unknown");
  });
});

describe("run - the rate-limit fallback, both directions", () => {
  test("SEEDED 403, board in sync: PASSES, and says it fell back to offline mode", () => {
    const shipped = card({ status: "shipped", evidence: { kind: "pr", ref: "#843 merged" } });
    const r = rateLimitedRun([shipped], { merged: new Set([843]), shallow: false, ref: "origin/main" });
    assert.equal(r.code, 0);
    assert.match(r.out.join("\n"), /OFFLINE FALLBACK/);
    assert.match(r.err.join("\n"), /::warning title=Reconciler fell back to offline mode::/);
    assert.match(r.err.join("\n"), /rate limit/i);
    // Exit 0 is ALSO what "nothing could be verified" looks like, so this arm
    // must show git answered: nothing unverified, one PR credited to git.
    assert.doesNotMatch(r.out.join("\n"), /UNVERIFIED \(/);
    assert.match(r.err.join("\n"), /0 answered by the API, 1 answered by git, 0 could not be asked/);
  });

  test("SEEDED 403 AND A SEEDED STALE CARD: STILL FAILS. The fallback is not an amnesty", () => {
    const r = rateLimitedRun([staleCard()], { merged: new Set([843]), shallow: false, ref: "origin/main" });
    assert.equal(r.code, 1);
    assert.match(r.err.join("\n"), /\[stale-card\] CARD-1/);
    assert.match(r.out.join("\n"), /OFFLINE FALLBACK/);
  });

  test("NEGATIVE CONTROL: the same card with #843 absent from git is UNVERIFIED, printed, and not a finding", () => {
    // Proves the arm above fails because git SAID merged, and not because the
    // fallback flags every cited card it could not ask about.
    const r = rateLimitedRun([staleCard()], { merged: new Set(), shallow: false, ref: "origin/main" });
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.err.join("\n"), /\[stale-card\]/);
    assert.match(r.out.join("\n"), /UNVERIFIED \(1\)/);
    assert.match(r.out.join("\n"), /CARD-1: #843/);
  });

  test("UNKNOWN never becomes a finding: no shipped-unmerged and no pr-missing on a PR nobody could ask about", () => {
    const shipped = card({ status: "shipped", evidence: { kind: "pr", ref: "#900" } });
    const r = rateLimitedRun([shipped], { merged: new Set(), shallow: false, ref: "origin/main" });
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.err.join("\n"), /shipped-unmerged|pr-missing/);
    assert.match(r.out.join("\n"), /UNVERIFIED \(1\)/);
  });

  test("A SHALLOW CLONE CANNOT ANSWER: exit 2, naming the 403 AND the clone", () => {
    // depth 1 is what actions/checkout gives by default, and its history holds
    // one subject. Trusting it would call every cited PR unknown and pass.
    const r = rateLimitedRun([staleCard()], { merged: new Set(), shallow: true, ref: "HEAD" });
    assert.equal(r.code, 2);
    assert.match(r.err.join("\n"), /rate limit/i);
    assert.match(r.err.join("\n"), /shallow/i);
  });

  test("git itself failing is exit 2, never a pass", () => {
    const r = rateLimitedRun([staleCard()], null, {
      gitMerged: () => {
        throw new Error("git: not a repository");
      },
    });
    assert.equal(r.code, 2);
    assert.match(r.err.join("\n"), /not a repository/);
  });

  test("a NON-rate-limit 403 does not fall back at all: exit 2, exactly as before", () => {
    let askedGit = false;
    const r = run({
      board: board([staleCard()]),
      boardPath: "fixture.json",
      offline: false,
      fetch: (wanted) => fetchPrStates(wanted, () => { throw ghErr(FORBIDDEN_403); }, noPause),
      gitMerged: () => {
        askedGit = true;
        return { merged: new Set([843]), shallow: false, ref: "origin/main" };
      },
    });
    assert.equal(r.code, 2);
    assert.equal(askedGit, false);
    assert.match(r.err.join("\n"), /CANNOT VERIFY/);
  });

  test("the ONLINE path is untouched: a stale card fails, a synced board passes, no fallback is mentioned", () => {
    const online = (cards, states) =>
      run({ board: board(cards), boardPath: "fixture.json", offline: false, fetch: () => new Map(states), gitMerged: () => { throw new Error("git must not be asked online"); } });
    const bad = online([staleCard()], [[843, "merged"]]);
    assert.equal(bad.code, 1);
    assert.match(bad.err.join("\n"), /\[stale-card\] CARD-1/);
    const good = online([staleCard()], [[843, "open"]]);
    assert.equal(good.code, 0);
    assert.doesNotMatch(good.out.join("\n") + good.err.join("\n"), /OFFLINE FALLBACK|fell back/);
  });

  test("explicit --offline is unchanged: PR rules skipped, and it says so", () => {
    const r = run({ board: board([staleCard()]), boardPath: "fixture.json", offline: true, fetch: () => { throw new Error("must not fetch"); }, gitMerged: () => { throw new Error("must not ask git"); } });
    assert.equal(r.code, 0);
    assert.match(r.out.join("\n"), /PR rules skipped \(--offline\)/);
  });
});

/**
 * THE SAME TWO ARMS THROUGH THE REAL PROCESS. Everything above injects `fetch`
 * and `gitMerged`, so it proves run() and nothing about main(), the real `gh`
 * call, the real `git log`, or the exit code a CI step actually sees. Here a
 * fake `gh` that answers every call with the observed 403 is put first on PATH,
 * the board lives in a throwaway git repository of three commits, the middle one
 * being the squash of #843, and the script is spawned exactly as
 * `pnpm board:reconcile` spawns it.
 *
 * All four processes run at once because each really does wait out the backoff.
 */
describe("CLI - a seeded 403 through the real process", () => {
  const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "reconcile-board.mjs");

  // HERMETIC AGAINST THE CALLER'S GIT. A hook, or `git rebase --exec`, exports
  // GIT_DIR and its siblings, and with those inherited the `git init`, `add` and
  // `commit` below would land on the REAL repository. A global commit.gpgsign
  // would open a pinentry inside spawnSync, and a global hooksPath would run
  // somebody's hooks in a temp dir. So: no inherited GIT_*, no global or system
  // config, and a timeout on every synchronous git call.
  const cleanEnv = (extra = {}) => {
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("GIT_")) delete env[k];
    return { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...extra };
  };

  /** `originMain`: also publish HEAD as refs/remotes/origin/main, the ref CI reads.
   *  `shallow`: run from a depth-1 clone of the fixture, what actions/checkout
   *  gives by default. */
  const spawnReconcile = (cards, { originMain = false, shallow = false } = {}) => {
    const root = mkdtempSync(join(tmpdir(), "reconcile-403-"));
    const bin = join(root, "bin");
    const src = join(root, "src");
    mkdirSync(bin);
    mkdirSync(src);
    const cleanup = () => rmSync(root, { recursive: true, force: true });
    const git = (cwd, ...args) => {
      const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
        cwd,
        encoding: "utf8",
        env: cleanEnv(),
        timeout: 30_000,
      });
      assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
    };
    // A setup that throws (git missing, git slow) must not leave its root behind.
    let work = src;
    try {
      const fakeGh = join(bin, "gh");
      writeFileSync(fakeGh, `#!/bin/sh\necho "${RATE_LIMIT_403}" >&2\nexit 1\n`);
      chmodSync(fakeGh, 0o755);
      writeFileSync(join(src, "board.json"), JSON.stringify(board(cards)));
      git(src, "init", "-q");
      git(src, "add", "board.json");
      git(src, "commit", "-q", "-m", "an older commit, so that depth 1 really does drop history");
      git(src, "commit", "-q", "--allow-empty", "-m", "board: the squash of the cited PR (#843)");
      git(src, "commit", "-q", "--allow-empty", "-m", "a later commit that names no PR");
      if (originMain) git(src, "update-ref", "refs/remotes/origin/main", "HEAD");
      if (shallow) {
        work = join(root, "depth1");
        git(root, "clone", "-q", "--depth", "1", `file://${src}`, work);
      }
    } catch (setupFailure) {
      cleanup();
      throw setupFailure;
    }
    return new Promise((done, failed) => {
      const child = spawn(process.execPath, [SCRIPT, join(work, "board.json")], {
        cwd: work,
        env: cleanEnv({ PATH: `${bin}${delimiter}${process.env.PATH}` }),
        timeout: 60_000,
      });
      child.on("error", (spawnFailure) => {
        cleanup();
        failed(spawnFailure);
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (code) => {
        cleanup();
        done({ code, stdout, stderr });
      });
    });
  };

  test("in sync exits 0 with OFFLINE FALLBACK, a stale card exits 1, and a depth-1 clone exits 2 - one run", async () => {
    const shipped = card({ status: "shipped", evidence: { kind: "pr", ref: "#843 merged" } });
    const [synced, stale, viaOriginMain, shallow] = await Promise.all([
      spawnReconcile([shipped]),
      spawnReconcile([staleCard()]),
      spawnReconcile([staleCard()], { originMain: true }),
      spawnReconcile([staleCard()], { shallow: true }),
    ]);
    assert.equal(synced.code, 0, synced.stderr);
    assert.match(synced.stdout, /OFFLINE FALLBACK/);
    assert.match(synced.stderr, /fell back to offline mode/);
    // Exit 0 is also what "nothing could be verified" looks like. This is what
    // says git really did answer for #843.
    assert.doesNotMatch(synced.stdout, /UNVERIFIED \(/);
    assert.match(synced.stdout, /git history \(HEAD\)/);

    assert.equal(stale.code, 1, stale.stderr);
    assert.match(stale.stderr, /\[stale-card\] CARD-1/);
    assert.match(stale.stdout, /OFFLINE FALLBACK/);

    // THE REF CI ACTUALLY TAKES. With refs/remotes/origin/main present the real
    // gitMergedPrs must read it, and say so.
    assert.equal(viaOriginMain.code, 1, viaOriginMain.stderr);
    assert.match(viaOriginMain.stdout, /git history \(origin\/main\)/);

    // THE GUARD BETWEEN A DEPTH-1 CLONE AND "every PR unknown, exit 0", through
    // the real `git rev-parse --is-shallow-repository`.
    assert.equal(shallow.code, 2, shallow.stdout + shallow.stderr);
    // The message's own words, and both causes. The fixture directory is named
    // `depth1` so that no path in an unrelated FATAL line can satisfy this.
    assert.match(shallow.stderr, /SHALLOW clone/);
    assert.match(shallow.stderr, /rate limit/i);
    assert.doesNotMatch(shallow.stdout, /no mismatches/);
  });
});

/**
 * ============================================================================
 * RULINGS - THE TWO THINGS THAT CAN BE FALSE ABOUT A DECISION
 * ============================================================================
 * Every rule above asks whether a card's STATUS still matches the repository. A
 * ruling has none, which is precisely how the WF-* family sat `todo` for three
 * weeks while rule E - written for that family - could only see the two of them
 * that happened to name a consumer. So the rulings get their own pass, with the
 * only two questions that have an answer, and both arms of each.
 */
const ruling = (over = {}) => ({
  id: "R-1",
  ruling: "the decision",
  date: "2026-08-27",
  ruled_by: "owner",
  superseded_by: null,
  governs: ["CARD-1"],
  ...over,
});

describe("rule G - a ruling governing a card that is gone", () => {
  test("FLAGS a governs entry naming no card and no ruling", () => {
    const out = reconcileRulings({ cards: [card({ id: "CARD-1" })], rulings: [ruling({ governs: ["CARD-9"] })] });
    assert.equal(out.length, 1);
    assert.equal(out[0].rule, "governs-ghost");
    assert.match(out[0].message, /governs "CARD-9"/);
  });

  test("SILENT when the card exists - the adjacent state", () => {
    const out = reconcileRulings({ cards: [card({ id: "CARD-1" })], rulings: [ruling()] });
    assert.deepEqual(out, []);
  });

  test("SILENT when it governs another RULING", () => {
    const out = reconcileRulings({
      cards: [],
      rulings: [ruling({ governs: ["R-2"] }), ruling({ id: "R-2", governs: ["CARD-1"] })],
    });
    // R-2 governs CARD-1, which does not exist, so exactly one finding - and it
    // is NOT the one about R-2 being unknown.
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "R-2");
  });

  // THE FALSE POSITIVE THIS RULE WOULD OTHERWISE HAVE ON DAY ONE. `governs`
  // carries file paths and prose as well as ids, and a rule demanding every
  // entry resolve to a card would fire on every ruling on the real board.
  test("SILENT on a file path", () => {
    const out = reconcileRulings({ cards: [], rulings: [ruling({ governs: ["apps/web/lib/reminders/templates.ts"] })] });
    assert.deepEqual(out, []);
  });

  test("SILENT on a sentence", () => {
    const out = reconcileRulings({
      cards: [],
      rulings: [ruling({ governs: ["every patient-visible card on this board"] })],
    });
    assert.deepEqual(out, []);
  });
});

describe("rule H - a supersession chain that loops", () => {
  test("FLAGS a two-step cycle, which the validator cannot see", () => {
    const out = reconcileRulings({
      cards: [card({ id: "CARD-1" })],
      rulings: [ruling({ id: "R-1", superseded_by: "R-2" }), ruling({ id: "R-2", superseded_by: "R-1" })],
    });
    assert.equal(out.filter((f) => f.rule === "supersede-cycle").length, 2);
  });

  test("SILENT on a straight chain - the adjacent state", () => {
    const out = reconcileRulings({
      cards: [card({ id: "CARD-1" })],
      rulings: [
        ruling({ id: "R-1", superseded_by: "R-2" }),
        ruling({ id: "R-2", superseded_by: "R-3" }),
        ruling({ id: "R-3" }),
      ],
    });
    assert.deepEqual(out, []);
  });
});

describe("the counterweight: the real board's rulings reconcile clean", () => {
  test("a board with no rulings key produces nothing, and does not throw", () => {
    assert.deepEqual(reconcileRulings({ cards: [card()] }), []);
  });

  test("the card rules never see a ruling - it is not in cards[]", () => {
    // The structural half of the fix. Even a ruling shaped like the stalest card
    // this project has produced cannot reach rules A-F, because they iterate
    // board.cards and a ruling is not there.
    const out = reconcile(
      { cards: [], rulings: [ruling({ notes: "WHAT SHIPPED: everything. closes PG1" })], launch_gate: { conditions: [{ id: "PG1", state: "pass" }] } },
      null,
    );
    assert.deepEqual(out.mismatches, []);
  });
});
