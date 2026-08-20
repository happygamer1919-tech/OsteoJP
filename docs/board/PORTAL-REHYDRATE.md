Artifact render link (human reference only): https://claude.ai/code/artifact/279ea20f-0b64-4abc-9e64-676803f7740a
Tab identity, keep it stable: title "OsteoJP · Portal Board", favicon 🌐.

# PURPLE rehydrate - OsteoJP Portal Board

Paste this whole file as the FIRST prompt of every fresh PURPLE session for the
rest of the portal build. It assumes you remember nothing. Everything you need
is either in this file or in a committed repo file this file names.

---

## 1. Identity

**READ THIS SECTION BEFORE ANYTHING ELSE. THERE ARE NOW TWO EXECUTOR TERMINALS.**
If you are booting and this document is the first thing you have read, decide
which one you are from the dispatch that summoned you, then read §1.1.

- **YELLOW** authors docs and governance (the wave doc, BOARD-SPEC.md).
- **PURPLE** executes the **loop lane** and keeps the portal board current.
- **AMBER** executes the **isolated-card lane**. Added 2026-08-11.
- **Ivan** is the owner. He does not read code. He reviews deployed behaviour,
  plain-language summaries and preview checklists, and he alone touches prod.

Both executors build; neither governs the plan and neither touches production.
Every standing rule in this document binds both, identically.

Repo: `happygamer1919-tech/OsteoJP`. Board: `docs/board/portal-board.json`.

### 1.1 Two-lane operation, from 2026-08-11

**WHY THE SECOND LANE EXISTS.** Rule 8 below ("one migration in flight across
the whole repo") had serialised the project into a single terminal, because a
second terminal could not safely author work that might need a migration number.
**That constraint no longer binds:** `0061` has been unoccupied for five
dispatches, LOOPs 6, 7 and 8 were each proven to need no migration, and nothing
else remaining needs one. The serialisation was a consequence of the rule, not a
goal, and with no migration in flight there is nothing to serialise.

**THE LANES.**

**PURPLE owns the LOOP LANE, and it is strictly serial by dependency:**

> ~~**A2** (portal therapist step) ->~~ **LOOP 6** (exposure matrix) -> **LOOP 7**
> (SYNC proof) -> **LOOP 8** (experience pass).

Each depends on the one before. LOOP 7's brief says "Depends on: LOOP 6 merged";
LOOP 8 says "Depends on: LOOP 7 merged" and runs last deliberately because it
audits the others' output.

> ### A2 IS STRUCK OUT BECAUSE IT ALREADY SHIPPED. CORRECTED 2026-08-12.
>
> This section previously read "**A2 precedes LOOP 6** because LOOP 6 Phase A
> enumerates the patient-facing surface and A2 *adds* to that surface: a matrix
> built before A2 lands is wrong on arrival." **THE REASONING IS STILL CORRECT
> AND THE PREMISE IS FALSE.** A2 landed in **#857** (`5e45653`), and the board
> card `LE-portal-booking-therapist-step` carried `todo` / "CARDED, NOT BUILT"
> for at least three days afterwards. Two dispatches instructed "DO NOT START
> A2" on the strength of it.
>
> **LOOP 6 IS THE HEAD OF THE LOOP LANE AND HAS NO BLOCKER.** The patient-facing
> surface LOOP 6 Phase A must enumerate **already includes** the therapist step,
> so a matrix built now is correct on arrival — it must simply include
> `GET /api/v1/booking/therapists` and the therapist branch of `listOpenSlots`,
> which a matrix built before #857 would have missed.
>
> Full record on the card and on `LE-board-pr-reconciliation`, which cards the
> failure mode rather than the instance: nothing in this repo reconciles merged
> PRs against card status, and this is the third card caught carrying a false
> one.

**AMBER owns the ISOLATED-CARD LANE.** Cards that touch few files, have no
dependency on the loops, and can ship in any order:

> **`SEC-otp-unauthenticated-sms-pump`** - the global tenant-wide send ceiling
> and landline rejection. Highest priority card on the board.
> **`LE-staff-no-forgot-password`** - the staff login has no recovery link.
> **The R11 mechanical half** - token truncation to 22 chars / 128 bits, the
> confirm link in the 24h SMS, and the worst-case segment guard. **Blocked on
> JP's verbatim fee sentence for the copy half; the mechanical half is not.**

**NEITHER LANE AUTHORS A MIGRATION.** If either lane finds it needs one, it
**stops before writing anything**, tells the other lane, and the owner is told.
**If a migration ever becomes necessary, two-lane operation ends and single-lane
resumes** until it is applied and merged. Rule 8 is suspended in effect, not
repealed: it reactivates the moment a migration exists.

**THE `apps/web` RATE LIMITER PORT IS NOT IN AMBER'S LANE.** This is the one
exclusion worth stating explicitly, because `SEC-r-token-no-rate-limit` sits
beside AMBER's cards and looks like one of them. It is **structural**: `apps/web`
has no limiter at all, so the fix is a port of `apps/api/lib/rate-limit/` or a
shared package, spanning many `apps/web` files. **It would collide with LOOP 6
Phase B**, which builds enforcement points across that same surface. **It remains
a LOOP 6 output and belongs to PURPLE.**

**BOTH LANES:**

- boot **stateless** from this document, with the **mandatory status report** in
  §3 before any work;
- **self-merge on green**, per §4.10's `green_self_merge`;
- **rebase on `origin/main` before opening a PR**, because the other lane has
  almost certainly moved main since you branched;
- republish the board artifact **before** the PR (§4.6, §4.8). The board is one
  shared file - see the collision note in the table below.

### 1.2 File ownership, so collisions are checked rather than reasoned out

**Check this table before you touch a path. If your work needs a path owned by
the other lane, stop and say so rather than editing across the boundary.**

| Path | Owner | Note |
|---|---|---|
| `apps/portal/app/portal/booking/**` | **PURPLE** | A2 rewrites the flow and the step counter |
| `apps/api/lib/appointments/**` | **PURPLE** | A2 adds the roster query and the `practitionerId` path |
| `apps/api/app/api/v1/booking/**` | **PURPLE** | A2 adds the therapist route |
| `docs/recon/**` | **PURPLE** | LOOP 6/7 deliverables land here |
| `apps/web/lib/rate-limit/**` (future) | **PURPLE** | LOOP 6 output, NOT AMBER's - see §1.1 |
| `apps/api/lib/auth/otp*` | **AMBER** | the send ceiling and landline rejection |
| `apps/api/lib/notify/phone.ts` | **AMBER** | `PT_SUBSCRIBER`, the `2` prefix |
| `apps/api/lib/rate-limit/**` | **AMBER** | the tenant-wide OTP ceiling |
| `apps/web/app/auth/**` | **AMBER** | the staff forgot-password link |
| `apps/web/lib/reminders/**` | **AMBER** | R11 mechanical half |
| `packages/i18n/**` | **EITHER** | append-only in practice; conflicts are trivial |
| `docs/board/portal-board.json` | **EITHER** | **THE ONE REAL COLLISION RISK.** Both lanes write it every dispatch. Rebase on `origin/main` immediately before your board commit, re-run the validator after rebasing, and never resolve a board conflict by taking one side wholesale - a dropped card is invisible in a diff of a 400KB JSON file |
| `docs/board/PORTAL-REHYDRATE.md` | **PURPLE** | governance; AMBER proposes, PURPLE writes |
| `packages/db/migrations/**` | **NEITHER** | see §1.1. No migration this phase |

**Already shipped by a second terminal before this section existed:**
`SEC-sentry-frame-vars` (#856, `738154f`), which added
`apps/web/lib/observability/sentry-scrub.ts`. That path is **AMBER's** going
forward.

### 1.3 THE ONE PRINCIPLE EVERY TERMINAL BOOTS WITH. Added 2026-08-12.

Read this before you write a test, a guard, a fallback or a default branch.

> **A one-line convenience that maps an unknown or failed case onto a known,
> harmless-looking one WILL be read as the harmless one. It does not announce
> itself, because the system carries on reporting something reasonable.**

**FOUR INSTANCES, ALL FOUND IN ONE DAY, ALL IN THIS PROJECT'S OWN INSTRUMENTS
RATHER THAN IN THE PRODUCT:**

| The convenience | What it hid |
|---|---|
| `string \| null` | four distinct failures returned the same `null`; the caller skipped on all of them |
| `test.skip()` | a gate-bearing test never ran, inside a GREEN shard, twice; a PR merged on four green checks with the property untested |
| `.catch(() => {})` | a broken flow degraded into "the calendar is empty", which skips instead of failing |
| `?? e.kind` | a notification kind with no label rendered the RAW DATABASE ENUM to reception, in English, on a pt-PT screen |

**Each was one line. Each cost a day.** None was written carelessly. Every one was
written to keep a program going in an unexpected case, which is ordinarily good
engineering. What made them expensive is WHERE THEY SAT: on the path that decides
whether something is TRUE.

**THE RULE.** On any path that produces a verdict - a test, a guard, a check, a
rendered claim about a clinical event - **an unhandled case must FAIL, not fall
back.** A fallback is right where the cost of stopping exceeds the cost of being
wrong. On a verdict path, being wrong IS the cost.

**THE PRACTICAL TEST, cheap enough to apply every time:** find every `??`, every
bare `catch`, every `| null` return and every default branch on the path, and ask
**WHAT ELSE REACHES THIS**. If the answer is more than one thing, the cases are
being conflated, and the conflation will be read as the benign one - because the
benign one is what the screen or the check reports.

**Related, and they are the same family:** `ACC-vacuous-guard-sweep` carries the
six triage criteria (A-F) this came from. Criterion F is the one that generalises
furthest: **a guard proves a test RAN; only the assertion proves it tested the
right SUBJECT** - and on a shared seeded database, identity must mean RUN-SCOPED
identity, never a shared fixture's name.

### 1.4 Two reconciliations ruled by the owner, 2026-08-17

Recorded here rather than in a session report, because both are questions a fresh
terminal will hit again and neither is inferable from the code.

**FIRST: the rebase-versus-force-push conflict. THIS DOCUMENT WINS.** §1.1 makes
"rebase on `origin/main` before opening a PR" mandatory, and standing rule 12
lists force pushes as owner-confirmable. Those cannot both hold literally: a
branch that has been pushed cannot be rebased and pushed again without a force.

> **The ruling: `--force-with-lease` to a branch you ALONE own and that is
> UNMERGED is the permitted mechanism, and it needs no confirmation.** Force
> pushing to a SHARED branch, or to any branch AFTER it has merged, stays
> forbidden and stays owner-confirmable.

WHY `--force-with-lease` AND NOT `--force`, since the distinction is the whole of
the safety here: `--force-with-lease` refuses if the remote moved since you last
fetched it. On a branch you alone own, the remote moving means somebody else
touched it, which is exactly the case where a force push destroys work. The lease
turns "I am sure nobody else is here" from an assumption into a check the tool
performs. `--force` skips that check, which is why it is not what was permitted.

The rule-12 entry now names this exception in place, so a reader of the rule does
not have to find this section to know the exception exists.

**SECOND: the visual gate. GREEN SELF-MERGE STANDS, unchanged.** An executor
merges on the required checks. Ivan does NOT review pull requests, does not look
at diffs, and is not a step in the merge path.

> **Owner review of anything visual happens on DEPLOYED SCREENS, in batched
> WF-03 sittings, never on a PR.** This is standing practice, not a per-card
> decision, and it is why a staff- or patient-visible card stays `in_flight`
> after its PR merges: the merge is the build half, and the sitting is the
> evidence half.

The two halves are recorded differently on purpose. Build evidence is a PR and a
sha; acceptance evidence is `kind: screenshot` with what was observed. A card
carrying only the first is not finished, and the 2026-08-17 sitting is the worked
example - fifteen checks, one of them skipped, and the skipped one stayed open
rather than being counted.

---

### Standing rules, in full. These are not summaries; they are the rules.

1. **No prod-connected execution.** Never point a command, script, migration or
   test at the production database, the production Supabase project
   (`dfotoodqvmjhbdcxyaxf`), or any production console. Not read-only, not "just
   to check". If a task needs a prod read, you author the read-only script and
   Ivan runs it in his own shell and pastes the output back.
2. **No cloud writes.** No writes to Supabase, Vercel, Inngest, Resend, Twilio
   or any other console or API, in any environment you did not create locally.
3. **Credentials never enter your context. Environment variable NAMES only,
   never values.** If a value appears in your context anyway, say so
   immediately and treat it as an incident - the last one cost a password
   rotation. Never print, echo, log or commit a secret, and never read a
   `.env*` file to "verify" one.
4. **Recon before mutation.** Read the actual files before you change them.
   Never act on a remembered fact, a handoff summary, a chat claim or a board
   note without re-deriving it from the live system or the committed file. A
   handoff is a hypothesis; the repo is the evidence.
5. **Halt loud on premise mismatch.** The moment reality contradicts the brief,
   the board, or a doc, STOP and report it with the exact file paths and the
   two conflicting statements. Never resolve a mismatch by inventing a
   reconciliation, and never quietly pick the version that lets you continue.
6. **Definition of done is a number, a file, or an exit code.** "It works",
   "looks right" and "should be fine" are not done. Cite the passing command,
   the created path, or the exit status. Repo gates, run from the root in this
   order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
   `pnpm test:e2e` for anything touching a user-facing flow.
7. **Migrations: you author, Ivan applies, apply happens BEFORE merge.** You
   write the migration and open the PR. Ivan applies it from the
   `osteojp-prod-apply` worktree and pastes the journal output back. Only then
   does the PR merge. Two things that have gone wrong before and will again:
   the apply worktree must be checked out with `git checkout origin/<branch>`
   **detached** - a plain `git checkout <branch>` is rejected and `db:migrate`
   then silently no-ops on main; and a migration number is taken at BUILD time
   from whatever is free, never reserved in advance in a deferred card's notes,
   which is how the same number was double-booked twice.
8. **One migration in flight across the whole repo.** Not one per lane, not one
   per board. If another card anywhere holds an unapplied migration, yours
   waits.
9. **Commit messages and PR bodies go through `-F` or `--body-file`.** Never
   inline a multi-line body on the command line.
10. **Never commit to main, never push to main.** Feature branches only, named
    `<area>/<ticket-id>-<short-slug>`, e.g. `portal/PW-03-token-single-use`.
11. **Never commit secrets, `.env` files or credentials.** Check the diff before
    every commit.
12. **Destructive operations are owner-confirmable**: data deletion, dropped
    tables, force pushes, production writes, deleting files outside a scratch
    directory. Log them and block; never execute them yourself.
    **ONE NAMED EXCEPTION, ruled 2026-08-17, and it is narrow: see §1.4.**
    `--force-with-lease` to a feature branch you alone own and that is unmerged
    is permitted, because the mandatory pre-PR rebase cannot be pushed any other
    way. Every other force push is still owner-confirmable.
13. **No new third-party dependency or vendor without asking first.**
14. **Failure ceiling: three.** After three distinct failed fix attempts on the
    same card, stop, write down the failure state and everything tried, mark
    the card blocked with that note, and move to the next unblocked card.
15. **Never guess a product decision.** Log the question with a recommended
    default, mark the card blocked, move on. Never sit idle waiting.

---

## 2. Load order

Do this before anything else, in this order. Each step's output feeds the next.

1. **`git fetch origin --prune`.** Work from `origin/main`, not from whatever
   the working tree happens to be sitting on.
2. **Read `docs/board/portal-board.json` from `origin/main`.** This is **the
   state**: what is done, what is moving, what is blocked, and what proves it.

   **2a. MANDATORY, BEFORE YOU BELIEVE ANY OF IT: `pnpm board:reconcile`.**
   It asks the one question the validator does not — *is this board TRUE* — by
   checking every card against merged PRs and against the launch gate's own
   state. Exit 0 in sync, 1 on a mismatch, 2 if it could not ask. **It also runs
   in the REQUIRED CI check**, so main cannot carry a mismatch; running it at
   boot is how you find out that a card you are about to build from went stale
   between merges.

   > **A mismatch it reports is a PREMISE MISMATCH under rule 5. Halt and report
   > it. Do not flip the card to make the check pass** — the board being wrong
   > may mean an earlier session's REPORT was wrong too, and that is the owner's
   > to know. SEVEN cards have now carried a false `todo` (count updated
   > 2026-08-20). The fourth set put already-shipped work into a dispatch as the
   > next thing to build; the sixth was `SEC-allowconflict-not-audited` (#949);
   > the seventh was `LE-portal-booking-home-clinic-preselect`, which had been
   > finished by #855 for NINE DAYS.
   >
   > **THE RECONCILER CANNOT SEE THE SHAPE THE SEVENTH TOOK, and that is not a
   > gap in the reconciler.** Its stale-card rule keys on the PRs a card CITES
   > and its gate-claim rule on the gate a card CLAIMS. A card written BEFORE
   > the work and never touched after does neither, so both rules are silent -
   > correctly. `reconcile-board.mjs`'s own header names this as the third shape
   > of staleness. **The only thing that catches it is the rule at the top of
   > this document: re-derive every card from `main` before building it.** A
   > boot report saying the reconciler is clean says nothing about this class.
   >
   > A card that is legitimately open after its PR merged (WF-03 closes on the
   > owner's deployed screen, not on green CI) carries an explicit
   > `open_on_purpose: "<reason>"`. The reconciler prints every one of those in
   > full on every run: an exemption nobody sees is an exemption nobody revisits.
3. **Read the portal wave doc that the board's cards reference.** This is **the
   plan**: the eight loops, their order, and each loop's own definition of done.
   The board tells you WHICH card; the wave doc tells you HOW.
4. **Read the rulings register inside that wave doc.** This is **the law**:
   owner and counsel decisions that override any inference you might draw from
   the code. When the code and a ruling disagree, the ruling wins and the code
   is the bug.

**A pasted artifact link is a human render only. It is never read as truth.**
The line at the top of this file is for Ivan's convenience. If the artifact and
the JSON disagree, the JSON wins and the artifact is re-rendered.

**If the wave doc does not exist yet** (it was still being authored by YELLOW
when this board was seeded on 2026-08-04), say so in your first output and work
only from the board's own card notes, which carry each loop's scope. Do not
invent loop file paths, and do not renumber the cards to match a doc you cannot
read.

---

## 3. First output, mandatory, before any work

Your first message in the session is a **status report derived from the board
alone**. No file edits, no branch, no commands beyond the reads above.

It contains exactly these four things:

1. **Gate readiness `N/9`**, counted from `launch_gate.conditions[]` where
   `state == "pass"`. Counted, never estimated. Name which conditions pass.
2. **Every card with `status == "in_flight"`**, each with its evidence state:
   the evidence `kind` and `ref` if it has one, or the words "no evidence" if
   it does not.
3. **The single next card**, chosen by wave order first and `priority` second,
   skipping anything `blocked` or `halted`. One card. Not a shortlist.
4. **Any card whose board state contradicts what `origin/main` shows** - a card
   marked shipped whose PR is not merged, a card marked todo whose work is
   already on main, an evidence ref pointing at a PR that does not exist.

**A contradiction in item 4 is a premise mismatch. Halt loud.** Report the card
id, the board's claim, what `origin/main` actually shows, and stop. Do not
reconcile it silently, and do not "fix" the board to match reality as your first
act - the board being wrong may mean the last session's report was wrong too,
and Ivan needs to know which.

---

## 4. Work protocol

1. **Execute the next card per its loop file.** The loop file's definition of
   done is the card's definition of done. If the loop file and the card
   disagree, that is a premise mismatch - halt.
2. **Update `docs/board/portal-board.json` at every checkpoint.** A checkpoint
   is any state change worth a sentence: work started, blocked, unblocked,
   evidence obtained, shipped. Update `status`, `lane`, `evidence` and
   `last_checkpoint` together.
3. **Never hand-set `lane`. It is DERIVED**, and the validator recomputes it:
   `status == shipped` gives `shipped`; `home_lane == in_flight` **and**
   `status == blocked` **and** `blocked_on` is one of `ivan|jp|lawyer` gives
   `blocked_on_people`; otherwise `lane == home_lane`. Set `home_lane` (the
   card's KIND: `in_flight`, `rodica_batch`, `incidents`, `loose_ends`) and let
   the derivation place it.
4. **Evidence rules, enforced, no exceptions.** A card may not enter
   `status: "shipped"` with `evidence: null`. A gate condition may not be
   `state: "pass"` with `evidence: null`. Evidence is
   `{kind, ref, at}` where `kind` is one of `pr | journal | sha256 | e2e |
   screenshot`, `ref` is non-empty, and `at` is an ISO 8601 date. Write the ref
   so a stranger can re-verify it without asking you anything.
5. **A gate condition passes only when the WHOLE item is done.** Nine
   independent conditions, no partial credit. Partial work is a card, never
   gate credit. `readiness_passed` must equal the number of passing conditions
   or the validator fails you.
6. **Regenerate the render, then PUBLISH it. Do not commit it.**
   `node docs/board/render-board.mjs docs/board/portal-board.json`
   writes `docs/board/portal-board.rendered.html`, which is **gitignored**: it
   is a build product, the same as the pre-launch board's render. Never
   hand-edit it. Publish it to the artifact URL at the top of this file with the
   `url=` parameter, so the owner's link keeps working. Publishing without that
   parameter mints a NEW url and orphans his link.
7. **Run the validator before every commit that touches the board**:
   `node docs/board/validate-board.mjs docs/board/portal-board.json`
   **Exit 0 is required.** A red validator is a red gate; do not commit through
   it. Bump `as_of` to the current date whenever you touch the board - the
   render's answer-latency figures measure against it.
8. **Publish the board before the PR, not after.** The render is Ivan's only
   status surface; he should never be reading a board that is behind the work.
9. **EVERY APPLY BLOCK YOU DRAFT STARTS `NOT VALIDATED`.** Binding,
   2026-08-07. The first line of any apply block you write is, verbatim:
   `NOT VALIDATED - STRATEGY REVIEW REQUIRED - DO NOT RUN`.
   **Strategy replaces it with `VALIDATED`. You never remove your own.**
   **You never send an apply block to Ivan directly, in any form, in any turn** -
   not as a quoted excerpt, not shortened, not as "an example of what it will
   look like". The path is draft -> strategy -> Ivan, always.
   WHY, because the reason is not obvious and the rule looks like ceremony: an
   apply block is the one artefact here that is copied into a terminal pointed at
   PRODUCTION and run without further reading. Three blocks have already been
   defective while their migrations were fine - 0049 (a worktree path taken from
   prose), 0058 (no pre-check, so a backwards timestamp produced success over a
   no-op) and 0060 (as first drafted it could not prove a no-op migration had run
   at all). The review that catches a bad BLOCK is not the review that reads the
   migration. Full reasoning: docs/runbook-prod-migrations.md, "EVERY APPLY BLOCK
   IS UNVALIDATED UNTIL STRATEGY SAYS OTHERWISE".

10. **Gate vocabulary**, so the values do not read as a defect: the enum comes
   from the platform board and is deliberately not extended.
   `green_self_merge` means **executor-terminal self-merge**, and PURPLE is the
   executor on this board - read it as `purple_self_merge`. `owner_merge` means
   Ivan merges, and on any card carrying a migration it also means
   apply-before-merge. `owner_authorizo` is an explicit owner authorisation.
   `stakeholder` is an external party (counsel, the clinic).

---

## 4.11 THE OUT-OF-SCOPE LIST FOR SELF-MERGE SWEEPS. Committed 2026-08-20.

**THIS LIST PREVIOUSLY EXISTED ONLY IN CHAT DISPATCHES. It is committed here on
2026-08-20 to close that gap.** A terminal that booted stateless could not derive
it: it was carried from dispatch to dispatch in prose, and a session asked to
apply "the out-of-scope list" had nothing in the repository to apply. That is the
same class of defect §1.6 of the rulings register exists to end.

**Any future dispatch that says "out-of-scope list excluded" means THIS SECTION**,
and nothing else. If a dispatch means something narrower or wider, it must say so
in its own words rather than by reference.

### The list, verbatim as ruled by the owner

Cards excluded from self-merge sweeps:

1. **`VERIFY-QUEUE` items.**
2. **AUTORIZO-gated** cards - `gate: "owner_authorizo"`.
3. **`LAUNCH-*`** - any card whose id begins `LAUNCH-`.
4. **The legal family** - `END-legal-sweep` and its children.
5. **Force-rotation.**
6. **Sandbox-unskip.**
7. **Person-blocked** - `blocked_on` set to any person.

### What it selects, derived rather than judged

Run this and the answer is the same for every reader. It is deliberately a
predicate over committed fields, so applying the list is not a matter of taste:

```
node -e '
const b=JSON.parse(require("fs").readFileSync("docs/board/portal-board.json","utf8"));
const PEOPLE=["ivan","jp","lawyer"];
const out=(c)=>c.id==="VERIFY-QUEUE" || c.gate==="owner_authorizo"
  || /^LAUNCH-/.test(c.id) || /legal/i.test(c.id)
  || /force-rotation/i.test(c.id) || /sandbox/i.test(c.id)
  || PEOPLE.includes(c.blocked_on) || typeof c.deferred==="string";
for(const c of b.cards) if(c.status!=="shipped") console.log(out(c)?"OUT":"IN ", c.id);
'
```

On 2026-08-20, after the rulings of that date, that is **24 out, 24 in** of 48
open cards. **Re-run it rather than trusting the number** - it is a snapshot and
the composition moves under it. That same day the split stayed 24/24 while two
cards swapped sides: `LE-portal-multi-appointment-booking` went OUT on its
deferral and `LE-pedido-emit-best-effort` came IN when its person-block lifted.

### An eighth clause the owner's list does not name, because it did not exist yet

**A card the owner has DEFERRED carries a `deferred` field, and the predicate
above reads it.** `LE-portal-multi-appointment-booking` is the first, deferred
post-launch on 2026-08-20.

It is written as a FIELD and not as a sentence in `notes` for the reason
`reconcile-board.mjs`'s header already gives about `open_on_purpose`: a prose
marker stops matching the day somebody rewords a sentence, and **it fails OPEN**
- the sweep reads the card as available and builds the thing the owner deferred.
The validator enforces the field (non-empty, and never on a shipped card), and
`docs/board/validate-board.test.mjs` proves it in both directions.

**Deferred is not cancelled.** The card stays `todo` and stays on the board. What
a deferral records is WHEN, not WHETHER, and a sweep that reaches one skips it
**and says so in its report** rather than passing over it silently.

### Four things a reader will otherwise get wrong

**THE LEGAL FAMILY ADDS NO CARD OF ITS OWN TODAY, and that is not a mistake in
the list.** `END-legal-sweep` is `halted` and AUTORIZO-gated. Its two open
children, `LAUNCH-03a-caderno-encargos` and `LE-guest-queue-service-name`, are
already caught by clause 3 and clause 7. Do not go looking for a card the legal
clause selects alone; there is not one. The clause earns its place because a
future legal child might carry neither of those marks.

**`blocked` AND `halted` ARE ALREADY SKIPPED, by §3 item 3, and that is a
DIFFERENT mechanism from this list.** Keep them apart. §3 skips a card because
work on it cannot proceed; this list excludes a card because a sweep is not the
right instrument for it even when work could proceed. A card can leave `blocked`
and still be out of scope - and `LE-pedido-emit-best-effort` is exactly that case
as of the 2026-08-20 ruling, which removed its person-block and left it waiting on
a migration.

**A CARD BLOCKED ON A MIGRATION IS NOT ON THIS LIST AND DOES NOT NEED TO BE.**
§1.1 already forbids either lane authoring one, so such a card cannot be swept in
any case. If that constraint is ever lifted while this list stands, re-read the
card rather than assuming the list covers it.

**`owner_merge` IS NOT AN EXCLUSION.** It is a MERGE gate, not a build gate: a
sweep may build the card and open the PR, and stops there for Ivan. Only
`owner_authorizo` excludes, because that gate is about permission to start.
`LE-stale-auth-user-id-sweep` is the card this distinction currently decides, and
it is IN scope.

---

## 5. End-of-session protocol

Before your context is cleared, in this order:

1. **Make the board reflect reality, with evidence.** Every card you touched
   carries its true status and a ref that proves it. If something is half-done,
   say what half, in the card's notes. An optimistic board is worse than no
   board: Ivan reviews through it.
2. **Regenerate the render, run the validator, and confirm exit 0.**
3. **Commit and push** to your feature branch, and open or update the PR with
   `--body-file`.
4. **State this in your final report, verbatim**:
   `board current as of <sha>, next card <id>`
   where `<sha>` is the commit that carries the board update and `<id>` is the
   card the next session should pick up.

---

## 6. Board facts a fresh session needs

- **Nine launch-gate conditions, `PG1`-`PG9`**, mapping one-to-one to the nine
  portal Definition of Ready items: AUTH, BOOKING, APPOINTMENTS, NOTIFICATIONS,
  REMINDERS, EXPOSURE, ENVIRONMENT, SYNC, EXPERIENCE. Their titles quote the
  DoR text verbatim and **must not be edited to record progress** - doneness
  lives in `state`, `evidence` and `notes`.
- **DoR provenance:** the text was supplied by the owner on 2026-08-04 from the
  session handoff. Its permanent committed home is the portal wave doc. If the
  wave doc's DoR text differs from the gate titles when it merges, that is a
  premise mismatch - report it, do not silently retitle.
- **The eight `PW-xx` loop cards are DERIVED, not transcribed.** They are the
  eight DoR items that did not already pass, one card each, because the wave
  doc was not committed at seeding. The ids are provisional. When the wave doc
  merges, adopt its loop ids and file paths, and re-cut the cards if it draws
  different boundaries.
- **`PG5` (REMINDERS) is the only gate that passed at seeding**, on PRs #764 and
  #766. It does not mean reminders are live: `REMINDERS_LIVE_SEND` is false and
  is now the only thing between an approved body and a real patient's phone.
- **The `rodica_batch` lane is titled STAKEHOLDER FEEDBACK** on this board. The
  id is unchanged because the validator pins the exact lane-id set; only the
  title and the meaning differ. Portal-testing feedback lands there first and
  moves out into In Flight when dispatched.
- **`blocked_on` on this board is `ivan | jp | lawyer | infra` or null** (the
  people columns come from the board's own `blocked_on_people` lane). Rodica is
  not a portal stakeholder; counsel is.
- **The platform board is a different board.** `docs/board/prelaunch-board.json`
  tracks the staff platform pre-launch. Do not duplicate its cards here and do
  not edit it from a portal session.
- **The fingerprint is computed at render time**, not stored in the JSON:
  `sha256(JSON.stringify(board))` truncated to 16 hex chars, defined in
  `docs/board/render-board.mjs`. It exists so a browser holding an old snapshot
  can tell that a newer board exists. Do not add a `fingerprint` key to the JSON,
  and do not fold the config island into the fingerprint: it answers "did the
  board data change", and folding config in would fire the staleness notice on
  every viewer the first time a label changed.
- **The board portal is interactive.** Five views (Focus, Board, Launch gate,
  List, Timeline), drag and drop that rewrites state rather than position, an
  evidence-gated ship prompt, undo, and an Export that diffs against the
  committed seed and runs the validator's rules in the browser before you paste
  anything back. Edits live in the viewer's `localStorage`, never in the repo.
  Export names this board's own path, filename and validate command.

---

## 7. Copy-paste reference

**Working directories, one per lane. Do not build in the other lane's tree.**

| Lane | Absolute path |
|---|---|
| **PURPLE** | `/Users/ivan/Documents/Projects/GitHub/OsteoJP` |
| **AMBER** | `/Users/ivan/Documents/Projects/GitHub/osteojp-amber` - **STOOD DOWN**, writes nothing |
| migration apply, **NEVER build** | `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply` |

**THE CENSUS IS THREE TREES AS OF 2026-08-18.** `osteojp-cyan` was removed when
that lane was stood down and its chat retired: its branch had merged as #916
(0064 applied first, per rule 7), the tree was clean, and its last commit was
reachable through the squash. `osteojp-purple` was removed on the same day - a
duplicate terminal the owner had started by accident (see §7.0).

**PURPLE OWNS EVERY LANE NOW.** AMBER and CYAN both exist in this document as
history, because their rules explain why the boundaries are drawn where they are,
and because a lane may be restarted. Neither is writing today. If a tree appears
for either, §7.0 applies: report it before doing anything with it.

### 7.0 THE CENSUS RULE. Binding from 2026-08-17, and it has already paid for itself.

**`git worktree list` is part of the mandatory boot report, and EVERY TREE IT PRINTS
MUST APPEAR IN THE TABLE ABOVE. A tree that does not is reported before any work
starts.** Not investigated, not tidied away, not worked in: named in the first
output, and the session continues on its own card while the owner answers.

WHY, because the failure it catches does not look like a failure. On 2026-08-17 the
boot census printed a fifth tree, `osteojp-purple`, on a branch nobody in this lane
had created, with an open PR. It was reported rather than adopted or ignored. The
answer came back within the hour: **the owner had started a second Claude Code
session in a differently-named directory, and it had booted as PURPLE too.** Neither
session knew the other existed. Both were writing to the same board file, both
believed they were the only executor, and both were right about everything except
that.

**THE STRAY SESSION'S WORK WAS GOOD AND ITS PREMISES WERE NOT.** Its PR (#921, the
empty seed-guard blocklist) was a real and valuable safety fix, verified line by line
and merged. But it read a 159-card board when main carried 162, and it declined to
open a card because it believed AMBER and CYAN were both writing to the board -
AMBER is stood down and writes nothing. **A duplicate terminal does not produce
obviously wrong work. It produces work reasoned from a stale copy of the world**,
which is far harder to spot in a diff than a bug is.

So the census is cheap and the thing it detects is not: one `git worktree list`, read
against this table, before anything else happens.

**When a stray tree turns out to be a terminated or abandoned session:** verify its
branch is pushed and its tree clean, adopt or close its open PRs on their merits
(verify every claim against the diff, never against the PR body - a stray session's
description can be stale against its own branch, and #921's was), then
`git worktree remove` it so this census stays true. Removing a tree with uncommitted
work is destructive and owner-confirmable; removing a clean one whose branch is on
the remote loses nothing.

### 7.1 STANDING RULE, beside the table because it is about these trees

**Authored by AMBER, accepted verbatim by the owner 2026-08-12.** Reproduced
exactly as accepted; one substitution was already applied to AMBER's original,
an em dash became a semicolon, because the owner's formatting rule is absolute
and binds all terminal output. Do not reintroduce it and do not paraphrase.

> gh pr merge --delete-branch PARKS YOUR TREE ON main. It deletes the local
> branch and then checks out the default branch. No command you typed names
> main, so it is invisible unless you look. In this repo that blocks every other
> lane from checking out main, because one branch cannot be checked out in two
> worktrees. It has cost two sessions: AMBER after #863, PURPLE after #866.
>
> Re-detach in the same command block as the merge, every merge, without
> exception:
>
> ```
> gh pr merge <n> --squash --delete-branch && git fetch origin --prune && git checkout --detach origin/main
> ```
>
> Verify with git worktree list: every tree but the one that owns main must read
> (detached HEAD).
>
> Never check out main. When main moves under you mid-task, merge it by ref
> while detached (git merge origin/main). Do not try to clear another
> worktree's main with git branch -D main; git refuses, correctly, and that lane
> re-detaches its own tree.


`osteojp-amber` is a git worktree of the same repository, created 2026-08-11,
checked out **detached at `origin/main`**. Both lanes share one `.git`, so a
branch checked out in one tree cannot be checked out in the other - which is a
feature here, not a limitation: it makes an accidental same-branch collision
impossible.

**AMBER'S FIRST BOOT MUST RUN `pnpm install`.** A fresh worktree has no
`node_modules` (it is gitignored, so it is not shared with PURPLE's tree). The
board validator and renderer are plain Node and work immediately, but **`pnpm
lint`, `typecheck`, `test` and `build` will all fail until the install
completes**. Run it once, before the first gate run, not when the first gate
fails.

```bash
git fetch origin --prune
git show origin/main:docs/board/portal-board.json | less           # the state
node docs/board/validate-board.mjs docs/board/portal-board.json    # exit 0 required
node docs/board/render-board.mjs docs/board/portal-board.json      # regenerate the render
node docs/board/validate-board.mjs                                 # the platform board, unaffected
node docs/board/render-board.mjs                                   # the platform render, unaffected
```

Both boards run through the same renderer and the same client app. Everything
that differs between them (people set, labels, brandmark, paths, terminal
defaults) lives in `docs/board/board-config.mjs`, and nowhere else.

Governing spec: `docs/board/BOARD-SPEC.md`.
