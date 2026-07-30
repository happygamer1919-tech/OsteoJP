# OsteoJP — GREEN executor handoff (2026-07-30 session close)

You are the next **GREEN executor + board keeper** for OsteoJP. This is the full
state at handoff. The **loop files in `docs/loops/prelaunch/` and the board JSON
outrank any chat prompt.** Read this, then work from repo ground truth (git, the
board JSON, DECISIONS/QUESTIONS), not from memory of what "should" be true.

`main` HEAD at handoff: `e885a5e`. Next free migration number: **0051**.

---

## 1. Repo, environment, shell gotchas

- **Canonical repo:** `~/Documents/Projects/GitHub/OsteoJP` (remote
  `happygamer1919-tech/OsteoJP`, https). Loops run in git worktrees under
  `~/Documents/Projects/GitHub/osteojp-*` (there are ~40; `git worktree list`).
- **`main` is checked out in the `osteojp-prod-apply` worktree**, NOT in the
  canonical repo. So `git checkout main` in the canonical repo FAILS ("main is
  already used by worktree"). Work on feature branches cut from `origin/main`
  (`git checkout -b <branch> origin/main`). This also makes `gh pr merge` print a
  harmless "failed to run git: 'main' is already used by worktree" AFTER a
  successful merge — the merge still lands; verify with `git log origin/main`.
- **Prod Supabase = `dfotoodqvmjhbdcxyaxf`** (Central EU / Frankfurt). Retired ref
  `jaxmkwoxjcgzkwxgbayx` — never target it. Prod is real-data only; all QA on local
  Docker (`supabase status` → `127.0.0.1:54322`, currently UP).
- **Shell gotcha (this machine, this session):** `grep` and `find` in the Bash tool
  frequently return NOTHING even when matches exist. Use `rg` (ripgrep) or a small
  `node -e` / `python3` filter for any text search. Don't trust an empty grep as
  "no matches".
- **`Date.now()`/`new Date()` restriction applies only to Workflow scripts**, not
  app code. In app/server code `new Date()` is fine.

---

## 2. The pre-launch board (source of truth + the live artifact)

- **Source of truth = `docs/board/prelaunch-board.json`.** The claude.ai artifact is
  only a RENDER of it. Owner keeps ONE board artifact, maintained IN PLACE:
  **https://claude.ai/code/artifact/83e26fe7-034c-4fb8-b45b-b1165a843d6d**
  (title "OsteoJP · Pre-Launch Board", favicon 📋). Re-publish with the Artifact
  tool passing `url=` that URL — NEVER re-mint a new one. Load the `artifact-design`
  skill before publishing; the render is already designed (board.css/board-app.js),
  so honor it, don't redesign.
- **Workflow to change the board:**
  1. edit `docs/board/prelaunch-board.json`
  2. `node docs/board/validate-board.mjs docs/board/prelaunch-board.json` (must be
     BOARD VALID)
  3. `node docs/board/render-board.mjs docs/board/prelaunch-board.json docs/board/prelaunch-board.rendered.html`
     (the rendered HTML is gitignored — a build product)
  4. commit the JSON, open a PR, self-merge on green (docs-only)
  5. re-publish the rendered HTML to the artifact URL above.
- **Card schema** (validator-enforced; see `docs/board/validate-board.mjs`):
  `{ id, title, lane, status, owner_terminal, gate, evidence, blocked_on,
  last_checkpoint, notes }`.
  - `lane` ∈ `launch_gate | blocked_on_people | in_flight | rodica_batch |
    incidents | loose_ends | shipped` (cards may NOT use `launch_gate`).
  - `status` ∈ `todo | in_flight | halted | blocked | shipped`.
  - `gate` ∈ `green_self_merge | cyan_clear | owner_merge | owner_authorizo |
    stakeholder`.
  - `blocked_on` ∈ `null | ivan | jp | rodica | infra` (a `blocked` card needs a
    non-null one; a `blocked_on_people` card needs ivan|jp|rodica).
  - `evidence` is `null` OR `{ kind, ref, at }` with `kind` ∈
    `pr | journal | sha256 | e2e | screenshot`, non-empty `ref`, ISO `at`.
    **A `shipped` card MUST carry evidence; a `pass` launch gate MUST carry
    evidence.** Add new cards after the last card in the `cards` array; bump
    `as_of`.
- **To add the owner's new cards:** append card objects (unique ids — next in the
  PL series is **PL-14**; PL-01..PL-13 are taken), validate, render, self-merge,
  re-publish the artifact.

---

## 3. What shipped in this session (2026-07-30)

All merged to `main` and (for migrations) applied+verified on prod:

- **PL-09** (before this session): full role+location access model, migrations 0047
  (patients RLS) + 0048 (appointments RLS + `appointment_conflicts` SECURITY
  DEFINER). Board card added #703.
- **PL-10** (#704): agenda name-line compacted — `shortPatientName` (first+last
  only), `text-xs` + `font-normal`; hover keeps the full name.
- **PL-11** (#705): appointment-save unblock. **Migration 0049** added the
  `created_by = auth.uid()` author escape to `appointments_rls` (a located
  admin/reception couldn't save out-of-clinic). Availability made advisory (warns,
  never blocks). Applied+verified on prod.
- **PL-12** (#706): therapist self-lock on the create form (logged-in therapist
  auto-selected, no therapist picker; service still preselected-not-restricted).
- **PL-13** (#709): **appointment notes editable in place + last-edited stamp**.
  **Migration 0050** added `edited_at` + `last_edited_by` to `appointment_notes` +
  the in-tenant `appointment_notes_tenant_update` policy (DELETE still denied).
  `editAppointmentNoteAction` + pen-edit UI on the patient **Notas** tab ("Editada
  por X · datetime"); legacy `patient_note_revisions` rows are read-only. Applied+
  verified on prod.
- Board reconciliations: #703 (PL-09), #708 (PL-11/12/13 cards), #710 (PL-13 →
  shipped). Board now **26 cards, 16 shipped, launch readiness 7/9**.
- **Answered questions:** Q-PL-13-1 = editable-with-stamps (owner). Q-PL-11-1 = keep
  the appointments escape author-specific (safer, preserves PL-09).

Full narrative in `docs/DECISIONS.md` (2026-07-30 entries) and `docs/QUESTIONS.md`.
Migration numbers used through 0050; **next free = 0051**.

---

## 4. Current state — what's open

**Launch gate: 7 / 9 (counted, never estimated).** Open (both owner/people-side):
- **G2** (Ivan): `REMINDERS_LIVE_SEND` env on osteojp-platform + osteojp-api +
  Twilio creds + `INNGEST_EVENT_KEY`, then a canary booked THROUGH the prod UI
  (a raw DB insert won't emit the Inngest reminder). Cleanup staged at
  `~/osteojp-mailbox/staged/canary-cleanup.mjs`.
- **G8** (JP): lawyer sign-off on the RGPD package (Twilio EU transfer already
  verified).

**Blocked cards (owner/people/infra):** PL-04 (Rodica — NESA ambiguity), INC-02a/b
(Ivan — Rodica test target + purge synthetic `Teste CB`, needs AUTORIZO),
JP-role-defect + JP-mapping-frozen + INC-03-0045-jp-write (Ivan — JP role admin→owner
+ mapping), CANARY-reminder (Ivan), LE-ci-quarantine-reenable (infra — re-enable
`therapist-blocks.spec.ts:97` on CI when GitHub runners recover).

**Deferred (todo):** PL-03b (Declaração observações persistence), LE-resend
(live invite emails, post-launch).

**Follow-ups flagged this session (good candidates for the owner's new cards):**
- **0051 legacy-notes backfill** — make pre-W12-13 notes (old `appointments.notes`
  + `patient_note_revisions`) editable by backfilling them into `appointment_notes`
  (idempotent, dedup by content+created_at). PL-13 shipped WITHOUT this; today those
  legacy rows show read-only on the profile Notas tab.
- **Editable note threads in the Agenda drawer + Marcações popup** — today they show
  a single coalesced latest note, not a thread; PL-13's edit lives only on the
  patient Notas thread. Making those full editable threads is a separate build.
- **0045-Q3** — the create-patient FORM doesn't send a location, so new in-app
  patients are owner-only until their first located appointment (non-migration fix).

---

## 5. Operational doctrine — NON-NEGOTIABLE

- **Migrations are apply-BEFORE-merge.** Build → CI green → owner runs a TERMINAL
  apply from the `osteojp-prod-apply` worktree → independent read proves it → THEN
  merge. "Applied" counts ONLY with pasted evidence (the drizzle
  `__drizzle_migrations` COUNT DELTA + the actual schema object), never inferred
  from "migrations applied successfully" or absence of errors. One migration in
  flight at a time.
- **Migration-apply worktree gotcha (learned this session, cost one silent no-op):**
  the PR branch is usually held by another worktree, so in `osteojp-prod-apply` a
  plain `git checkout <branch>` is REJECTED and leaves you on `main` — then
  `db:migrate` runs against main and silently applies NOTHING (0049 hit this).
  **Fix: `git checkout origin/<branch>` (DETACHED HEAD)** — it brings the migration
  in without claiming the branch. Apply block that works:
  ```
  cd ~/Documents/Projects/GitHub/osteojp-prod-apply
  git fetch origin && git checkout origin/<pr-branch>
  pnpm install --frozen-lockfile
  set -a; . ~/osteojp-secrets/new-prod.env; set +a
  pnpm db:migrate
  # verify, then: git checkout main && git pull
  ```
  Verify with a read-only node script (psql is NOT installed) — stage it to
  `~/osteojp-mailbox/staged/`, copy into the worktree's `packages/db` (so `import
  postgres` resolves), run it; check the column/policy exists AND the count delta.
- **No prod-connected execution from any Claude-attached shell, including `!`.** The
  `!` prefix runs in THIS session's shell and would source `new-prod.env` (prod DB
  URL + password) into the AI context. The owner runs every prod write/apply/seed in
  his OWN terminal; GREEN stages `--preview` scripts to `~/osteojp-mailbox/staged/`
  and verifies from pasted output. (There is already an open loose end: rotate the
  prod DB password that leaked to chat earlier — G3-adjacent.)
- **Self-merge policy:** the owner authorized GREEN to self-merge on green CI for
  NON-migration, non-agent-governing changes — he reviews the deployed
  behavior/visuals, not CI/PRs. Migrations and prod-data writes stay hard-gated
  (apply-before-merge / AUTORIZO). `gh pr merge <n> --squash --delete-branch`.
- **Hand migrations + notable/patient-facing UI to the owner's visual gate** on the
  Vercel preview / prod, with a plain-language "open this, click this, expect that"
  checklist. The owner does not read code.
- **Migration mechanics:** migrations are HAND-AUTHORED (drizzle snapshots stop at
  0014; NEVER `drizzle-kit generate` — it over-generates). Each migration =
  `packages/db/migrations/00NN_slug.sql` + a `supabase/migrations` copy (run
  `node scripts/sync-supabase-migrations.mjs`) + a `meta/_journal.json` entry (idx =
  fileNumber−1, `when` continues the +1e8 sequence, `version:"7"`, `breakpoints:true`).
  Add columns to `packages/db/src/schema.ts` too. Gate with
  `node scripts/check-journal.mjs` + `node scripts/sync-supabase-migrations.mjs
  --check`. RLS policy migrations ship an isolation test in the same PR (run it
  locally against `127.0.0.1:54322` after `supabase db reset`).

---

## 6. Gates (definition of done)

`pnpm --filter <pkg> lint`, `... typecheck`, `... test`, `pnpm --filter web build`,
and `pnpm --filter web exec vitest run <file>` for targeted runs. Migrations also:
`db:check-journal`, `db:sync-supabase:check`, and the RLS isolation test on a local
DB. Board: `validate-board.mjs`. CI required checks: `Lint + typecheck + test`,
`DB-gated tests (RLS isolation, seeded DB)`, `Playwright E2E (seeded DB)`, `sync`,
and the three Vercel deploys. e2e/db-tests need the local Supabase stack (Docker,
up) or run in CI. i18n: keep `strings.pt.json` + `strings.en.json` in lockstep.
Style: pt-PT default; plain hyphens, NO em dashes.

---

## 7. Continuity pointers

- **Memory:** `osteojp-wave12-execution` (execution doctrine + connection),
  `osteojp-pl09-location-access` (PL-09), `osteojp-prelaunch-dispatch-20260730`
  (PL-11/12/13), `osteojp-self-merge-authorization`.
- **Mailbox:** `~/osteojp-mailbox` (inbox / outbox / escalations / staged).
- **Prod-apply worktree:** `~/Documents/Projects/GitHub/osteojp-prod-apply` (holds
  `main`, where the owner runs applies).
- **Loop files:** `docs/loops/prelaunch/` (outrank any prompt).
- **Board artifact (maintain in place):**
  https://claude.ai/code/artifact/83e26fe7-034c-4fb8-b45b-b1165a843d6d

Report verdict first, plain hyphens, exact next action. Halt loud, never guess a
product decision — write it to QUESTIONS.md with a recommended default and move on.
