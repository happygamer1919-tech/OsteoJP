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

- **The ruled Tier C list is EIGHT items, and only an owner ruling puts anything on it.** The TIERS block above names six, because that is the owner's sentence of 2026-09-19 and six is what the list held that day: `0090`, `0091`, `0092`, `0093`, NESA capacity, STAFF-10. **On 2026-09-20 he ruled a seventh in** - a Tier C migration splitting the tenant-only `FOR ALL` policies on `users`, `tenants` and `roles`, so a role or tenant-settings write is not open to every staff JWT - and pushed the other migrations down a slot each, which is where `0094` came from. It has no card and no PR yet. **On 2026-09-21 he re-ruled which number each item takes**, which moved the role fix from `0091` to `0093` and CARE-01 from `0092` to `0091`; membership of the list did not change, only the order. **On 2026-09-22 he ruled an eighth in and numbered it**: CARE-LOC, the location narrowing of CARE-01's patient-following view (ruled option (b) on 2026-09-21), takes `0092`, and RGPD-01, the role fix and the grants revoke each move down a slot. The list as it stands: **`0090` NESA names, `0091` CARE-01, `0092` CARE-LOC, `0093` RGPD-01, `0094` the users/tenants role fix, `0095` the grants revoke, NESA capacity, STAFF-10**, and nothing else. Read this bullet, not the TIERS line, for what is on the list today; the TIERS line is a quotation with a date on it. The Fisiozero production import is not on it and stays owner-executed under "Patient data isolation" and "Import execution rules" above, which these rulings do not touch. "It has a ruling somewhere" does not put an item on the list.
- **Which content each number means, RE-RULED BY THE OWNER ON 2026-09-21 AND AGAIN ON 2026-09-22.** The numbers are the authorisation, older specs used them differently, and the queue has now moved THREE TIMES - so read this table and not a number remembered from a branch name, a PR description or an earlier revision of this file.

  | number | content | PR |
  |---|---|---|
  | `0090` | `0090_nesa_patient_name_for_therapists` (applied to production, merged) | #1390 |
  | `0091` | CARE-01's care-team migration (applied to production, merged) | #1374 |
  | `0092` | CARE-LOC: the patient-following view stops at the therapist's own clinic | #1426 |
  | `0093` | RGPD-01's consent table | #1399 |
  | `0094` | the users/tenants/roles policy split (Tier C) | not yet opened |
  | `0095` | the TRUNCATE, TRIGGER, REFERENCES revoke | #1397 |

  **2026-09-22 IS THE THIRD RENUMBERING, AND IT ADDED AN ITEM.** CARE-LOC takes `0092`; RGPD-01 moves to `0093`, the role fix to `0094`, the grants revoke to `0095`. A PR description or comment naming `0092` for RGPD-01, `0093` for the role fix or `0094` for the grants revoke is stale by exactly the reasoning below, and is corrected rather than argued with.

  **THE SECOND RENUMBERING, AND BOTH EARLIER ONES WERE REAL RULINGS.** The 2026-09-19 dispatch bound four numbers (its items D3, D6, D7 and D8) with `0091` on CARE-01. The 2026-09-20 dispatch ruled a FIFTH migration into Tier C - the policy split - put it at `0091` and pushed the other three down one slot each, so `0094` appeared at the end and CARE-01 read `0092`; the three held PR descriptions were updated to that table the same day. **The 2026-09-21 dispatch re-ruled the order again**: CARE-01 back to `0091`, RGPD-01 to `0092`, the role fix to `0093`, the grants revoke unchanged at `0094`. The 2026-09-20 table was correct and binding for the day it stood - it is superseded, not a typo somebody made - which is why a PR description or a comment still naming `0092` for CARE-01 is stale rather than wrong-headed, and must be corrected rather than argued with. The TIERS block above names `0090, 0091, 0092, 0093` because that is the owner's sentence of 2026-09-19, quoted unchanged, and on that date those four numbers were four pieces of work. They are **five** now, by the owner's own ruling; see the closed-list bullet above, which says so plainly rather than letting a renumbering hide a new item.
  `docs/design/SPEC-0090-comms-02-reminder-log.md` and `SPEC-0091-registo-annulment.md` carry those numbers in their file names from before any of this was ruled; they are NOT the ruled items.
- **"Full apply protocol below"** points at the dispatch, which is not reproduced here. The protocol as committed lives in SR-50, SR-51, SR-58 and SR-59 on the board, in `docs/runbook-prod-migrations.md` (`verified-migrate.mjs` is compulsory), and in each `docs/migration-apply-NNNN.md`. Its operative parts, which those four rulings assume rather than state: the apply runs in a **fresh GREEN session launched with `scripts/apply-lane/osteojp-apply-settings.json`**, in the checkout `/Users/ivan/Documents/Projects/GitHub/osteojp-prod-apply`, detached on the held branch; that session authors nothing, edits nothing and merges nothing, and it did not write the artifact it is running.
- **What R1 did not change, measured on 2026-09-19 and corrected on 2026-09-21.** The first production apply attempted under R1 (0090, stage 1, after a 12 of 12 production pre-check with pending exactly 1) was refused by the harness classifier, reason "Production Deploy", and under R5 was not retried. That refusal was recorded here, until 2026-09-21, as "one lane authors, reviews and merges, and the owner applies". **That sentence is withdrawn.** What was MEASURED is only that the harness classifier refused it, reason "Production Deploy"; the classifier does not say which condition it read, and the earlier record was careful to say so. What is certain is separate and enough: the session that made the attempt had AUTHORED the artifact it was applying, so `allow[2]` would not have permitted it either, whatever the classifier was looking at. The attempt could not have been permitted, and it was never evidence that an apply must be done by hand. The answer is SR-70: **GREEN applies** - a fresh apply-only session, launched with the apply settings, that authored none of it. See the section "Who applies migrations" above, which is the governing text.

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