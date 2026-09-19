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
//
// ONE RULED EXCEPTION TO THAT LAST SENTENCE, AND IT IS LOUD. When GitHub answers
// with a RATE-LIMIT 403 after the retries (owner ruling D2, 2026-09-19), the run
// falls back to merge truth read from git history, prints OFFLINE FALLBACK and a
// `::warning`, and lists every PR it could not ask about under UNVERIFIED. The
// stale-card rule still runs and still fails the run. See `run` below.

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

/**
 * Phrases with which a card asserts ITS OWN work is finished.
 *
 * ============================================================================
 * WHY THIS EXISTS: A CARD THAT WAS INVISIBLE TO EVERY OTHER RULE.
 * ============================================================================
 * AI-01-projection-null-safety shipped in #859 on 2026-08-11. The session that
 * built it wrote the whole narrative into the card's notes - "WHAT SHIPPED, two
 * guards", "GATES, all four green: pnpm lint 0 errors, typecheck 10/10..." - and
 * then never set `status` or `evidence`. The card read `in_flight` with
 * `evidence: null` for seven days while the work sat on main, and a dispatch
 * named it as the next thing to build.
 *
 * IT IS THE FIFTH CARD IN THIS FAMILY AND THE FIRST OF ITS SHAPE. The previous
 * four carried a false `todo` while CITING PRs, so the pr-state rules could see
 * them. This one cited NOTHING, and that is not an oversight in how it was
 * written - `citedPrs` reads `evidence.ref` and only that, deliberately, because
 * notes narrate and name adjacent PRs while `evidence.ref` is the only field
 * whose PR numbers are a CLAIM. With evidence null the function returns `[]` and
 * every PR rule hits `if (cited.length === 0) continue`. The card claimed no
 * gate and named no consumer, so rules A and E were silent too.
 *
 * So the header of this file predicted it: "a check that only compares cited PR
 * numbers against merge state would have stayed silent on them forever."
 *
 * ============================================================================
 * THE PHRASES ARE NARROW ON PURPOSE, AND THE FALSE POSITIVE IS THE FAILURE MODE
 * ============================================================================
 * This rule runs in a REQUIRED CI check. A rule that fires on a legitimately
 * open card turns main red and gets switched off within a week, which is worse
 * than no rule.
 *
 * The first draft of this predicate matched the bare word "gates" and hit
 * LAUNCH-02 and LE-guest-queue-service-name - both of which use it as a VERB
 * ("it gates LAUNCH-01's arming steps", "this one gates a build decision").
 * Neither claims to be finished. That draft was thrown away rather than
 * annotated around: the owner's instruction on 2026-08-18 was to redesign the
 * rule rather than the cards, and a rule needing four exemptions on the day it
 * ships is a rule that does not work.
 *
 * What survives are phrases that can only be a claim ABOUT THIS CARD'S OWN
 * WORK: a gates line with a real count in it, and the "WHAT SHIPPED" heading.
 * Verified against every card on the board in both states - it fires on AI-01
 * before its flip and on nothing else, before or after.
 */
const COMPLETION_CLAIMS = [
  // The heading a session writes when it is describing what it just built.
  /\bWHAT SHIPPED\b/,
  // A gates line. Each carries a COUNT, which is what stops it matching prose
  // about gating something.
  /\bpnpm lint\b[^\n]*\b0 errors\b/i,
  /\btypecheck \d+\/\d+/i,
  /\bbuild \d+\/\d+/i,
  /\ball four green\b/i,
];

/** The phrases by which this card claims its own work is done, or []. */
export function completionClaims(card) {
  const blob = [card?.title, card?.notes]
    .filter((v) => typeof v === "string")
    .join("\n");
  return COMPLETION_CLAIMS.filter((re) => re.test(blob)).map((re) => re.source);
}

/** The acknowledgement, or null. Must be a non-empty string: a bare `true`
 *  would let somebody silence a rule without saying why, and the why is the
 *  only part a later reader can act on. */
export function acknowledgement(card) {
  const v = card?.open_on_purpose;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * ============================================================================
 * RULINGS RECONCILE SEPARATELY, BECAUSE THEY CANNOT GO STALE THE WAY A CARD DOES
 * ============================================================================
 * Every rule above asks the same underlying question: does this card's STATUS
 * still match what the repository shows? A ruling has no status. It cannot ship,
 * cannot go stale, and cannot be caught by rules A through F - which is exactly
 * why the WF-* family survived three weeks as `todo` while rule E was written
 * specifically to catch that family and could only ever see the two of them that
 * happened to name a consumer.
 *
 * So the rulings get the two questions that CAN be false about them, and only
 * those two. Both are local; neither needs a network.
 *
 *   RULE G - a `governs` entry naming a card id that no longer exists. The
 *     ruling then binds nothing a reader can look up, and the cards it was
 *     written to constrain are unfindable from it. Only entries that LOOK like
 *     card ids are checked: `governs` also carries file paths and prose
 *     ("every patient-visible card on this board"), and a rule that demanded
 *     every entry resolve to a card would either forbid those or fire on all of
 *     them.
 *
 *   RULE H - a supersession chain that loops. `superseded_by` is the only
 *     record of why a ruling stopped applying, and a cycle makes "which one is
 *     in force" unanswerable. The validator already refuses a `superseded_by`
 *     pointing at no ruling and one pointing at itself; a two-step cycle is the
 *     case neither of those sees.
 *
 * WHAT IS DELIBERATELY NOT A RULE HERE: "a ruling nobody has cited in N days".
 * Rulings are meant to sit unread until something touches what they govern. An
 * age check on one would manufacture work out of a healthy state, which is the
 * failure mode this whole section exists to remove.
 */
const CARD_ID_SHAPE = /^[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+$/;

export function reconcileRulings(board) {
  const rulings = board?.rulings ?? [];
  const cardIds = new Set((board?.cards ?? []).map((c) => c.id));
  const rulingIds = new Set(rulings.map((r) => r.id));
  const findings = [];

  for (const r of rulings) {
    // RULE G - governs pointing at a card that is gone.
    for (const g of r.governs ?? []) {
      if (typeof g !== "string") continue;
      // A file path or a sentence is not a card id, and neither is a ruling id.
      if (g.includes("/") || g.includes(" ") || !CARD_ID_SHAPE.test(g)) continue;
      if (cardIds.has(g) || rulingIds.has(g)) continue;
      findings.push({
        id: r.id,
        rule: "governs-ghost",
        message: `governs "${g}", which is neither a card nor a ruling on this board`,
      });
    }

    // RULE H - a supersession cycle.
    const seen = new Set([r.id]);
    let cur = r.superseded_by ?? null;
    while (cur) {
      if (seen.has(cur)) {
        findings.push({
          id: r.id,
          rule: "supersede-cycle",
          message: `its superseded_by chain returns to ${cur} - which ruling is in force is then unanswerable`,
        });
        break;
      }
      seen.add(cur);
      cur = rulings.find((x) => x.id === cur)?.superseded_by ?? null;
    }
  }

  return findings;
}

const FINISHED = "shipped";

/**
 * Every disagreement between the board and the repository.
 *
 * `prState` maps a PR number to "merged" | "open" | "closed" | "missing" |
 * "unknown", or is null when the PR rules were not run.
 *
 * "unknown" EXISTS ONLY IN THE RATE-LIMIT FALLBACK (see `degradedPrStates`), and
 * it is never a finding. It means nobody could be asked: not "missing", which is
 * GitHub's answer that the PR does not exist, and not "open", which is an answer
 * too. Rule D is not asked about an unknown PR, rule B is withheld from a card
 * that cites one, and both are returned in `unverified` so the run can print
 * what it did not check. Rule C needs no such care: it fires only on "merged",
 * and merged is the one state the fallback can know for certain.
 */
export function reconcile(board, prState) {
  const gateState = new Map(
    (board?.launch_gate?.conditions ?? []).map((c) => [c.id, c.state]),
  );
  const byId = new Map((board?.cards ?? []).map((c) => [c.id, c]));
  const mismatches = [];
  const acknowledged = [];
  const unverified = [];

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

    // RULE F - EVIDENCE-NULL COMPLETION CLAIM. Local, like A and E, and for the
    // strongest version of the same reason: this rule exists precisely because
    // the card it catches cites nothing at all, so no network check could ever
    // reach it. See COMPLETION_CLAIMS above for the case that produced it.
    //
    // `todo` is excluded because a card can legitimately carry a plan written in
    // the past tense before anyone starts. `shipped` is excluded because the
    // VALIDATOR already refuses a shipped card with null evidence, and a second
    // opinion on a rule that is already enforced elsewhere is noise.
    if (card.status !== "todo" && !finished && !card.evidence) {
      const claims = completionClaims(card);
      if (claims.length > 0) {
        record(
          card,
          "evidence-null-claim",
          `its own notes claim the work is finished (${claims.length} phrase${claims.length === 1 ? "" : "s"}), ` +
            `but status is "${card.status}" and evidence is null - so no PR rule can see it`,
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
    const unknown = cited.filter((pr) => stateOf(pr) === "unknown");
    if (unknown.length > 0) unverified.push({ id: card.id, prs: unknown });

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
    //
    // WITHHELD WHEN ANY CITATION IS UNKNOWN. "No cited PR has merged" is a claim
    // about every citation, and an unknown one is a citation nobody asked about.
    if (finished && card?.evidence?.kind === "pr" && merged.length === 0 && unknown.length === 0) {
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

  return { mismatches, acknowledged, unverified };
}

/**
 * PR numbers that git history says are MERGED, from commit subjects.
 *
 * Main takes squash merges, whose subject GitHub ends with "(#N)", and it may
 * take a merge commit, whose subject begins "Merge pull request #N from". Both
 * are written by GitHub at merge time. Nothing else is read: a number in the
 * middle of a subject is narration, exactly as a number in a card's notes is,
 * and `Revert "x (#12)" (#900)` is the merge of #900 and says nothing about #12.
 *
 * A MERGED PR STAYS MERGED. That is what makes this safe to use when GitHub
 * cannot be asked: git can be behind, so its silence proves nothing, but it
 * cannot be wrong about a merge it holds.
 */
export function mergedFromSubjects(lines) {
  const merged = new Set();
  for (const line of lines) {
    const m = line.match(/\(#(\d+)\)\s*$/) ?? line.match(/^Merge pull request #(\d+) from /);
    if (m) merged.add(Number(m[1]));
  }
  return merged;
}

/**
 * PR states for the rate-limit fallback. An answer the API gave before the quota
 * ran out is kept. Otherwise git answers "merged", and everything else is
 * "unknown" - NEVER "missing", "open" or "closed", each of which is an answer
 * and would be an invented one. Every wanted PR gets a key, so `reconcile`'s
 * `?? "missing"` default cannot fire on this map.
 */
export function degradedPrStates(wanted, partial, mergedSet) {
  const out = new Map();
  for (const n of wanted) {
    out.set(n, partial?.get(n) ?? (mergedSet.has(n) ? "merged" : "unknown"));
  }
  return out;
}

/* --------------------------------------------------------------- effects --- */

const REPO = "happygamer1919-tech/OsteoJP";

/** One PR read. Extracted so the retry below can be tested with an injected
 *  failure rather than by waiting for the network to misbehave again. */
function ghReadPr(n) {
  return execFileSync(
    "gh",
    ["api", `repos/${REPO}/pulls/${n}`, "--jq", ".state + \" \" + (.merged|tostring)"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** Synchronous pause. This file is sync throughout and the retry must not
 *  change that: making it async would ripple into main() and every caller. */
function sleepSeconds(s) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000);
}

/**
 * PR states from GitHub, as a Map. Throws rather than returning a partial map:
 * a half-answered question about which work has shipped is worse than none.
 *
 * RETRIED ON TRANSIENT FAILURE, added 2026-08-20 after a live occurrence.
 * PR #965, run 32318873585: `gh could not read PR #764: unexpected end of JSON
 * input`, exit 2, reddening a REQUIRED check on a PR whose content was fine.
 * Re-running the identical commit passed. This function makes one call per cited
 * PR - around 80 of them, sequentially - so a single truncated response out of
 * eighty failed the whole gate.
 *
 * THE 404 RULE IS UNTOUCHED AND MUST STAY THAT WAY. A 404 is an ANSWER: the PR
 * does not exist, and that is a fact worth recording. Anything else is a failure
 * to ASK, which must never be reported as an answer. A retry changes only how
 * hard we try to ask; it does not turn an unasked question into a satisfied one.
 * That is why 404 breaks out of the retry loop immediately rather than being
 * retried: retrying a definite answer would be as wrong as accepting a
 * non-answer.
 *
 * A RESCUED READ IS ANNOUNCED, not swallowed. The e2e workflow's Supabase and
 * Playwright steps already print `::warning::` when a retry saves them, because
 * a silent retry makes a flake un-measurable - which is how the Supabase one
 * reached three occurrences before anyone counted them.
 *
 * AN EXHAUSTED RATE LIMIT IS NAMED, added 2026-09-19 after three occurrences on
 * #1399 (runs 35349914675, 35442130654, 35442683579). It still THROWS, and the
 * sentence at the top of this comment still holds for every caller that does not
 * look: what changes is that the error carries `code: "RATE_LIMITED"`, the PR it
 * stopped at, and `partial`, the answers GitHub gave before the quota ran out.
 * `run` is the one caller that looks, and what it does with them is its decision,
 * not this function's.
 *
 * ONLY A RATE LIMIT IS NAMED. "Resource not accessible by integration" is also a
 * 403, and it means the token can never ask. Falling back on that would retire
 * the PR rules for good while the step stayed green, so it throws as before.
 *
 * IT STOPS AT THE FIRST EXHAUSTED PR. A quota that refused #760 three times will
 * refuse #761, and walking 246 PRs at six seconds each proves it 245 more times.
 */
export function fetchPrStates(numbers, readOne = ghReadPr, pause = sleepSeconds) {
  const out = new Map();
  if (numbers.length === 0) return out;
  const ATTEMPTS = 3;
  for (const n of numbers) {
    let raw = null;
    let lastErr = null;
    let missing = false;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        raw = readOne(n);
        if (attempt > 1) {
          console.error(
            `::warning title=Reconciler retried a PR read::gh read of PR #${n} ` +
              `succeeded on attempt ${attempt}. This run hit ` +
              `CI-reconciler-no-retry-on-transient-gh.`,
          );
        }
        lastErr = null;
        break;
      } catch (err) {
        const stderr = String(err?.stderr ?? "");
        if (/HTTP 404|Not Found/i.test(stderr)) {
          missing = true;
          lastErr = null;
          break;
        }
        lastErr = err;
        if (attempt < ATTEMPTS) pause(attempt * 2);
      }
    }
    if (missing) {
      out.set(n, "missing");
      continue;
    }
    if (lastErr) {
      const stderr = String(lastErr?.stderr ?? "");
      const failure = new Error(
        `gh could not read PR #${n} after ${ATTEMPTS} attempts: ` +
          `${stderr.split("\n")[0] || lastErr.message}`,
      );
      const status = stderr.match(/HTTP (403|429)/)?.[1];
      if (status && /rate limit/i.test(stderr)) {
        failure.code = "RATE_LIMITED";
        failure.status = Number(status);
        failure.pr = n;
        failure.partial = out;
      }
      throw failure;
    }
    const [state, merged] = raw.split(" ");
    out.set(n, merged === "true" ? "merged" : state === "open" ? "open" : "closed");
  }
  return out;
}

/**
 * Merge truth from git, for the rate-limit fallback: `{ merged, shallow, ref }`.
 *
 * READ FROM THE BOARD'S OWN REPOSITORY, which is why it takes the board's
 * directory: the history that can answer for a board is the one it is committed
 * in, and that is not always the directory the command was typed in.
 *
 * `origin/main` WHEN IT RESOLVES, ELSE `HEAD`, and `--first-parent` either way.
 * A feature branch that has merged main into itself keeps main's squash commits
 * on the SECOND parent of those merges, so walking HEAD's first parents from
 * such a branch would miss them; `origin/main` has them all on its first-parent
 * line. In CI, HEAD is GitHub's test merge and its first parent IS main.
 *
 * SHALLOW IS REPORTED, NEVER WORKED AROUND. `actions/checkout` defaults to depth
 * 1, whose history holds one subject. Reading that as "no cited PR is merged"
 * would mark all 246 unknown and pass, so the caller refuses a shallow answer.
 * ci.yml fetches full history for exactly this reason.
 */
function gitMergedPrs(cwd) {
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const shallow = git("rev-parse", "--is-shallow-repository") === "true";
  let ref = "HEAD";
  try {
    git("rev-parse", "--verify", "-q", "origin/main");
    ref = "origin/main";
  } catch {
    // No such ref in this clone. HEAD is the documented second choice.
  }
  const merged = mergedFromSubjects(git("log", "--first-parent", "--format=%s", ref).split("\n"));
  return { merged, shallow, ref };
}

/**
 * The whole run as a value: `{ code, out, err }`. `main` only performs it.
 *
 * EXTRACTED SO THE FALLBACK CAN BE TESTED THROUGH THE EXIT CODE. The rule that
 * matters here is about what the PROCESS reports - a rate limit must pass, a
 * stale card under the same rate limit must not - and `main` called
 * `process.exit`, which no test could observe without spawning. `fetch` and
 * `gitMerged` are injected the way `readOne` already is.
 */
export function run({ board, boardPath, offline, fetch = fetchPrStates, gitMerged = gitMergedPrs }) {
  const out = [];
  const err = [];

  let prState = null;
  let fallback = null;
  if (!offline) {
    const wanted = [...new Set((board.cards ?? []).flatMap(citedPrs))].sort((a, b) => a - b);
    try {
      prState = fetch(wanted);
    } catch (failure) {
      // NOT a silent skip. The whole point of this file is that an unasked
      // question must never read as a satisfied one.
      if (failure?.code !== "RATE_LIMITED") {
        err.push(`CANNOT VERIFY: ${failure.message}`);
        err.push(
          "The PR rules need `gh` authenticated against this repo. Fix that, or run\n" +
            "with --offline to run the local gate-claim rule alone and say so.",
        );
        return { code: 2, out, err };
      }

      // THE RULED FALLBACK (D2, 2026-09-19). GitHub refused on quota, which says
      // nothing about the board, so the question is put to git history instead.
      let git;
      try {
        git = gitMerged(dirname(resolve(boardPath)));
      } catch (gitFailure) {
        err.push(`CANNOT VERIFY: ${failure.message}`);
        err.push(`and the git fallback failed too: ${gitFailure.message}`);
        return { code: 2, out, err };
      }
      if (git.shallow) {
        err.push(`CANNOT VERIFY: ${failure.message}`);
        err.push(
          "and the git fallback cannot answer either: this is a SHALLOW clone, whose\n" +
            "history does not hold the merges the board cites. Fetch full history\n" +
            "(actions/checkout `fetch-depth: 0`) and the rate limit stops being fatal.",
        );
        return { code: 2, out, err };
      }
      prState = degradedPrStates(wanted, failure.partial, git.merged);
      const api = failure.partial?.size ?? 0;
      const unknown = [...prState.values()].filter((s) => s === "unknown").length;
      fallback = { api, git: wanted.length - api - unknown, unknown, ref: git.ref };
      err.push(
        `::warning title=Reconciler fell back to offline mode::GitHub API rate limit ` +
          `(HTTP ${failure.status}) held through the retries at PR #${failure.pr}. Merge state ` +
          `was read from git history (${git.ref}) instead: of ${wanted.length} cited PRs, ` +
          `${fallback.api} answered by the API, ${fallback.git} answered by git, ` +
          `${fallback.unknown} could not be asked about at all.`,
      );
    }
  }

  const { mismatches, acknowledged, unverified } = reconcile(board, prState);
  // RULINGS RECONCILE SEPARATELY and their findings join the same exit code. A
  // second list with its own quiet exit would be a check nobody reads.
  const rulingFindings = reconcileRulings(board);

  out.push(`BOARD RECONCILE  ${boardPath}`);
  out.push(`  cards: ${(board.cards ?? []).length}`);
  if ((board.rulings ?? []).length > 0) {
    out.push(
      `  rulings: ${(board.rulings ?? []).length} (reconciled separately - a ruling has no status, so rules A-F cannot see it)`,
    );
  }
  const prRules = fallback
    ? `, OFFLINE FALLBACK after a GitHub rate limit - merged state from git history (${fallback.ref}) ` +
      `over ${prState.size} cited PRs; stale-card fires on every PR git or the API holds as merged; ` +
      `stale-card, pr-missing and shipped-unmerged are all UNVERIFIED for the ${fallback.unknown} ` +
      `PR(s) nobody could ask about`
    : prState
      ? `, pr-state over ${prState.size} cited PRs`
      : " ONLY - PR rules skipped (--offline)";
  out.push(`  rules run: gate-claim (local)${prRules}`);

  if (fallback && unverified.length > 0) {
    // Printed in full, for the reason ACKNOWLEDGED is: a check that was not run
    // and is not listed is a check everybody assumes was run.
    out.push(`\n  UNVERIFIED (${unverified.length}), cited PRs GitHub would not answer for and git does not hold as merged:`);
    for (const u of unverified) out.push(`    - ${u.id}: ${u.prs.map((p) => `#${p}`).join(", ")}`);
  }

  if (acknowledged.length > 0) {
    // Printed in full, every run. An exemption nobody sees is an exemption
    // nobody revisits, and this list is where a wrong one would hide.
    out.push(`\n  ACKNOWLEDGED (${acknowledged.length}), open_on_purpose:`);
    for (const a of acknowledged) {
      out.push(`    - [${a.rule}] ${a.id}: ${a.message}`);
      out.push(`      reason: ${a.ack}`);
    }
  }

  if (rulingFindings.length > 0) {
    err.push(`\nRULINGS OUT OF SYNC - ${rulingFindings.length} finding(s):`);
    for (const f of rulingFindings) err.push(`  - [${f.rule}] ${f.id}: ${f.message}`);
  }

  if (mismatches.length > 0) {
    err.push(`\nBOARD OUT OF SYNC - ${mismatches.length} mismatch(es):`);
    for (const m of mismatches) err.push(`  - [${m.rule}] ${m.id}: ${m.message}`);
    err.push(
      "\nEach one is either a card that needs its true status, or a deliberate hold\n" +
        'that needs an explicit `open_on_purpose: "<reason>"` on the card. Do not\n' +
        "delete the citation to quiet it.",
    );
  }

  if (mismatches.length > 0 || rulingFindings.length > 0) return { code: 1, out, err };

  out.push(`\n  no mismatches.`);
  return { code: 0, out, err };
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

  const result = run({ board, boardPath, offline });
  // The same order the inline prints always had: the stdout block, then stderr.
  for (const line of result.out) console.log(line);
  for (const line of result.err) console.error(line);
  process.exit(result.code);
}

// Only run when invoked directly, so the test can import the pure functions.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
