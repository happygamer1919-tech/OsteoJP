import { readFileSync, writeFileSync } from "node:fs";

// Run: node docs/board/gen-triage.mjs
//
// COMMITTED DELIBERATELY, 2026-08-11. This file used to live outside the repo,
// and the consequence showed up within hours: PR #867 hand-corrected the
// next-card label in REMAINING-TRIAGE.md, and the very next regeneration
// silently reverted it. A generated file whose generator is not in the repo
// cannot be maintained - every hand-fix to it is a fix with a countdown on it.
//
// It refuses to emit unless every unshipped card lands in exactly one bucket,
// so the four counts always sum to the unshipped total and no card can be
// quietly dropped.
import { dirname, join as _join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = _join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const b = JSON.parse(readFileSync(`${ROOT}/docs/board/portal-board.json`, "utf8"));
const unshipped = b.cards.filter((c) => c.status !== "shipped");
const byId = Object.fromEntries(b.cards.map((c) => [c.id, c]));

const BUCKETS = {
  BUILD: {
    blurb: "Code work a terminal can do. Nothing outside this repo has to happen first.",
    items: [
      ["W13-06", "Umbrella for 06a/06b. Carries no work of its own."],
      ["W13-06a", "LOOP 6 Phase A - rebuild the exposure matrix from the code. Blocked by dependency on A2, not by anything external."],
      ["W13-06b", "LOOP 6 Phase B - close every deficient row Phase A names. Depends on 06a."],
      ["W13-07", "LOOP 7 SYNC proof. Depends on LOOP 6 merged. **The browser crossing is now PROVEN** - direction A green at attempt 1 on three runs. PG8 is held by ONE DoD line: per-hop timings."],
      ["LE-pg8-per-hop-timings", "**THE LAST THING BETWEEN THE BUILD AND 9/9.** Nine hops named, none measured individually. Needs server-side instrumentation - a browser cannot see inside one fetch. A measurement, not a discovery."],
      ["SEC-r-token-no-rate-limit", "apps/web has no rate limiter at all. Structural port; a LOOP 6 Phase B output, NOT AMBER's (rehydrate 1.1)."],
      ["ACC-vacuous-guard-sweep", "123 assertions that cannot fail, across 385 test files. Large, mechanical, high value."],
      ["AI-01-projection-null-safety", "In flight, NO EVIDENCE on the board. The only in-flight card with none."],
      ["AI-02-payload-structural-drift", "A partner key mapping to no ficha field is silently discarded."],
      ["LE-pedido-emit-best-effort", "A failed appointment_request emit loses the pedido AND makes it block. Known weakness recorded in 0059:82-90."],
      ["LE-vacuous-template-guard", "The email-template guard passes on a comment."],
      ["LE-portal-booking-home-clinic-preselect", "Portal booking preselects the home clinic."],
      ["LE-portal-multi-appointment-booking", "Portal exposure of Agendar lote."],
      ["LE-reminders-landline-dispatch", "**AMBER, 2026-08-11.** The OTP route now refuses landlines; the shared reminder path does not. Consequence of the fork-2 ruling."],
      ["SEC-otp-request-tenant-500-oracle", "**AMBER, 2026-08-11.** An unknown tenantId answers 500 where a known one answers 204 - a tenant-existence oracle."],
      ["SEC-allowconflict-not-audited", "**NEW 2026-08-11.** \"Guardar mesmo assim\" is written nowhere. It already cost a diagnosis during INC-08. No migration - audit metadata is jsonb."],
      ["LE-staff-transitions-emit-nothing", "**NEW 2026-08-11.** Only the CONFIRM path emits. Cancel and reschedule need no migration; no-show needs a kind and therefore a ruling."],
      ["CI-docs-only-required-checks-skip", "**NEW 2026-08-11.** Noted, not chased: three of four required checks are 4-7s path-filter skips on a docs-only diff."],
      ["LE-notes-list-hydration-mismatch", "toLocaleString differs server vs client. Low."],
      ["LE-staff-assisted-activation", "Buildable now; WF-07 rules it POST-LAUNCH, so it is scheduled late, not blocked."],
      ["LE-stale-auth-user-id-sweep", "PURPLE authors the read-only count, Ivan runs it. The authoring half is terminal work."],

      /* ---- added 2026-08-13. Loose ends that had never been bucketed, plus
             everything W13-08 and the OTP-coverage card turned up. The
             generator threw on all sixteen, which is the guard working: a card
             that reaches no bucket reaches no reader. ---- */
      ["ACC-skippable-suites-unguarded", "**HIGH, and RULED.** 36 suites can still skip inside a passing required check. The structural fix was scheduled after PG9, and PG9 is closed - so it is now next in this bucket. Expect it red the first time."],
      ["ACC-identity-blind-assertions", "**HIGH.** Assertions matching shared vocabulary rather than identity on a shared seeded database. Worse in kind than a skip: a skip fails to prove, this proves something false. See ACC-preselection-spec-flaky for two live instances."],
      ["ACC-preselection-spec-flaky", "**HIGH, widened 2026-08-13.** TWO DIFFERENT tests flaked on shard 1 in two runs - the preselection Servico select, then agenda-card stacking. The pattern is the shard, not either spec, and both read shared mutable appointment state. First step discriminates in one run: --repeat-each=5 alone."],
      ["LE-board-pr-reconciliation", "**HIGH.** Nothing reconciles merged PRs against card status; three cards have carried a false one. This bucket list is the same failure in miniature - four ghosts and sixteen unbucketed cards had accumulated by 2026-08-13."],
      ["LE-inc08-survivor-still-confirmed", "**HIGH.** Resolved in the production diary - all four test appointments cancelled - but the card has not been closed against that."],
      ["LE-prod-apply-worktree-loose-scripts", "**HIGH.** One-off scripts staged outside the repo in the apply worktree. Hygiene on the one tree that touches production."],
      ["ACC-gold-700-label-fails-aa", "**NEW 2026-08-13.** v2-gold-700 is 3.94:1 as label text on the admin badge - the same defect class PG9's axe scan found in green, on the staff side. Fix is the same shape: use 800 for the label, leave 700 as the fill."],
      ["ACC-immediate-isvisible-probes", "**NEW 2026-08-13.** Seven more e2e probes treat isVisible() as if it waited. The gate-bearing one cost PG8 four runs and an incident card. None of these seven is gate-bearing yet."],
      ["LE-pg8-e2e-needs-run-scoped-patient", "The portal patient is fixed by the trusted-device storage state, so direction A cannot mint a run-unique one. Pinning the booked DATE achieves the same end for that assertion; this is the residual."],
      ["LE-ocupado-lists-pending-pedido", "The Ocupado panel counts a pending pedido as blocking, contradicting the rule stated on the very next screen."],
      ["LE-agenda-does-not-learn-of-portal-bookings", "revalidatePath cannot cross the deployment boundary, so an open agenda only updates on navigation. NOT a double-booking risk - the slot lock and 0061 are the protection, not the render - but it looks broken in a demo."],
      ["LE-dead-i18n-keys-imply-screens", "403, 500 and offline strings are rendered by nothing in the portal. Recorded during PG9 rather than quietly skipped."],
      ["WF-01", null], ["WF-03", null], ["WF-04", null], ["WF-05", null], ["WF-06", null],
      ["WF-07", null], ["WF-08", null], ["WF-09", null], ["WF-10", null], ["WF-11", null],
      ["WF-12", null], ["WF-13", null], ["WF-14", null], ["WF-15", null], ["WF-16", null],
    ],
  },
  OBSERVE: {
    blurb:
      "Built and merged. Waiting only on Ivan - a deployed screen, a log line, a ruling, or a confirmation to close. No terminal can advance these.",
    items: [
      ["W13-03", "LOOP 3 patient AUTH. #828 merged. Held in_flight ON PURPOSE under WF-03."],
      ["W13-04", "LOOP 4 booking. #830 merged. Same hold."],
      ["W13-05", "LOOP 5 ficha terms. #833 + #835 merged, 0058 applied. Same hold."],
      ["LE-auth-recovery-deadend", "#837 merged. Closes on ONE real Gmail-aged link reaching set-password. Ivan must re-paste two Supabase templates FIRST."],
      ["ACC-13-results-uncommitted", "The results file. Five rows now carry the 2026-08-11 closure ruling; item 25 (was OTP_LIVE_SEND disarmed) is still the most urgent blank."],
      ["ACC-therapist-queue-unobserved", "Item 26 a/b/c. Code-complete, never seen. (c) is the negative arm and must not be skipped."],
      ["VERIFY-QUEUE", "The mechanism card for WF-09/WF-16 batching. Its notes ARE the queue."],
      ["LE-suppression-observation", "Watch for the log line on the next real booking."],
      ["LE-prod-scripts-cleanup", "Inventory the one-off prod scripts staged outside the repo."],
      ["LE-env-sweep-scope", "**#843 merged, verified ancestor of main.** Appears to need nothing - see the hygiene note below."],
      ["LE-portal-supabase-residue", "**#841 merged, verified ancestor of main.** Same."],
      ["LE-trusted-device-revoke", "**#843 merged, verified ancestor of main.** Same."],
      ["LE-e2e-nif-edit-404", "Merged as CAPTURE, not fix. Closes when the flake recurs a third time already diagnosed - it waits on an event, not on work."],
    ],
  },
  EXTERNAL: {
    blurb: "Waiting on a third party: JP, Eduardo, external counsel, or the cybersecurity engagement.",
    items: [
      ["LAUNCH-02-jp-packet-signoff", "**JP.** Formal packet sign-off. Gates template arming on launch day."],
      ["LE-portal-reminder-confirm-loop", "**JP** on the inbound-SMS half. NOTE: the EMAIL confirm-by-link half has no blocker at all and is buildable today (/r/[token] is live, PG3 passed on it)."],
      ["LAUNCH-03a-caderno-encargos", "**Eduardo.** The document is written (docs/migration/caderno-encargos-exportacao.md). The whole block is Ivan forwarding it."],
      ["END-legal-sweep", "**External counsel + cybersecurity.** WF-15: legal left engineering. Any future legal finding APPENDS here silently and never opens a card."],
    ],
  },
  "LAUNCH-DAY": {
    blurb: "Impossible before launch by definition. Not backlog, not blocked - not yet possible.",
    items: [
      ["LAUNCH-01", "Arm the live sends under supervision, in order, canary first. WF-12 holds REMINDERS_LIVE_SEND and INVITES_LIVE_SEND off until this."],
      ["LAUNCH-03-client-data-migration", "~10,000 real patient records from the vendor. Nothing anywhere tracks it."],
      ["LE-primary-location-backfill", "Runs AFTER LAUNCH-03, never before: the patients whose home clinic matters do not exist in the database yet."],
    ],
  },
};

/* --- partition proof: exhaustive and disjoint, or throw ------------------- */
const assigned = [];
for (const k of Object.keys(BUCKETS)) for (const [id] of BUCKETS[k].items) assigned.push(id);
const dupes = assigned.filter((id, i) => assigned.indexOf(id) !== i);
if (dupes.length) throw new Error(`card in two buckets: ${dupes.join(", ")}`);
const missing = unshipped.map((c) => c.id).filter((id) => !assigned.includes(id));
if (missing.length) throw new Error(`unbucketed: ${missing.join(", ")}`);
const ghost = assigned.filter((id) => !unshipped.some((c) => c.id === id));
if (ghost.length) throw new Error(`bucketed but not unshipped: ${ghost.join(", ")}`);

/* --- render --------------------------------------------------------------- */
const P = (id) => byId[id].priority;
const order = { high: 0, medium: 1, low: 2 };
const out = [];
out.push("# Remaining work, triaged");
out.push("");
out.push(`**Board:** \`docs/board/portal-board.json\` @ \`as_of ${b.as_of}\`.`);
out.push(`**Scope:** every card not \`status: shipped\`. **${unshipped.length} cards.**`);
out.push(`**Shipped and out of scope here:** ${b.cards.length - unshipped.length}. **Board total: ${b.cards.length}.**`);
out.push("");
out.push("Generated from the board, not typed: the generator refuses to emit this file");
out.push("unless every unshipped card lands in exactly one bucket. So the four counts");
out.push("below always sum to the unshipped total, and no card can be quietly dropped.");
out.push("");
out.push("## The partition rule");
out.push("");
out.push("The four buckets split by **who or what unblocks the card**, which makes them");
out.push("mutually exclusive without judgement calls:");
out.push("");
out.push("| Bucket | Unblocked by | Count |");
out.push("|---|---|---|");
for (const k of Object.keys(BUCKETS)) {
  const who = { BUILD: "a terminal", OBSERVE: "Ivan", EXTERNAL: "a third party", "LAUNCH-DAY": "launch itself" }[k];
  out.push(`| **${k}** | ${who} | **${BUCKETS[k].items.length}** |`);
}
out.push(`| | **total** | **${unshipped.length}** |`);
out.push("");
out.push("`blocked_on` on this board is `ivan | jp | lawyer | infra`. Ivan is deliberately");
out.push("**not** an EXTERNAL party, which is why everything waiting on him is OBSERVE even");
out.push("when what he owes is a ruling rather than a screenshot.");
out.push("");
out.push("---");
out.push("");

for (const k of Object.keys(BUCKETS)) {
  const bk = BUCKETS[k];
  const items = [...bk.items].sort((a, x) => order[P(a[0])] - order[P(x[0])]);
  out.push(`## ${k} — ${items.length}`);
  out.push("");
  out.push(bk.blurb);
  out.push("");
  out.push("| Card | Pri | Status | Note |");
  out.push("|---|---|---|---|");
  for (const [id, note] of items) {
    const c = byId[id];
    const st = c.blocked_on ? `${c.status} (${c.blocked_on})` : c.status;
    const n = note ?? c.title.replace(/\|/g, "/").slice(0, 90);
    out.push(`| \`${id}\` | ${c.priority} | ${st} | ${n} |`);
  }
  out.push("");
}

out.push("---");
out.push("");
out.push("## The sixteen WF cards are one PR, not sixteen tickets");
out.push("");
const wf = BUCKETS.BUILD.items.map((i) => i[0]).filter((id) => /^WF-/.test(id));
out.push(`\`${wf.join("`, `")}\` are **owner rulings that have already been given.**`);
out.push("Each card quotes its ruling verbatim in its own notes. They sit at `status: todo`");
out.push("with `evidence: null` for one reason: **none of them is written into**");
out.push("**`docs/DECISIONS.md`.** Verified 2026-08-11 by grep over that file - R2 through");
out.push("R10 and the four unnumbered rulings return zero hits.");
out.push("");
out.push(`So ${wf.length} of the ${BUCKETS.BUILD.items.length} BUILD cards are a single documentation PR:`);
out.push("append each ruling to `DECISIONS.md`, close each card with that commit as evidence.");
out.push("No code, no migration, no owner time. **It is the cheapest large move on the board**");
out.push("and it matters for a handover: right now the project's governing decisions live in");
out.push("board notes, which is exactly the condition `ACC-13-results-uncommitted` exists to");
out.push("complain about.");
out.push("");
out.push("---");
out.push("");
out.push("## Flags a handover needs to see");
out.push("");
out.push("These are annotations on the buckets above, not a fifth bucket.");
out.push("");
out.push("### 1. Four cards read \"merged, on main\" but sit `in_flight`");
out.push("");
out.push("`LE-env-sweep-scope`, `LE-portal-supabase-residue`, `LE-trusted-device-revoke`,");
out.push("`LE-e2e-nif-edit-404`. Each carries a **STALE-REF CORRECTION dated 2026-08-11**");
out.push("recording that its PR is merged and is a verified ancestor of `origin/main` - the");
out.push("board was wrong, not the work. Unlike `W13-03/04/05`, none of them says \"STATUS");
out.push("STAYS in_flight ON PURPOSE\", so none is being held by WF-03.");
out.push("");
out.push("**They were not flipped to `shipped` in this dispatch, deliberately.** Flipping four");
out.push("cards to shipped on my own reading of their notes is the kind of silent");
out.push("reconciliation rehydrate §3 forbids as a first act. Three of the four (`env-sweep`,");
out.push("`supabase-residue`, `trusted-device-revoke`) look closeable on inspection;");
out.push("`e2e-nif-edit-404` genuinely is not - it shipped as *capture, not fix* and closes only");
out.push("when the flake recurs a third time already diagnosed. **One owner sentence closes");
out.push("three cards.**");
out.push("");
out.push("### 2. `SEC-otp-unauthenticated-sms-pump` — RESOLVED, kept for the lesson");
out.push("");
out.push("Raised as a contradiction (board said `blocked_on: ivan`, rehydrate §1.1 assigned it");
out.push("to AMBER as the highest-priority card), then answered before this file was written.");
out.push("**AMBER shipped it**: branch `sec/SEC-otp-sms-pump-ceiling`, commits `f5ed2b9` +");
out.push("`5fae227`, PR #865. The card is now `shipped` and out of this file's scope. The");
out.push("rehydrate was right and the board was stale.");
out.push("");
out.push("**How that reached this board matters, because it is not the normal path.** AMBER");
out.push("republished the shared artifact at 22:20; this session's publish was refused as a");
out.push("conflict. `origin/main` had NOT moved, so the divergence was on AMBER's unmerged");
out.push("branch. Rather than force-publish and silently delete two of their cards from the");
out.push("owner's only status surface, **this board was rebuilt on AMBER's board as base and");
out.push("this dispatch's edits re-applied on top.** The two lanes' card sets are disjoint, so");
out.push("the merge is content-preserving and the validator passes at 102.");
out.push("");
out.push("**The risk that creates, stated rather than hidden:** this branch now asserts");
out.push("`SEC-otp-unauthenticated-sms-pump: shipped` on the strength of an UNMERGED branch. If");
out.push("PR #865 is revised or abandoned, that assertion is wrong until this board is");
out.push("corrected. It carries AMBER's own evidence ref, so it is their claim preserved, not");
out.push("a new one made here.");
out.push("");
out.push("### 3. Nothing here is startable that needs a migration");
out.push("");
out.push("`0061` is **reserved and unauthored**, released only after AMBER's OTP PR merges");
out.push("(rehydrate §1.1, standing rule 8: one migration in flight across the whole repo).");
out.push("Two cards in BUILD are gated behind that slot:");
out.push("");
out.push("- `INC-08-double-booking-state-not-path` - the `btree_gist` EXCLUDE constraint.");
out.push("- `ACC-13-item20-staff-fanout` - a fifth notification kind is pinned by a CHECK");
out.push("  constraint in migration `0055`, so it needs a migration *and* an owner ruling.");
out.push("  (Filed under OBSERVE, because the ruling blocks it before the migration does.)");
out.push("");
out.push("### 4. The dependency chain inside BUILD is strictly serial");
out.push("");
out.push("`LE-portal-booking-therapist-step` (A2) → `W13-06a` → `W13-06b` → `W13-07` → `W13-08`.");
out.push("A2 precedes LOOP 6 because Phase A enumerates the patient-facing surface and A2 *adds*");
out.push("to it. LOOP 8 runs last because it audits the others' output. **The other BUILD cards");
out.push("are order-free** and are where a second terminal should go.");
out.push("");

writeFileSync(`${ROOT}/docs/board/REMAINING-TRIAGE.md`, out.join("\n") + "\n");
console.log(`OK ${unshipped.length} cards partitioned:`,
  Object.keys(BUCKETS).map((k) => `${k}=${BUCKETS[k].items.length}`).join(" "));
