#!/usr/bin/env node
// reconcile-board.mjs - does the board still agree with the repository?
//
// The validator next door answers "is this board WELL-FORMED". This answers a
// different and, so far, more expensive question: "is this board TRUE".
//
// ============================================================================
// WHY THIS EXISTS. FOUR CARDS, FOUR DISPATCHES, THE SAME FAILURE.
// ============================================================================
// Nothing in this repository reconciled a merged PR against the card that
// claimed the work. So cards went stale in one direction only - work shipped,
// the card kept saying todo - and every reader downstream believed the card:
//
//   LE-env-sweep-scope, LE-portal-supabase-residue, LE-trusted-device-revoke
//     each recorded "#843 OPEN" for four days after #843 merged.
//   LE-portal-booking-therapist-step carried "CARDED, NOT BUILT" for three days
//     after #857 shipped it, and TWO dispatches said "DO NOT START A2" on the
//     strength of it.
//   W13-06, W13-06a and W13-06b carried todo for six days after LOOP 6 shipped,
//     and a dispatch named W13-06 as the next card to BUILD. That one is the
//     reason this script exists: the cost had stopped being bookkeeping.
//
// A stale card does not look like a defect. It looks like work remaining, which
// is the most ordinary thing on a board - which is why a human reading the board
// will never catch it and a machine reading both sides always will.
//
// ============================================================================
// THE RULE THAT MATTERS MOST NEEDS NO NETWORK, AND THAT IS NOT AN ACCIDENT
// ============================================================================
// The W13-06 family cited NO PR AT ALL. A check that only compares cited PR
// numbers against merge state would have stayed silent on them forever, which is
// how they survived six days and four other checks. What gave them away was
// structural: three cards claiming to close PG6 while PG6 was already passing.
//
// So GATE-CLAIM (rule A) is local, runs always, and is the rule with teeth. The
// PR-state rules are worth having and they are not the ones that caught this.
//
// ============================================================================
// ACKNOWLEDGED IS NOT SILENCED
// ============================================================================
// A card may legitimately stay open after its PR merges: this project's WF-03
// ruling says a staff- or patient-visible card closes on the owner's DEPLOYED
// SCREEN, not on green CI, so "merged but still in_flight" is the normal state
// for a whole class of cards.
//
// That escape is an EXPLICIT FIELD, `open_on_purpose: "<reason>"`, never a phrase
// matched out of the notes. A prose marker stops matching the day somebody
// rewords a sentence, and it fails OPEN - the check goes quiet and reports
// success, which is the exact shape of every defect this project has logged
// under PORTAL-REHYDRATE 1.3. A missing field cannot be reworded.
//
// Acknowledged cards are PRINTED IN FULL on every run rather than skipped. An
// exemption nobody sees is an exemption nobody revisits.
//
// Usage:
//   node docs/board/reconcile-board.mjs [board.json] [--offline]
//
// Exit 0 = every card agrees with the repository (acknowledged items listed).
// Exit 1 = at least one mismatch.
// Exit 2 = could not verify (unreadable board, or no GitHub access without
//          --offline). NEVER exits 0 on a check it did not perform.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ pure ---
 * Everything below this line is a pure function of its inputs, so the suite in
 * reconcile-board.test.mjs can exercise every rule - including its negative arm -
 * without a board file, a network, or a GitHub token.
 */

/** PR numbers a card cites, from its evidence ref only.
 *
 *  DELIBERATELY NOT THE NOTES. Notes narrate: they name PRs that blocked this
 *  card, PRs that shipped something adjacent, PRs a future session should read.
 *  `evidence.ref` is the field whose entire job is "this is what proves the
 *  card's state", so it is the only field whose PR numbers are a CLAIM. */
export function citedPrs(card) {
  const ref = card?.evidence?.ref;
  if (typeof ref !== "string") return [];
  return [...new Set([...ref.matchAll(/#(\d{2,5})\b/g)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  );
}

/** Launch-gate ids a card claims to close ("Closes PG6", "closes pg6"). */
export function claimedGates(card) {
  const blob = [card?.title, card?.notes, card?.evidence?.ref]
    .filter((v) => typeof v === "string")
    .join("\n");
  return [...new Set([...blob.matchAll(/\bcloses\s+(PG[1-9])\b/gi)].map((m) => m[1].toUpperCase()))];
}

/**
 * The card this one names as consuming its output ("CONSUMED BY: W13-02").
 *
 * THE THIRD SHAPE OF STALENESS, and the reason this rule was added a day after
 * the other four. A RULING card carries no work of its own: it records an owner
 * decision that some other card exists to consume. So it cites no PR, and it
 * claims to close no gate - both PR rules and the gate-claim rule are silent on
 * it by construction.
 *
 * WF-04 ratified growing the patient-change contract from 2 kinds to 4. The
 * contract on main carries FIVE. Its named consumer, W13-02, shipped on
 * 2026-08-05 with migration 0055 applied to production. The card said `todo`,
 * and a dispatch named it as the next thing to build.
 *
 * The rule is deliberately narrow: it fires only when the consumer is SHIPPED.
 * WF-06, WF-07 and WF-08 all name W13-03, which is legitimately open pending an
 * owner observation, and they stay silent - correctly, because their rulings are
 * not finished being consumed until that card closes.
 */
export function consumedBy(card) {
  const m = (typeof card?.notes === "string" ? card.notes : "").match(
    /CONSUMED BY:\s*([A-Za-z0-9][A-Za-z0-9-]*)/,
  );
  return m ? m[1] : null;
}

/** The acknowledgement, or null. Must be a non-empty string: a bare `true`
 *  would let somebody silence a rule without saying why, and the why is the
 *  only part a later reader can act on. */
export function acknowledgement(card) {
  const v = card?.open_on_purpose;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

const FINISHED = "shipped";

/**
 * Every disagreement between the board and the repository.
 *
 * `prState` maps a PR number to "merged" | "open" | "closed" | "missing", or is
 * null when the PR rules were not run.
 */
export function reconcile(board, prState) {
  const gateState = new Map(
    (board?.launch_gate?.conditions ?? []).map((c) => [c.id, c.state]),
  );
  const byId = new Map((board?.cards ?? []).map((c) => [c.id, c]));
  const mismatches = [];
  const acknowledged = [];

  const record = (card, rule, message) => {
    const ack = acknowledgement(card);
    (ack ? acknowledged : mismatches).push({ id: card.id, rule, message, ack });
  };

  for (const card of board?.cards ?? []) {
    const finished = card.status === FINISHED;

    // RULE A - GATE CLAIM. Local. The one that catches a card citing no PR.
    for (const gate of claimedGates(card)) {
      if (gateState.get(gate) === "pass" && !finished) {
        record(
          card,
          "gate-claim",
          `claims to close ${gate}, and ${gate} already passes, but status is "${card.status}"`,
        );
      }
    }

    // RULE E - CONSUMED BY. Local, like rule A, and for the same reason: the
    // cards it catches cite nothing a network could check.
    const consumerId = consumedBy(card);
    if (consumerId && !finished) {
      const consumer = byId.get(consumerId);
      if (consumer?.status === FINISHED) {
        record(
          card,
          "consumed",
          `names ${consumerId} as its consumer, and ${consumerId} has shipped, but status is "${card.status}"`,
        );
      }
    }

    if (!prState) continue;

    const cited = citedPrs(card);
    if (cited.length === 0) continue;
    const stateOf = (pr) => prState.get(pr) ?? "missing";

    // RULE D - a citation pointing at nothing. Per PR, because each one is its
    // own broken reference and the number is the whole of the finding.
    for (const pr of cited) {
      if (stateOf(pr) === "missing") {
        record(card, "pr-missing", `evidence cites #${pr}, which does not exist`);
      }
    }

    const merged = cited.filter((pr) => stateOf(pr) === "merged");

    // RULES B AND C ARE CARD-LEVEL, AND THAT IS A CORRECTION MADE ON THE FIRST
    // REAL RUN RATHER THAN A DESIGN CHOICE MADE UP FRONT.
    //
    // Per-PR, rule B flagged INC-11: a card shipped on a production read, whose
    // evidence NARRATES the PR where the failure was first seen (#917, still
    // open by design). Nothing was wrong with that card. A shipped card's claim
    // is "something merged proves this", so it is answered by ANY merged
    // citation; the others are narration and always will be. A rule that fires
    // on narration teaches people to strip citations, which is worse than the
    // staleness it was written to catch.
    //
    // AND IT APPLIES ONLY WHEN THE CARD'S EVIDENCE IS A PR. `evidence.kind` is
    // the card's own statement of what proves it. INC-11 shipped on kind
    // "journal" - a production read the owner ran - and its ref narrates #917
    // because that is where the failure was first seen. Reading a PR number out
    // of a journal-backed card and calling it a shipping claim is the same
    // conflation this whole file exists to stop, just pointed the other way.
    if (finished && card?.evidence?.kind === "pr" && merged.length === 0) {
      record(
        card,
        "shipped-unmerged",
        `is shipped on evidence.kind "pr" but no cited PR has merged (${cited.map((p) => `#${p} ${stateOf(p)}`).join(", ")})`,
      );
    }

    // RULE C - the work landed and the card never moved. THE STALE-CARD RULE.
    if (!finished && merged.length > 0) {
      record(
        card,
        "stale-card",
        `cites ${merged.map((p) => `#${p}`).join(", ")} as MERGED, but status is "${card.status}"`,
      );
    }
  }

  return { mismatches, acknowledged };
}

/* --------------------------------------------------------------- effects --- */

/** PR states from GitHub, as a Map. Throws rather than returning a partial map:
 *  a half-answered question about which work has shipped is worse than none. */
function fetchPrStates(numbers) {
  const out = new Map();
  if (numbers.length === 0) return out;
  const repo = "happygamer1919-tech/OsteoJP";
  for (const n of numbers) {
    let raw;
    try {
      raw = execFileSync(
        "gh",
        ["api", `repos/${repo}/pulls/${n}`, "--jq", ".state + \" \" + (.merged|tostring)"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
    } catch (err) {
      const stderr = String(err?.stderr ?? "");
      // A 404 is an ANSWER (the PR does not exist). Anything else is a failure
      // to ask, and must not be reported as an answer.
      if (/HTTP 404|Not Found/i.test(stderr)) {
        out.set(n, "missing");
        continue;
      }
      throw new Error(`gh could not read PR #${n}: ${stderr.split("\n")[0] || err.message}`);
    }
    const [state, merged] = raw.split(" ");
    out.set(n, merged === "true" ? "merged" : state === "open" ? "open" : "closed");
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const boardArg = args.find((a) => !a.startsWith("--"));
  const boardPath = resolve(boardArg ?? `${HERE}/portal-board.json`);

  let board;
  try {
    board = JSON.parse(readFileSync(boardPath, "utf8"));
  } catch (err) {
    console.error(`FATAL: cannot read/parse ${boardPath}\n  ${err.message}`);
    process.exit(2);
  }

  let prState = null;
  if (!offline) {
    const wanted = [...new Set((board.cards ?? []).flatMap(citedPrs))].sort((a, b) => a - b);
    try {
      prState = fetchPrStates(wanted);
    } catch (err) {
      // NOT a silent skip. The whole point of this file is that an unasked
      // question must never read as a satisfied one.
      console.error(`CANNOT VERIFY: ${err.message}`);
      console.error(
        "The PR rules need `gh` authenticated against this repo. Fix that, or run\n" +
          "with --offline to run the local gate-claim rule alone and say so.",
      );
      process.exit(2);
    }
  }

  const { mismatches, acknowledged } = reconcile(board, prState);

  console.log(`BOARD RECONCILE  ${boardPath}`);
  console.log(`  cards: ${(board.cards ?? []).length}`);
  console.log(
    `  rules run: gate-claim (local)${prState ? `, pr-state over ${prState.size} cited PRs` : " ONLY - PR rules skipped (--offline)"}`,
  );

  if (acknowledged.length > 0) {
    // Printed in full, every run. An exemption nobody sees is an exemption
    // nobody revisits, and this list is where a wrong one would hide.
    console.log(`\n  ACKNOWLEDGED (${acknowledged.length}), open_on_purpose:`);
    for (const a of acknowledged) {
      console.log(`    - [${a.rule}] ${a.id}: ${a.message}`);
      console.log(`      reason: ${a.ack}`);
    }
  }

  if (mismatches.length > 0) {
    console.error(`\nBOARD OUT OF SYNC - ${mismatches.length} mismatch(es):`);
    for (const m of mismatches) console.error(`  - [${m.rule}] ${m.id}: ${m.message}`);
    console.error(
      "\nEach one is either a card that needs its true status, or a deliberate hold\n" +
        'that needs an explicit `open_on_purpose: "<reason>"` on the card. Do not\n' +
        "delete the citation to quiet it.",
    );
    process.exit(1);
  }

  console.log(`\n  no mismatches.`);
  process.exit(0);
}

// Only run when invoked directly, so the test can import the pure functions.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
