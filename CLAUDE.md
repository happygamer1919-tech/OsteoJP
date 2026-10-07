# OsteoJP Platform — Project Context for Claude Code

## What this is
Unified clinic platform for OsteoJP (Linda-a-Velha, Castelo Branco).
Replaces Fisiozero + Stylus.pt. Multi-tenant from day 1 (licensing path).
API-first: an external AI partner ingests clinical records via a signed endpoint.
Reference site: https://osteojp.pt — brand and tone source of truth.

## Hard architecture rules — do not violate
1. Every domain table has `tenant_id uuid not null`. No exceptions.
2. Every domain table has an RLS policy keyed on the JWT `tenant_id` claim.
3. Service-role queries (migrations, ingestion, jobs) MUST set `tenant_id` explicitly. Never global.
4. Clinical records have two orthogonal state machines, defined in `packages/db/src/schema.ts`:
   - `record_status` — lifecycle of every clinical record regardless of origin: `draft` → `locked` → `signed`. Locking makes content immutable (enforced by the BEFORE UPDATE OR DELETE trigger); signing attaches the therapist signature. Changes after locking create addendum versions.
   - `ai_review_state` — review queue for records arriving via the AI ingestion endpoint only. PLACEHOLDER values (`pending_review`, `in_review`, `approved`, `rejected`) pending the AI partner auth contract; refine in schema once signed off. AI ingestion never produces a `locked` or `signed` record directly — a human reviewer must accept the AI payload, after which the resulting `clinical_record` follows the standard `record_status` lifecycle.
5. Form templates are JSON-Schema-driven. Templates are versioned and immutable once referenced by a record.
6. Audit log writes on every clinical record mutation and every permission-sensitive action. No exceptions.
7. PII never appears in logs, error messages, or Sentry events. Sanitize before logging.
8. EU data residency: Supabase EU (Frankfurt), Vercel `fra1`, Resend EU. No US-region resources for stored data.

## Patient data isolation (Fisiozero import)
- No Claude terminal ever opens, reads, cats, greps, or samples patient data files from the Fisiozero delivery (amostra or final). This includes CSVs, ZIP contents, and any extracted files.
- Terminals author import and inspection scripts BLIND, against the caderno spec or against sanitized structure output pasted by Ivan.
- Ivan runs all scripts that touch delivery files. Evidence returned to terminals is limited to: column headers, row counts, file counts, encodings, extension patterns, sha256 hashes, exit codes, and validation error summaries that contain no personal data.
- Attachment filenames may contain patient names and are treated as personal data. Scripts report filename patterns and extensions only.
- Reason: patient health data entering an AI context creates an unapproved RGPD processor relationship.

### Exemption, ruled 2026-08-26: the August 2026 amostra only
- The August 2026 **amostra** is vendor-confirmed **synthetic test data** and contains no real patient data. Terminals MAY read it, and MAY execute the rehearsal against the **non-prod** project, sourcing the non-prod env file.
- **This exemption covers the amostra ONLY.** The final delivery contains real patient data and is **NEVER** exempt: every rule above applies to it in full.
- **The production run remains owner-executed**, per `docs/import/PROD-RUN.md`. Nothing in this exemption authorises a terminal to touch the production project, and standing rules 1 and 2 are unchanged.
- The exemption is about the DATA, not about the TARGET. A terminal may not point at production merely because the file it is holding is synthetic.

## Import execution rules (Fisiozero import)
- A LIVE import run requires the exact phrase `IMPORT FISIOZERO INTO PRODUCTION`, typed by Ivan once per window, IN ADDITION to `--apply`. `--apply` alone is refused.
- Import tooling exit codes are fixed: `0` OK, `1` FAILED, `2` BAD_INVOCATION. Every import script conforms.
- Ratified 2026-08-24. Before this, both were carried between dispatches in prose and a stateless terminal could not derive either — the failure PORTAL-REHYDRATE §4.11 exists to end.

## Who applies migrations (read this before anything else about applies)

**GREEN applies. The build lane never applies.** A production migration, or a write script the owner's
dispatch names by filename, is run by **GREEN: a fresh session launched with the apply settings, which
authors nothing, edits nothing and merges nothing.** Not everything that touches production is in that
set: a block only a human can paste into the Supabase SQL Editor stays the owner's, as does the
Fisiozero import fenced off above. GREEN runs what its settings let it run and no more. The lane that wrote a migration or its apply document is disqualified from running
it, always, by the settings themselves: `allow[2]` of `scripts/apply-lane/osteojp-apply-settings.json`
permits a production apply only when **"The agent did not author the artifact"**, among its other
conditions. That clause stays, and no lane ever edits that file.

The owner's part is two things and **both** are required by the settings: his dispatch **names that
exact migration or script**, and he launches the GREEN session. A session that is launched but handed no
filename applies nothing.

Owner ruling of 2026-09-21, recorded on the board as **SR-70**. It restores the configuration that
applied `0089`: the settings file on `main` is byte-identical to the installed copy, sha256
`ea1a9630f2a1ee6c418dad3ecd2e64a56ef25cc194b988989c4058ed8a06f195`. Nothing else about the one-lane
rulings below changes: SOLO still authors, reviews, arms and merges everything, and still prepares
every apply document with its sha256 sidecar and rehearses it on the throwaway DB. SOLO just never
runs the apply.

## Owner rulings, 2026-09-19: ONE LANE (SOLO), narrowed 2026-09-21 to one BUILD lane

Recorded on the board as **SR-64 to SR-69** (`docs/board/portal-board.json`, `rulings[]`), which is the register. They **supersede the lane rules where they conflict** (the owner's words): SR-63's separation of author and applier is superseded by SR-64, and SR-63 is marked, not deleted. BLUE, PURPLE and STEWARD are replaced by one lane, SOLO, which does all the authoring, reviewing and merging. **GREEN was folded in here on 2026-09-19 and taken back out on 2026-09-21: SR-70 RESTORES it as the apply lane, and with it the clause of SR-63 that SR-64 had set aside** - the author and the applier are never the same session. This sentence read "GREEN is not replaced" for two days; it was.

**R1 to R5, the tiers and the standing nevers below are the owner's sentences, character for character, from his dispatch of that date.** None of those lines is a paraphrase. SOLO's record is: the paragraph above, the last subsection, and the two indented *italic notes* sitting under R1 and under the TIERS C bullet. Those two were added on 2026-09-21, they label themselves, and they exist because the owner's sentences above them are quoted unchanged and can no longer be read alone - one on who applies, one on the migration numbers. An indented italic note under an owner line is a lane note, every time.

- R1 Single lane. "Author, merger, applier are three lanes" is replaced by R2 to R5.
  - *SOLO's note, 2026-09-21, not the owner's text: R1 is quoted above unchanged, and its APPLIER
    clause is superseded by SR-70. The applier is a lane again, and it is GREEN; the author and the
    applier are never the same session. R1 stands in every other respect - author and merger are
    still one lane, SOLO.*
- R2 Every PR arms `gh pr merge --auto --squash` at open. GitHub is the watcher. Never poll in a loop. Held migration PRs arm only after their apply is proven.
- R3 WIP cap: at most ONE PR in checks plus ONE being built. Never open a third. When a merge lands, run update-branch on the other (merge main in, no rebase, no force push), and recompute any file carrying a computed total.
- R4 REVIEWER: before arming any Tier B or Tier C PR, spawn a fresh-context subagent given ONLY the diff and the card acceptance. It returns PASS or a defect list. It never sees your reasoning. Defects are fixed and re-reviewed. Its verdict is pasted in the PR body.
- R5 If the harness classifier refuses a merge, an arm or an apply: do not retry, do not rephrase, do not route around it. Log it, continue with other work, list it under OWNER CLICKS in the report.

TIERS (your self-merge filter):

- A - UI, tests, docs, board, bug fixes touching no schema, RLS, grants, auth path, send path or money. Self-merge on green.
- B - server actions, data access, reminder logic, auth-adjacent app code, anything under .github/workflows or any required-check script. REVIEWER PASS plus green. A gate change must show, in the same run, that a seeded real failure still fails.
- C - migrations, RLS policies, grants, production data ops. Ruled items only (0090, 0091, 0092, 0093, NESA capacity, STAFF-10): full apply protocol below. Anything NEW in this tier: author, rehearse on the throwaway DB, hold unarmed with a question block (blocked_what, options, recommendation), move on.
  - *SOLO's note, 2026-09-21, not the owner's text: the four numbers above are the owner's sentence of
    2026-09-19 and are quoted unchanged. On 2026-09-20 he ruled a fifth migration into this tier - the
    users/tenants/roles policy split - and pushed the other items down a slot, so the ruled list is now
    0090, 0091, 0092, 0093 AND 0094. That is one item MORE than the sentence above names, added by the
    owner and not by this lane. THEN ON 2026-09-21 HE RE-RULED WHICH ITEM TAKES WHICH NUMBER. That is
    the SECOND renumbering of the same five items; the 2026-09-20 order was really ruled and really
    binding while it stood, and is superseded rather than wrong-by-typo. ON 2026-09-22 HE RULED A THIRD
    TIME, and the list gained an item: CARE-LOC is 0092, RGPD-01 is 0093, the users/tenants role fix is
    0094, the grants revoke is 0095, and CARE-01 stays 0091. The binding table is under "SOLO's record"
    below, and it is the one to read. "Full apply protocol below" means the
    protocol in that subsection; the apply itself is run by GREEN, never by the lane that authored it.*
- D - never autonomous: patient-facing copy, clinical, fiscal, legal or vendor decisions, env vars and flags (REMINDERS_*), secrets, deleting or rewriting production rows outside STAFF-10, branch protection, removing or loosening a required check. Card it with a question block.

Standing nevers: clinical authorship never moves; clinical_records_enforce_immutability never bypassed; registos never get a delete button; no psql allow rule; no rebase; no force push; no credential value printed, echoed or logged.

### SOLO's record, not the owner's text

- **The ruled Tier C list is NINE items, and only an owner ruling puts anything on it.** The TIERS block above names six, because that is the owner's sentence of 2026-09-19 and six is what the list held that day: `0090`, `0091`, `0092`, `0093`, NESA capacity, STAFF-10. **On 2026-09-20 he ruled a seventh in** - a Tier C migration splitting the tenant-only `FOR ALL` policies on `users`, `tenants` and `roles`, so a role or tenant-settings write is not open to every staff JWT - and pushed the other migrations down a slot each, which is where `0094` came from. It has no card and no PR yet. **On 2026-09-21 he re-ruled which number each item takes**, which moved the role fix from `0091` to `0093` and CARE-01 from `0092` to `0091`; membership of the list did not change, only the order. **On 2026-09-22 he ruled an eighth in and numbered it**: CARE-LOC, the location narrowing of CARE-01's patient-following view (ruled option (b) on 2026-09-21), takes `0092`, and RGPD-01, the role fix and the grants revoke each move down a slot. **Later on 2026-09-22 he ruled a ninth in**: `0096`, the booking conflict check returns a patient's name only where the caller's own reads would show it (Tier C, held, after `0095`). The list as it stands: **`0090` NESA names, `0091` CARE-01, `0092` CARE-LOC, `0093` RGPD-01, `0094` the users/tenants role fix, `0095` the grants revoke, `0096` the conflict check's patient name, NESA capacity, STAFF-10**, and nothing else. Read this bullet, not the TIERS line, for what is on the list today; the TIERS line is a quotation with a date on it. The Fisiozero production import is not on it and stays owner-executed under "Patient data isolation" and "Import execution rules" above, which these rulings do not touch. "It has a ruling somewhere" does not put an item on the list.
- **Which content each number means, RE-RULED BY THE OWNER ON 2026-09-21, 2026-09-22 AND 2026-09-27, AND BY THE OWNER AND THE LEAD ON 2026-09-30.** The numbers are the authorisation, older specs used them differently, and the queue has now moved FIVE TIMES, so read this table and not a number remembered from a branch name, a PR description or an earlier revision of this file.

  | number | content | PR |
  |---|---|---|
  | `0090` | `0090_nesa_patient_name_for_therapists` (applied to production, merged) | #1390 |
  | `0091` | CARE-01's care-team migration (applied to production, merged) | #1374 |
  | `0092` | CARE-LOC: the patient-following view stops at the therapist's own clinic (applied to production, merged) | #1426 |
  | `0093` | RGPD-01's consent table (applied to production, merged) | #1399 |
  | `0094` | the users/tenants/roles policy split (Tier C) (applied to production 2026-09-29, merged) | #1459 |
  | `0095` | the conflict check returns a patient's name only where the caller's own reads would show it (**re-ruled 2026-09-27**, was `0096`) (applied to production 2026-09-29, merged) | #1438 |
  | `0096` | CARE-02a: the care team reads the ficha and the registos, at the therapist's own clinics (**re-ruled 2026-09-30**, was `0098`) (applied to production 2026-09-30, merged) | #1471 |
  | `0097` | the registo write policies: `clinical_records` writes follow the permission matrix (ruled onto Tier C 2026-09-27 as the registo write fix) (**re-ruled 2026-09-30**, was `0099`) (applied to production 2026-10-01, merged) | #1475 |
  | `0098` | the index on `migration_staging_rows.imported_entity_id` (the "staging index") (**re-ruled 2026-09-30**, was `0097`) (applied to production 2026-10-01, merged) | #1469 |
  | `0099` | the TRUNCATE, TRIGGER, REFERENCES revoke (**re-ruled 2026-09-30**, was `0096`; before 2026-09-27 it was `0095`) (applied to production 2026-10-01, merged) | #1397 |
  | `0100` | MAINTAIN off `authenticated` in `public`, plus the matching default privileges, the same shape as `0099`; the catalog-only pilot of the SET LOCAL gate (**ruled 2026-10-01**, strategy S-1001-A R1 and R2). The read-only production measurement ran 2026-10-02 (R3): `authenticated` held MAINTAIN on 41 of 48 tables, and anon and PUBLIC held nothing (applied to production 2026-10-03, merged) | #1520 |
  | `0101` | the optional `email` column on `guest_booking_requests`, for the public booking form (**ruled 2026-10-04**, strategy S-1004-A R41; before that `0101` was SAT-01) (applied to production 2026-10-05, merged) | #1538 |
  | `0102` | SAT-01's migration (**re-ruled 2026-10-04**, was `0101`; before 2026-10-01 it was `0100`) (applied to production 2026-10-07, merged) | #1551 |
  | after `0102` | the episode-policy item (Tier C; its detail is private until it is applied), the Q9 guard and the anon SEQUENCES default, "in authored order" (**re-ruled 2026-10-04**; the episode-policy item was `0102`) | not yet authored |

  **2026-10-04: `0101` IS THE PUBLIC-FORM EMAIL COLUMN, AND SAT-01 MOVES TO `0102`.** Strategy's dispatch S-1004-A, its words: "R41 numbering: 0101 = public-form email column (owner's top priority, small). SAT-01 becomes 0102. Episode policy, Q9 guard, anon sequences follow in authored order. Rename the SAT-01 draft and branch now, while nothing is pinned. Applied records and the R36 raw file keep their names, add one board note explaining the renumber." This is the SIXTH time the queue moved. `0101` was applied on 2026-10-05 between 21:01 and 21:06 Lisbon (production journal 98 to 99). A PR, card or document still naming `0101` for SAT-01 is stale, and is corrected rather than argued with; `docs/migration-apply-0100.md` is an applied record and keeps its text.

  **2026-10-01: `0100` IS MAINTAIN, AND SAT-01 MOVES TO `0101`.** *(Superseded for SAT-01 on 2026-10-04, see above.)* Strategy's dispatch S-1001-A, its words: "R1 MAINTAIN on authenticated: REVOKE, tables in public plus the matching default privileges, same shape as 0099." "R2 Numbering: this is 0100 (catalog-only pilot of the SET LOCAL gate). SAT-01 becomes 0101, the episode-policy item 0102." "R3 Measurement before build." `0096` to `0099` were all applied by 2026-10-01 21:15 Lisbon (production journal 97). A PR, card or document still naming `0100` for SAT-01 is stale, and is corrected rather than argued with.

  **2026-09-30 IS THE FIFTH RENUMBERING, AND FROM IT APPLY ORDER EQUALS FILE ORDER.** Ruled by the owner and the lead on 2026-09-30; their words: "renumber (option 1). CARE-02a 0096 (#1471), registo write policies 0097 (#1475), staging index 0098 (#1469), grants revoke 0099 (#1397), SAT-01 from 0100. Apply order equals file order from now; the lead rules apply order only in number order or after a renumber." Why: `scripts/check-journal.mjs` rule 3 requires the journal's `idx` order to match the numeric order of the files on disk. The apply order ruled on 2026-09-29 (after ANEXO-LINK: CARE-02a, then the registo write policies, then the staging index, then the grants revoke) read `0098, 0099, 0097, 0096` under the old numbers, so the first apply would have put `0098` at journal idx 93, and a later `0096` or `0097` would then sit at a higher idx than a file it sorts before: rule 3 fails, and it cannot be relaxed. Renumbering makes the numbers follow the apply order. The four items keep their content, their bytes and their PRs; only the numbers moved. Their pending files are named for what they follow: CARE-02a follows `0095`, the registo write policies follow `0096`, the staging index follows `0097`, the grants revoke follows `0098` (`packages/db/migrations-pending/README.md` names each file). A file's own header comment may still name its old number, because a rename changes no byte; the file is never edited for it, because its sha256 is what every pin points at. The first sitting under this table is `0096` at journal idx 93, and the same ruling keeps its documented order: "its count GATE-CHANGE (26 to 27) keeps the documented order: promote, apply, count GATE-CHANGE, main into #1471, #1471." A PR title, description, comment, card or file name still naming `0098` for CARE-02a, `0099` for the registo write policies, `0097` for the staging index or `0096` for the grants revoke is stale, and is corrected rather than argued with.

  **2026-09-27 IS THE FOURTH RENUMBERING.** The owner's words: "Renumber: #1438 = 0095, #1397 = 0096. 0099 registo fix, SAT-01 from 0100." The conflict-name check and the grants revoke swap places; nothing else moves. A PR description, comment or file name still naming `0096` for the conflict check or `0095` for the grants revoke is stale, and is corrected rather than argued with.

  **2026-09-22 IS THE THIRD RENUMBERING, AND IT ADDED AN ITEM.** CARE-LOC takes `0092`; RGPD-01 moves to `0093`, the role fix to `0094`, the grants revoke to `0095`. A PR description or comment naming `0092` for RGPD-01, `0093` for the role fix or `0094` for the grants revoke is stale by exactly the reasoning below, and is corrected rather than argued with.

  **THE SECOND RENUMBERING, AND BOTH EARLIER ONES WERE REAL RULINGS.** The 2026-09-19 dispatch bound four numbers (its items D3, D6, D7 and D8) with `0091` on CARE-01. The 2026-09-20 dispatch ruled a FIFTH migration into Tier C - the policy split - put it at `0091` and pushed the other three down one slot each, so `0094` appeared at the end and CARE-01 read `0092`; the three held PR descriptions were updated to that table the same day. **The 2026-09-21 dispatch re-ruled the order again**: CARE-01 back to `0091`, RGPD-01 to `0092`, the role fix to `0093`, the grants revoke unchanged at `0094`. The 2026-09-20 table was correct and binding for the day it stood - it is superseded, not a typo somebody made - which is why a PR description or a comment still naming `0092` for CARE-01 is stale rather than wrong-headed, and must be corrected rather than argued with. The TIERS block above names `0090, 0091, 0092, 0093` because that is the owner's sentence of 2026-09-19, quoted unchanged, and on that date those four numbers were four pieces of work. They were **five** after 2026-09-20 and are **six** numbered migrations since 2026-09-22, by the owner's own rulings; see the closed-list bullet above, which says so plainly rather than letting a renumbering hide a new item.
  `docs/design/SPEC-0090-comms-02-reminder-log.md` and `SPEC-0091-registo-annulment.md` carry those numbers in their file names from before any of this was ruled; they are NOT the ruled items.
- **The label `held-for-apply`, ruled by the owner on 2026-09-22.** Every held migration PR carries it from the moment it opens, and it comes off when the PR arms (after the apply is proven, per R2). `.github/workflows/auto-update-prs.yml` does not merge main into a PR carrying it, so the branch an apply sitting runs from does not move under the sitting and a parked PR does not spend a CI cycle on every merge to main. The workflow change is a GATE-CHANGE the owner merges (#1434); until it lands, the label is already on the held PRs and the apply documents' HEAD CHECK still covers a moved head. Take it off BEFORE arming: an armed PR that is never updated sits BEHIND a strict main.
- **"Full apply protocol below"** points at the dispatch, which is not reproduced here. The protocol as committed lives in SR-50, SR-51, SR-58 and SR-59 on the board, in `docs/runbook-prod-migrations.md` (`verified-migrate.mjs` is compulsory), and in each `docs/migration-apply-NNNN.md`. Its operative parts, which those four rulings assume rather than state: the apply runs in a **fresh GREEN session launched with `scripts/apply-lane/osteojp-apply-settings.json`**, in the checkout `/Users/ivan/Projects/GitHub/osteojp-prod-apply` (the repositories moved out of `Documents` on 2026-10-03; an applied document that still names the old path is a record and is not edited), detached on the commit its document names; that session authors nothing, edits nothing and merges nothing, and it did not write the artifact it is running.
- **What R1 did not change, measured on 2026-09-19 and corrected on 2026-09-21.** The first production apply attempted under R1 (0090, stage 1, after a 12 of 12 production pre-check with pending exactly 1) was refused by the harness classifier, reason "Production Deploy", and under R5 was not retried. That refusal was recorded here, until 2026-09-21, as "one lane authors, reviews and merges, and the owner applies". **That sentence is withdrawn.** What was MEASURED is only that the harness classifier refused it, reason "Production Deploy"; the classifier does not say which condition it read, and the earlier record was careful to say so. What is certain is separate and enough: the session that made the attempt had AUTHORED the artifact it was applying, so `allow[2]` would not have permitted it either, whatever the classifier was looking at. The attempt could not have been permitted, and it was never evidence that an apply must be done by hand. The answer is SR-70: **GREEN applies** - a fresh apply-only session, launched with the apply settings, that authored none of it. See the section "Who applies migrations" above, which is the governing text.

### Owner rulings, 2026-09-27: review loops, agent prompts, sittings and held labels

The owner's words from his dispatch of 2026-09-27 are in quotation marks, character for character. The rest of each bullet is SOLO's record of how the lane applies them.

- **The review-loop cap.** "review-loop cap as you proposed (fix MINOR coverage gaps after round 3 and ship with a note; re-review only on MAJOR/BLOCKER or a production-touching byte)". So the R4 REVIEWER loop runs at most three fresh rounds on its own. After round 3, a MINOR finding is fixed, the fix is listed in the PR body as not re-reviewed, and the PR ships. A fourth round runs only when a finding is MAJOR or BLOCKER, or when a fix changes a byte that runs against production (a migration, a data-op stage file, an apply block, a target guard). Why: on 2026-09-26 and 27 two held ops ran 7 and 8 rounds without a PASS, because each fresh reviewer found one more untested expression. With it, the same dispatch ruled "one mutation sweep per op" (mutate every predicate and comparison of an op once, mechanically, and list the survivors, instead of letting reviewers find mutations one per round) and "build/rehearse/document as separate agents".
- **No sandbox bypass in any agent prompt.** "dangerouslyDisableSandbox forbidden in prompts, written into CLAUDE.md". No prompt SOLO writes for a subagent or a workflow asks for, suggests or permits `dangerouslyDisableSandbox`, and no subagent uses it. A step that needs it is a step the harness has not allowed: it stops and is reported under R5.
- **Sittings only while the clinics are closed.** "Sittings only while the clinics are closed." Every GREEN dispatch SOLO prepares for a production write names a run window that falls outside both clinics' opening hours, and its first block checks the Lisbon clock by machine. Nothing in an op file carries the date: the dispatch names it, and the op reads the run day from the clock.
- **The ruled Tier C list grows by four, by the same dispatch.** "B14 on the Tier C list, option (a)": ANEXO-LINK v2, the held data op of #1458. "0097 and 0098 authored now": `0097` is the index on `migration_staging_rows.imported_entity_id` (the "staging index" the owner numbered `0097` on 2026-09-24, held, after `0096`), and `0098` is CARE-02a, the care team reading the ficha and the registos, held. SAT-01's migrations are "numbered after 0098, held". The closed-list bullet above is the record as of 2026-09-22; read this bullet with it. The numbers in this bullet moved on 2026-09-30 (the fifth renumbering): the staging index is now `0098` and CARE-02a `0096`.
- **The fourth renumbering and a tenth Tier C item.** "Renumber: #1438 = 0095, #1397 = 0096. 0099 registo fix, SAT-01 from 0100." The registo write fix was ruled onto the Tier C list the same night (the owner's "yes" to putting it there); it takes `0099`, and its detail stays private until it is fixed because the repository is public. The binding number table is the one under "SOLO's record" above.
  **Superseded by the fifth renumbering, 2026-09-30:** the registo write policies are `0097`, CARE-02a `0096`, the staging index `0098` and the grants revoke `0099`; SAT-01 still starts at `0100`. See "2026-09-30 IS THE FIFTH RENUMBERING" under "SOLO's record" above.
- **The owner takes `held-for-apply` off.** On 2026-09-26 the harness refused a SOLO call that removed the label from a held PR together with a title and body edit, and under R5 it was not retried. From then on, removing the label from a held PR and merging it are the owner's two clicks, listed under OWNER CLICKS in the report. SOLO never puts a label change in the same command as any other edit: a refused call takes the harmless part down with it.

### Lead ruling, 2026-09-30: a rehearsal never gets past a guard

The lead's words, character for character: "A script's own REFUSE or STOP line is a halt, the same as a harness refusal. Never edit an env file, a URL, a flag, a label or a script to get past a guard. A block that cannot run on the throwaway is recorded as NOT REHEARSED and the document says so." The same ruling puts that sentence, verbatim, into every rehearsal prompt SOLO writes for a subagent or a workflow, from 2026-09-30 on.

- *SOLO's record, not the lead's text: why.*
  - **The incident.** On 2026-09-30 (~17:40 Lisbon) a rehearsal subagent passed `packages/db/scripts/read-applied-migrations.mjs`'s production-only guard on a local throwaway. It put the production project ref into the throwaway's URL as an `application_name` label, which its prompt did not list.
    - Only 127.0.0.1 was contacted. SOLO deleted the env file, and the harness flagged the report `[Security Weaken]`.
    - The lead voided that rehearsal (0097's) and ordered it redone under this rule.
  - **The technique was not new.** SOLO searched every rehearsal transcript of the session. The same technique, each run with its own label string, had passed the same guard in four earlier runs, all on 127.0.0.1: the rehearsals behind the 0094, 0095 and 0096 apply documents, and 0099's own rehearsal of 2026-09-30 (13:54 to 14:11 Lisbon).
    - Corrected 2026-09-30: this line first said "one prep rehearsal of 2026-09-29"; it was 0099's own rehearsal.
    - None of those runs is evidence for the reader's journal read, and each of the three applied documents now says so in a correction section.
    - **SOLO's prompts invited it.** The 0094 and 0095 rehearsal prompts told the agent to use "the guard override earlier rehearsals used", and the 0096 prompt said to substitute "the production guard the way earlier rehearsals did". A prompt names each allowed substitution, and never points at "the way earlier rehearsals did".
  - **The cause, beyond the agents, as it stood until the guard fix merged.** Neither guard checked where the connection went.
    - The reader tested the whole connection string for a substring: `url.includes(PROD_REF)`.
    - `scripts/assert-production-target.mjs` took the ref from the part of the username after its last `.` and checked the port. It never checked the host.
    - So a local URL could pass the reader if the ref appeared anywhere in it, and could pass the target guard if its username carried the ref.
    - **The fix** is the pair `sec/INC-guard-parse-host-db` (Tier B) and its GATE-CHANGE, merged after 0097 is applied.
      - Both guards run one shared check, `scripts/production-target.mjs`. It compares the PARSED ref, host, port and database, and refuses any string the parsers would read differently.
      - The target guard also refuses `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE` and `PGOPTIONS`, and the shared check refuses an `options` query key: Supabase's pooler reads a tenant from `options` before the username.
      - The new pins go into later documents only.
  - The incident card is `INC-rehearsal-subagent-passed-the-reader-guard`.

### Strategy rulings, 2026-10-01 and 2026-10-02: an amended document is reviewed, and when a sitting may run in clinic hours

Strategy's words, character for character, from dispatch S-1002-A (2026-10-01 23:58 Lisbon):

- "R8 STANDING RULE (V1 defect): a document amended for an owner override gets one R4 round on the changed bytes before the READY line. "Start now" from the owner does not waive it."
- "R9 DAYTIME APPLIES, owner ruled B, from 0100: a clinic-hours sitting is allowed only when all three hold, each proven in the apply document: (1) the SET LOCAL gate is on main; (2) the migration is catalog-only or touches no table reception writes; (3) the read-only pre-check ran on production in an earlier sitting, output recorded. Else closed hours. Propose the stage 0 arm in 0100's document; R4 covers it."
- "R10 #1510 values 5s and 60s accepted. Observer stays out; card it as its own GATE-CHANGE pair after 0100."

- *SOLO's record, not strategy's text: why.*
  - **R8.** On 2026-10-01 the owner ruled 0097, 0098 and 0099 to run that afternoon. His message is timestamped 16:13:42 Lisbon; the documents and dispatches said 16:10, a rounding. `docs/migration-apply-0097.md` was amended at `ac96d859` to accept that date in its clock and clinic overrides, and GREEN ran it on production with no R4 round on the changed bytes. They were proved on the cut lines only. Strategy found it in verification V1 of S-1001-A.
  - **R9** replaces, from `0100`, the per-day owner overrides of 2026-09-30 and 2026-10-01. Those were date-locked by machine in the 0096 and 0097 documents and do not carry forward. The rule of 2026-09-27, "Sittings only while the clinics are closed", stands for every sitting that does not meet all three conditions.
  - **R10.** The SET LOCAL gate is `scripts/migration-timeouts.test.mjs` (#1510): from `0100`, the first two statements of every migration are `SET LOCAL lock_timeout = '5s';` and `SET LOCAL statement_timeout = '60s';`. The observer is carded as `VM-observer-gate-change-pair`, and its code is kept on branch `db/VM-observer-pair-code`.

### Strategy rulings, 2026-10-03 and 2026-10-04: halts, clinic hours, policies, gate edits, and which commit a sitting runs from

Strategy's words are in quotation marks, character for character, from dispatch S-1004-A (2026-10-04 22:55 Lisbon). The rest of each bullet is SOLO's record.

- **Explicit halts.** "Explicit halts in every block, never set -e. No gate edit inside a sitting."
  - *SOLO's record: why.* In a Claude session a pasted block runs as `... && eval '<block>' ...`, where zsh ignores `errexit`, the block's own subshell included. `set -e` therefore stops nothing there. Every command a later line relies on carries its own `|| { echo "STOP: ..."; exit 1; }`.
  - The gate is the fault-injection test each apply document ships with: it runs every block in that harness shape, in bash and in zsh, with each command made to fail in turn, and fails if the block goes on. `scripts/maintain-revoke-0100.test.mjs` and `scripts/guest-request-email-0101.test.mjs` are the two on main.
- **Clinic hours are a weekday table, from `0101`.** *SOLO's record of strategy's ruling of 2026-10-03 (S-1003-A, R29), not its words:* open Monday to Friday 08:00 to 21:00 and Saturday 08:00 to 13:00, Lisbon time; closed Sunday. Production holds one opening and closing time per location and no weekday, so the table lives in each apply document and is checked by machine, with `TZ=Europe/Lisbon` on every clock read and a STOP unless the zone reads WET or WEST.
- **A migration that creates a policy.** "Standing: any migration that creates a policy is closed-hours only, never eligible for R9."
  - *SOLO's record: why.* Measured on a throwaway on 2026-10-03: a `CREATE POLICY` run as `postgres` takes ACCESS EXCLUSIVE on every table the platform's `supautils.policy_grants` setting names (the login, storage and realtime tables), until the COMMIT. So such a file puts its `CREATE POLICY` statements last. Production's setting has not been read.
- **Gate edits around a sitting.** *SOLO's record of S-1003-A R35 and the sentence quoted above:* each gate edit is its own `GATE-CHANGE` pull request, merged by the owner on green; the ones a promotion needs merge before the promotion; a count edit the apply forces merges after GREEN reports.
- **Which commit a sitting runs from, as it has stood since `0100`.** *SOLO's record, not a ruling:*
  - `0100` and `0101` were MERGED first (the owner took `held-for-apply` off and merged), and GREEN applied from the merge commit on `main`. Their blocks name `origin/main`. Nothing on `main` read the new state before the apply.
  - A migration that creates SECURITY DEFINER functions cannot merge first: a required check counts those functions on a database built from `main`. It is applied from the HELD head, and the count's `GATE-CHANGE` merges after GREEN reports, as with `0096` and `0097`. `0102` is of this kind, and ran that way on 2026-10-07: applied from the held head of #1551 (00:17 to 00:22 Lisbon, production journal 99 to 100), then the count's `GATE-CHANGE` (#1557), then `main` into #1551, then the owner's two clicks on #1551, then the cleanup test's `GATE-CHANGE` (#1563).
    - **Between the count's `GATE-CHANGE` and the held pull request, `main` is red for every other pull request** (it expects functions its migrations do not create yet). Those two merges are done back to back. On 2026-10-07 an incident came between them and an urgent fix could not go green until #1551 had merged.
  - Strategy's S-1004-A also says: "Any held-for-apply PR waits for the owner's label removal after GREEN reports." That describes the second kind. For `0101` the lane followed the applied precedent and the reviewed blocks, and reported the difference.
- **The apply settings file is no longer byte-identical.** *SOLO's record, 2026-10-05:* since the move of 2026-10-03 the installed copy names `/Users/ivan/Projects/GitHub` in three trust lines (the owner's edit), while `scripts/apply-lane/osteojp-apply-settings.json` on `main` still names the old path and still hashes to the sha256 recorded under "Who applies migrations". No lane edits that file; bringing the repository copy in line is the owner's.

### SOLO's record, 2026-10-07: a change to a background job's settings is not live at merge

*Not an owner ruling. A fact measured on 2026-10-07, and the lane's rule until the owner decides otherwise (board card `OPS-scheduler-settings-sync-is-manual`).*

- The Inngest app `osteojp-reminders` is synced BY HAND. On 2026-10-07 its last sync was 2026-08-03. A job's CODE follows every deploy; a job's SETTINGS (its triggers and their `if`, `cancelOn`, `idempotency`, `singleton`, `debounce`) are whatever Inngest stored at the last sync. So #762, #764 and #1562 were merged and deployed and NOT active until the owner pressed Resync.
- **So a pull request that changes the options of an `inngest.createFunction` call is not done at merge.** Its body says so; the report lists under OWNER CLICKS: Apps, `osteojp-reminders`, Resync; and the owner (or a screenshot from him) confirms the new settings in the function's configuration panel. No lane triggers the sync: it is a call into production.
- **Never send `appointment/scheduled` twice with the same Inngest event id.** Since #1562 the reminder's duplicate key carries the id of the event that scheduled it, so a repeated id cancels the waiting reminders and then drops their replacements (measured on the Inngest dev server on 2026-10-07). The application sends no id of its own. An owner-run script that supplies ids must make them unique per send.

## Stack
- Next.js 16 App Router, TypeScript strict
- shadcn/ui + Tailwind v4
- Drizzle ORM + PostgreSQL (Supabase EU)
- Supabase Auth (JWT with tenant_id + role claims)
- Supabase Storage (signed URLs only, never public)
- Inngest for background jobs
- Vercel hosting (region: fra1)
- Sentry (EU)
- pnpm + Turborepo
- Vitest + Playwright

## Repo layout
- `apps/web` — staff platform (Next.js)
- `apps/admin` — superadmin (tenant management, system ops)
- `packages/db` — Drizzle schema, migrations, RLS policies
- `packages/ui` — shadcn components, brand tokens
- `packages/auth` — permission matrix, JWT helpers
- `packages/ingestion` — AI partner ingestion contract + validators
- `packages/integrations` — InvoiceXpress, IfThenPay, Stripe, Twilio, Resend

## Permission matrix (server-enforced, do not relax client-side)
| Action | Admin | Therapist | Receptionist |
|---|---|---|---|
| View any patient | ✓ | ✓ (own only) | ✓ |
| View clinical records | ✓ | ✓ (own patients only) | ✗ |
| Edit clinical records | ✗ (read only) | ✓ (own, until locked) | ✗ |
| Schedule appointments | ✓ | ✓ (own calendar) | ✓ |
| Issue invoices | ✓ | ✗ | ✓ |
| Manage users/roles | ✓ | ✗ | ✗ |
| Tenant settings | ✓ | ✗ | ✗ |

Enforcement: server-side check in every API route + RLS as defense-in-depth.

## Languages
Portuguese (default), English (secondary). All user-facing strings via i18n keys. Patient communications respect per-patient preference.

## Coding conventions
- Server actions over API routes when possible.
- No `any`. If forced, comment why.
- Database access: only through `packages/db`. No raw SQL in app code.
- All dates in UTC in DB, Europe/Lisbon for display.
- Money: integer cents, currency on the column. Never floats.
- File uploads always go through signed URLs; never proxy through the Next.js server.
- Tests live next to code: `foo.ts` + `foo.test.ts`.

## Naming
- Tables: `snake_case`, plural (`patients`, `clinical_records`).
- TS: `camelCase` vars, `PascalCase` types/components.
- Routes: `/api/v1/...` with explicit versioning.

## Brand
- Logo: teal #45B9A7, magenta #8B1863, soft grey wordmark #98B2C2.
- Canonical palette source: `Logotipo_OsteoJP_2023.pdf`, sampled at 300 DPI (confirmed true vector). These sampled hexes are canonical and supersede any earlier approximations.
- Typography: clinical, generous spacing. Inter or similar.
- Tone: serious, precise, not warm. "Padrão ouro." No emoji in product UI.
- Print branding on every report, declaration, invoice: logo + location contacts + fiscal info.

## Tone for Claude Code's own output in this repo
- Direct. No motivational filler. No "great question."
- Correction over validation. If a request is wrong, say so with reasoning.
- Flag missing context explicitly rather than guessing.
- When a decision touches owner-confirmable scope, log it to docs/QUESTIONS.md with a recommended default, mark the ticket blocked, and continue with the next unblocked ticket.

## Owner-confirmable items (do not auto-decide)
- Anything touching invoicing legal compliance
- Anything touching clinical data retention beyond defaults
- Anything that changes the V1 vs V1.1 scope line
- Anything that introduces a new third-party vendor

## Supabase setup
- PRODUCTION project: `dfotoodqvmjhbdcxyaxf` (the "new prod"), region Central EU
  (Frankfurt). The prod DB connection lives in `~/osteojp-secrets/new-prod.env`
  (`DATABASE_URL_DIRECT` = session pooler :5432 for migrations; `DATABASE_URL` =
  transaction pooler :6543). The earlier ref `jaxmkwoxjcgzkwxgbayx` is the OLD prod
  and is retired — do not target it.
- Use the `supabase` CLI for all migrations and schema operations (`supabase db push`, `supabase migration new`).
- `supabase-js` is used only for auth flows. Application-layer queries go through Drizzle ORM via `packages/db`.
- `supabase/.branches/` and `supabase/.temp/` are gitignored. `supabase/migrations/` and `supabase/config.toml` are tracked.

## Vercel project setup checklist
Apply to every new Vercel project created under the OsteoJP platform.

- Settings → General → Data Preferences → disable "Improve models with this project's data". Per-project on Hobby tier; disable both the project toggle AND the team toggle on Pro.
- Settings → Build and Deployment → Node.js Version → set to 22.x (match local dev environment).

Healthcare data sensitivity (GDPR, clinical records). Defense in depth from project creation.

## Out of scope for V1 (do not build, ignore in PR reviews)
Patient portal, WhatsApp, mobile app, telehealth, insurance, waitlist, loyalty, pilates module, Formação module, CID-10 mandatory enforcement, full historical archive migration.

## Definition of done (gates, all must pass before any commit)
Run from repo root, in this order:

- pnpm lint
- pnpm typecheck
- pnpm test (Vitest, includes RLS isolation tests)
- pnpm build
- pnpm test:e2e (Playwright) for any ticket touching user-facing flows

A ticket is done only when: gates green, PR opened with the standard format,
ticket status updated, DECISIONS.md appended.

## Backlog

- Tickets live in the task graph (streams D, E, F pattern: numbered tickets
  with explicit dependencies and status).
- Pick order: next unblocked ticket in the active stream. If the whole stream
  is blocked, switch streams and note the switch in DECISIONS.md.
- Never start work that has no ticket. If the owner gives an ad-hoc instruction,
  create the ticket first, then execute.

## RLS verification (project-specific, non-negotiable)

- Every migration adding a domain table must ship with: tenant_id column,
  RLS policy, and an isolation test in the same PR.
- RLS isolation tests MUST run in CI (GitHub Actions). If they are skipped or
  absent from the workflow, treat it as a red gate and fix before feature work.

## Preview verification for PRs
Every PR checklist must reference the Vercel preview deployment URL and include
role-specific steps (test as Admin, Therapist, Receptionist where relevant),
since the permission matrix is the core risk surface.

## Human-only setup (do not attempt via CLI or automation)
The "Vercel project setup checklist" section is executed manually by the owner
in the Vercel dashboard. Do not attempt it. If a new Vercel project is created,
open a QUESTIONS.md item reminding the owner to apply the checklist.

## Environment and secrets

- Local secrets live in .env.local (gitignored). Production secrets live in
  Vercel and Supabase dashboards only.
- If a required env var is missing, do not stub or hardcode it: log to
  QUESTIONS.md, block the ticket, move on.