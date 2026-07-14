# Design loop — open questions and follow-ups

Append-only. Each entry names the wave that raised it, the issue, and a
recommended default. Backend/functional follow-ups raised by a design wave are
recorded here so the visual work can ship without inventing data models.

---

## V2-W2 Agenda (PR #245)

### Q-V2W2-1 — Blocked-time band needs a data model (backend functional follow-up)

SPEC-v2-agenda §2.1 specifies a muted, non-interactive "blocked time" band on the
week/day grid. There is **no blocked-time data model** in scheduling today (only
appointments and time-off conflicts), and data models are out of design-wave
scope permanently. The band is therefore **left unrendered** in V2-W2.

- **Status:** blocked on backend. The band cannot render until a blocked-time
  data model + query exist (a non-design, functional ticket).
- **Recommended default:** ship the agenda without the band; add a backend ticket
  for a `blocked_time` (or equivalent) model + an agenda query that returns
  blocked spans, then a small presentation follow-up renders the muted band.
- **Owner:** Ivan / backend stream. Confirmed in the PR #245 resolution.

### Q-V2W2-2 — Missing v2 glass primitives (foundation follow-up)

V2-W2 reuses existing primitives as stopgaps because the v2 glass equivalents did
not ship in V2-W0, and section waves must not touch `packages/ui`:

- No **Wellness Green Button variant** — the "Nova Marcação" CTA is styled
  in-route on v2 tokens (green-700 fill + inverse text, 4.7:1 AA).
- No **glass DatePicker**, **glass SegmentedControl**, or **glass Select** — the
  v1 primitives are reused in the toolbar.

- **Status:** non-blocking stopgaps in place.
- **Recommended default:** add these as `packages/ui` foundation follow-ups
  (green Button variant + the three glass form primitives), then swap the agenda
  toolbar over in a later wave. Do not add them inside a section wave.

### Q-V2W2-3 — Service catalogue → colour-category mapping (non-blocking)

Appointment cards are tinted by matching the service name against the five
SPEC §2.1 categories (Osteopatia family by prefix), with a neutral fallback +
"Outros serviços" legend entry for anything else.

- **Status:** non-blocking; works for the five canonical names.
- **Recommended default:** confirm the live service catalogue names map cleanly
  to the five categories, or provide the canonical service→category mapping.

---

## V2-W7 Marcações (bookings list)

### Q-V2W7-1 — Service-tinted chip has no glass primitive (foundation follow-up)

`GlassStatusChip` carries only the five semantic tones (success/info/warning/
error/neutral), not the five SPEC §2.1 service accents (green/lavender/gold/blue/
burgundy). Section waves must not edit `packages/ui`, so the Marcações list
renders the service as an **in-route token-tinted pill** reusing the same
`SERVICE_TINT` tokens as the agenda cards (100 fill + 200 hairline,
`v2-text-primary` label), with a neutral fallback for "Outros serviços". The
service→category match logic and the conflict-detection helpers
(`serviceAccent`, `conflictingIds`, `sameRoom`) live un-exported inside
`agenda/agenda-grid.tsx`, so they are duplicated in the list route.

- **Status:** non-blocking; visually consistent with the agenda.
- **Recommended default:** add a `packages/ui` glass `ServiceChip` (or extend
  `GlassStatusChip` with service-accent tones) and lift the service/conflict
  helpers into `lib/scheduling`, then swap the agenda grid and the list over in a
  later foundation pass. Do not add inside a section wave.

## 2026-06-30 - Wave 01 open questions
- [ ] Patient ID format (route: JP). Sequential, prefixed, or per-tenant scoped. Fiscal-adjacent: confirm whether it must map to an identifier the clinic already uses. Blocks: patient migration ID-generation.
- [ ] VAT treatment in KPI finance views (route: accountant). Revenue-per-therapist numbers depend on VAT 0 vs 23 for PT health services. Event schema captures gross now and applies treatment at report time, so this does not block capture, but blocks the finance KPI report. Carried from the standing 10-item JP/accountant list (item 2).
- [ ] Gated completion: hard block or soft warning (route: JP, clinical). Decides whether a therapist can ever close an appointment without a per-visit note. Blocks: appointment lifecycle migration behavior.

## 2026-07-02 - Wave 01 close: resolutions, follow-up, and FK audit

### R-1 — RESOLVED: seed user role IDs collided with real-UUID roles (owed from #414)

Resolution note owed from the seed role-ID-fix dispatch and never committed. The dev
seed originally wrote `users.role_id` using the `ROLE_*` fixture ids (`de000001-*`).
The dev DB's `roles` were seeded elsewhere with real random UUIDs, and roles carry a
secondary unique key `roles_tenant_slug_uq (tenant_id, slug)`. Because the roles seed
used `onConflictDoNothing`, the fixture-id role insert was silently SKIPPED (a row with
the same `(tenant, slug)` already existed under a real UUID), leaving the `ROLE_*`
fixture ids absent and the users' `role_id` FKs dangling.

- **Fix (PR #414):** `dev-reference.ts` now resolves each user's `role_id` by
  `(tenant_id, slug)` from whatever `roles` rows actually exist, via a `roleId(slug)`
  lookup, instead of referencing the `ROLE_*` fixture ids. Robust whether roles were
  seeded by this script or elsewhere (e.g. `supabase/seed.sql` with random UUIDs).
- **Status:** resolved and merged. Recorded here for the append-only trail.

### R-2 — RESOLVED: gated completion (was the 2026-06-30 open item, route JP)

Answered by JP via Ivan: SOFT WARNING, not a hard block (DECISIONS 2026-07-01). A
therapist can close an appointment with no per-visit note; the system records
`note_present` on the completion event rather than blocking. Marked answered here
without editing the original open item above (append-only).

### FT-1 — FOLLOW-UP TICKET: seed:dev chain has no dotenv preload

The `seed:dev` chain does not preload environment variables: `tsx` does not auto-load
`packages/db/.env`, so a seed run currently requires the operator to manually source the
env plus set `SEED_DEV_CONFIRM`. Owed fix: a shared bootstrap that loads
`packages/db/.env` (mirroring the drizzle-kit config pattern) so the seed scripts get
`DATABASE_URL` without manual sourcing, while keeping the `SEED_DEV_CONFIRM` opt-in
intact.

- **Priority:** small, non-urgent. Do before the next seed consumer runs the chain.
- **Recommended default:** add the shared dotenv preload to the seed entrypoint; do not
  weaken or remove `SEED_DEV_CONFIRM`.
- **RESOLVED (2026-07-03):** shipped in PR #444 (merged 2026-07-03). The `seed:dev` chain now
  auto-loads `packages/db/.env` via Node's `process.loadEnvFile` (no new dependency, mirrors the
  drizzle-kit config pattern), so `DATABASE_URL` is available without manual sourcing.
  `SEED_DEV_CONFIRM` stays shell-only and is captured BEFORE the preload, and `.env` is asserted
  not to define it, so the opt-in is not weakened. The manual-sourcing caveat is retired.

### FA-1 — Hardcoded-FK audit (read-only findings, owed from the #414 dispatch)

The same-class audit promised in the role-ID fix dispatch (step 5), performed now,
read-only, no code changed. Question asked: do the `-dev` seeders reference any FK
target by a hardcoded fixture id that could dangle via a unique-key SKIP the way roles
did? Mechanism of risk: a target seeded with `onConflictDoNothing` that ALSO has a
secondary unique key (beyond its PK) — a pre-existing row with the same natural key but
a different (real) UUID survives, the fixture-id insert is silently skipped, and any
downstream FK that references the fixture id dangles.

**Finding: ONE latent same-class risk (`users`); everything else clean.**

- **`users` — LATENT SAME-CLASS RISK (unmitigated in the downstream seeders).** `users`
  carries secondary unique key `users_tenant_email_uq (tenant_id, email)`.
  `dev-reference.ts` seeds users with `.onConflictDoNothing()` and NO explicit conflict
  target, so it swallows an email-unique conflict as well as a PK conflict. If a user
  with a seeded email (e.g. `andre.costa@osteojp-dev.pt`) pre-exists under a different
  real UUID, the fixture-id `USR_n` (`de000004-*`) insert is silently skipped and `USR_n`
  is absent. `appointments-dev.ts`, `availability-dev.ts`, and `episodes-dev.ts` all
  reference `USR_1..5` by hardcoded fixture id (imported from `dev-ids.ts`) and NEVER
  resolve users by email — so they would hit FK violations / dangling practitioner refs.
  This is exactly the roles mechanism. It has not fired on the current dev DB only because
  those users were seeded by this same script and therefore hold the fixture ids; a DB
  whose users originated elsewhere breaks. The #414 resolve-by-natural-key fix was applied
  to roles but NOT extended to users.
  - **Recommended default (do not fix now — read-only audit):** extend the #414 pattern —
    resolve `USR_1..5` to real ids by `(tenant_id, email)` at seed time in the three
    downstream `-dev` seeders (or make `dev-reference.ts` upsert users on the email key so
    the fixture ids always win), so a pre-existing user can never orphan the FKs.
- **`locations` — clean.** No secondary unique key (PK + tenant FK only; no unique-on-name).
  `onConflictDoNothing` can conflict only on the PK id, which preserves the fixture id. No
  skip-with-different-id path. `LOC_*` refs safe.
- **`services` — clean.** Same as locations: no unique-on-name, no secondary unique key.
  PK-only idempotency. `SVC_*` refs safe.
- **`patients` — clean.** `patients-dev.ts` uses its own fixed patient ids; the only
  secondary unique key is `auth_user_id`, intentionally left null ("patients are
  un-activated"). PK-only idempotency. Patient FK targets safe.
- **`roles` — already mitigated (#414).** Resolved by `(tenant, slug)` at user-seed time;
  the `ROLE_*` fixture ids are no longer load-bearing for FKs.

Report only — no code changed in this audit (docs lane).

## 2026-07-02 — RESOLVED: 0029 patient_number NOT-NULL vs 16 insert sites (halt closed)
- [x] Loop 0029 as written (`patient_number NOT NULL`, app-layer-only assignment, no schema beyond column+unique) was not executable within its own scope: 16 patient-insert sites across 11 files (8 RLS test files + the Fisiozero import path `upsert.ts:242`, exercised live by `migration-upsert-idempotency.test.ts`, + 2 seeds + `createPatient`) insert without a number, so a `NOT NULL` no-default column reds the gated db suite, and every in-scope fix hit a named HALT (Field 6 trigger ban / Field 5 no-import-code / "minimal createPatient-only"). Executor halted and surfaced a recommended default.
- [x] RESOLVED by owner ruling (Ivan, 2026-07-02): trigger auto-assign approved — see `docs/design/DECISIONS.md` (same date). The deviation supersedes the loop file's Field 6 and Field 2; the committed loop file was left unedited per owner instruction. Loop executed to green on that basis (backfill 105==105, 0 nulls, contiguous 1..105; uniqueness + cross-tenant + live MAX+1 round-trip all proven).

## 2026-07-02 — RESOLVED: FA-1 users-seed fingerprint deviation (idempotence interpretation ratified)
- [x] The FA-1 loop DoD asked the idempotent `seed:dev` run to show counts UNCHANGED at "patients=50, availability_templates=34" (the fixture floor recorded at wave close). The live run showed **patients=105** (and users=12), not 50 — which read as a fingerprint deviation against the DoD's literal numbers, so PURPLE surfaced it rather than papering over it.
- [x] RESOLVED: the surplus is **QA-created synthetic data**, confirmed by Max (2026-07-02) — 55 test patients + 7 staff/QA accounts created through the app during UI QA on the shared dev project. Not a seed defect, not real patient data. STATE.md (2026-07-02 live-verified fingerprint) records the corrected baseline (patients=105, users=12, `availability_templates`=34 unchanged).
- [x] STANDING RULING (ratified as the DoD pattern for all live-dev seeds): idempotence is verified by **zero delta between two consecutive seed runs** (a re-run changes no counts), NOT by the live total equaling the fixture floor. On a shared dev project that also carries QA/staff data, the fixture counts (50 patients, 5 users, etc.) are the seed FLOOR, never the expected live total. Future live-dev seed loops must assert run-to-run stability, not equality to fixtures. FA-1 met this: the second run changed nothing.

## 2026-07-02 — HALT: row 8 no-note indicator has no data source to read (route: Ivan)

### Q-ROW8-1 — `analytics_events` note_present capture is documented but not implemented anywhere in code

BACKLOG.md UI-lane row 8 ("no-note indicator on completed appointments") and the
2026-07-01 "Gated completion ruling" in DECISIONS.md both point to reading
`note_present` from the `appointment_status_changed` `analytics_events` event,
captured at the instant an appointment transitions to `completed`. That is the
semantically correct source: the owner requirement is to catch a therapist who
closes without a note, and a note added *after* the fact should still show as a
violation. Deriving from `appointment_notes` existence at query time would
silently launder exactly that case (add a backdated note, indicator clears).

**Finding: this capture does not exist anywhere — schema, app, or DB.**
- `schema.ts` only has a comment describing the intent (lines 714-719); there is
  no `note_present` column and no code that sets it in `payload`.
- `updateAppointment` (`apps/web/lib/scheduling/actions.ts:395-493`) is the only
  place `status: "completed"` is written. It calls `writeAppointmentAudit` (writes
  `audit_log` only) on every mutation and never touches `analyticsEvents`.
- No trigger exists in `0025_event_schema.sql` or `0026_appointment_notes.sql`.
- Repo-wide, `analytics_events` / `analyticsEvents` appears only in `schema.ts`
  and one RLS-isolation test fixture (`cross-tenant-rls-isolation.test.ts:158-160`),
  which inserts a synthetic `appointment_status_changed` row for policy testing —
  its payload doesn't even carry `note_present`.

Building the UI against `analytics_events.payload->>'note_present'` today renders
an indicator with zero eligible rows: not loophole-prone, just permanently empty,
defeating the owner requirement outright rather than approximating it.

- **Status:** HALTED. BACKLOG.md row 8 flipped from READY to HALTED pointing here.
- **Recommended default:** implement the missing capture first — inside
  `updateAppointment`'s completion branch (`actions.ts:473`), alongside the
  existing `writeAppointmentAudit` call, insert one `analytics_events` row
  (`event_type: "appointment_status_changed"`, existing 0025 table, no new
  migration) with `payload: { appointment_id, from_status, to_status,
  note_present }`, where `note_present` is an `exists(select 1 from
  appointment_notes where appointment_id = $id)` check run in the same tx before
  the status update commits. Row 8's UI then reads `note_present` off that event,
  matching DECISIONS.md and closing the backdated-note loophole. Flagging that
  this is backend logic against an already-migrated table (no schema change) but
  lives in `actions.ts` business logic, not a UI file — Ivan may want it in his
  non-migration lane rather than folded into Max's UI-lane ticket.
- **Fallback if capture work is not wanted this wave:** derive from
  `appointment_notes` existence at query time instead. Ship row 8 on that basis,
  explicitly logging the backdated-note gap as a known, temporary limitation, and
  fast-follow to the event-sourced read once capture lands.
- **Owner:** Ivan / backend stream.
- **RESOLVED (2026-07-03, Ivan):** the gap is confirmed REAL, not a mis-read. The
  `note_present` capture is assigned to the PURPLE lane as a build item: insert the
  `analytics_events` `appointment_status_changed` row inside `updateAppointment`'s completion
  branch (`actions.ts`), migration-free (existing 0025 table), with `note_present` computed as
  an `exists(... appointment_notes ...)` check in the same tx — i.e. the recommended default
  above, backend lane not UI. Max's row-8 no-note indicator UI (#440) lands AFTER the capture
  ships and reads `note_present` off that event. Row 8 stays HALTED as a UI ticket until then.

## 2026-07-02 — HALT: row 7 fichas-as-tab awaiting JP fichas-placement design ruling (route: Ivan)

### Q-ROW7-1 — Fichas relocation has its own open design call, separate from the (already-resolved) gated-completion ruling

BACKLOG.md UI-lane row 7 ("fichas-as-tab inside patient profile") carries gate:
*"JP fichas-placement design ruling (0026 code merged; design call still open)"*.
A dispatch for this row arrived citing "unblocked by the 0026 ruling: gated
completion is a soft warning per JP" as grounds to proceed. That ruling is real
(`docs/design/DECISIONS.md`, 2026-07-01, "Gated completion ruling") but it
answers a different question — hard block vs. soft warning on closing an
appointment without a note. It says nothing about where or how Fichas Clínicas
relocates into the patient profile. `WAVE-01.md`'s Max queue item 7 phrases the
dependency as "Lands after gated-completion design settled," which reads as
satisfied now that 0026 shipped — but BACKLOG.md, the file this project treats
as sole ground truth for what is runnable, is more specific and says the
placement design call itself is still open, not merely gated on 0026. Treating
the two rulings as one and the same would ship a routing/IA change JP hasn't
actually signed off on.

**Code state, checked before halting (no code changed):**
- A `registos` tab already exists in the patient profile
  (`apps/web/app/patients/[id]/page.tsx`), permission-gated on
  `clinical_records:read`, and already lists that patient's clinical records
  with links to `/clinical/[id]` — this part of "fichas as a tab" is live today.
- The top-level `/clinical` route (`apps/web/app/clinical/page.tsx`) is a
  separate **cross-patient** list with its own `/clinical/new` create-record
  entry point, still linked from the primary nav
  (`apps/web/lib/nav/nav-items.ts:14`). Relocating "the top-level section" is
  therefore not a like-for-like swap onto the existing tab: open questions the
  code alone can't answer are (a) does `/clinical/new`'s creation flow move
  inside the patient-profile tab, stay at its own route, or both; (b) does the
  cross-patient list get dropped entirely (staff always enters via a patient
  profile) or survive as a narrower admin/reporting view; (c) do existing
  `/clinical/[id]` deep links (bookmarks, any external references) keep
  resolving unchanged. These are exactly the kind of placement decisions
  BACKLOG.md's gate is naming.
- **Status:** HALTED. BACKLOG.md row 7 flipped from DRAFT to HALTED pointing
  here, per operator instruction (hold row 7, gate stands, Ivan resolves it).
- **Recommended default (not executed — awaiting ruling):** keep
  `/clinical/[id]` record-detail deep links working unchanged regardless of
  outcome; the open call is scoped to the *list* surfaces and the create entry
  point, not the editor route. Beyond that, no default is assumed here — this
  is JP's placement call to make, not one to infer from the completion ruling.
- **Owner:** Ivan, routing JP's fichas-placement ruling through as he did for
  gated completion (DECISIONS.md 2026-07-01).
- **RESOLVED (2026-07-03, Ivan):** placement ruling issued — see
  `docs/design/DECISIONS.md` 2026-07-03 "Fichas Clínicas placement: tab in the patient
  profile". Fichas Clínicas leaves top-level nav and becomes a tab in the patient profile
  alongside Marcações; per-visit notes (0026) and fichas stay two distinct objects (notes
  attach to appointments with an optional episode link, never merged); the tab lists the
  patient's fichas and per-visit notes surface in appointment history. The `/clinical/[id]`
  record-detail deep links keep resolving unchanged, as recommended. This confirms the halt
  was a false positive rooted in the two-shelf split: the cited 2026-07-01 gated-completion
  ruling already lived on the canonical shelf and was a SEPARATE call from placement — the
  agent that proposed a backfill had read the legacy shelf. Row 7 UNBLOCKED (UI lane, existing
  PR #446).

## 2026-07-03 — NEW TICKET: Vercel Preview envs share the single Supabase project (infra)

- [ ] Vercel Preview environments on `osteojp-platform` now carry DB env vars and share the
  SINGLE Supabase project (`jaxmkwoxjcgzkwxgbayx`) with the deployed app (fixed by Max
  2026-07-02 so previews build against a real DB). Consequence: preview deployments read/write
  the same dev database as the live app — no preview DB isolation.
- **Context:** this reinforces the existing pre-real-data gate (DECISIONS 2026-07-01: provision a
  SEPARATE production Supabase project and repoint envs before any real patient data). Preview DB
  isolation is a distinct, future infra call: once a separate prod project exists, decide whether
  previews get their own branch/database or stay pointed at dev-only.
- **Recommended default:** defer preview DB isolation until the separate-prod-project gate is
  executed; track it as part of that infra work, not before. No real patient data exists today,
  so shared preview/dev is acceptable in the interim.
- **Owner:** Ivan / infra.

## 2026-07-03 — NEW TICKET: legacy-shelf consolidation loop (docs)

- [ ] Two documentation shelves exist: canonical `docs/design/` (DECISIONS.md, QUESTIONS.md,
  STATE.md, BACKLOG.md) and legacy `docs/` (DECISIONS.md, QUESTIONS.md). Per DECISIONS
  2026-07-03 "Canonical doc shelf is docs/design/", the legacy files are read-only for new
  entries, but they still hold open items (e.g. Bodychart term, portal ficha naming,
  consulta/marcação brand-voice, batch-pop-up/row-9 in `docs/QUESTIONS.md`) and historical
  content in the 800-line `docs/DECISIONS.md`.
- **Scope of the future loop:** migrate the still-open `docs/QUESTIONS.md` items and any
  live/unsuperseded `docs/DECISIONS.md` content onto the canonical `docs/design/` shelf, then
  replace the legacy files with archived pointer stubs (a header noting the content moved and
  where). Append-only history preserved; no decision content discarded.
- **Priority:** low, non-urgent. Do NOT fold into a feature PR; it is its own docs loop to keep
  the diff reviewable.
- **Recommended default:** one dedicated consolidation loop, canonical shelf as the merge target,
  legacy files become pointer stubs (not deleted).
- **Owner:** Ivan / docs.

## 2026-07-03 — NEW TICKET: CI db-gated step soft-passed while an inner test failed (gate hardening)

- [ ] During PR #449 (note_present capture) a test INSIDE the db-gated job failed while the job's
  required check still reported SUCCESS — the gate soft-passed a real failure. The failing test was
  caught and fixed on-branch before merge, but the gate itself did not fail the job as it should
  have. A green db-gated check must GUARANTEE every inner test passed.
- **Risk:** a soft-passing gate can let a genuinely broken db/RLS change reach main under a green
  check. This is the highest-trust gate in the repo (RLS isolation).
- **Constraint:** hardening the step touches `.github/workflows/db-tests.yml`, which is an AUTOMATIC
  owner hold (never self-merged, per BACKLOG coordination protocol). So this is a future PURPLE
  item that opens a PR and HALTS for owner merge — it cannot be folded into a normal loop.
- **Recommended default:** a dedicated PURPLE loop that fixes the exit-code/`set -e` (or
  test-runner exit propagation) in `db-tests.yml` so any inner test failure fails the job, plus a
  deliberately-failing canary test proving the gate now goes red. Owner-merged.
- **Owner:** Ivan (db-tests.yml hold).

## 2026-07-03 — NEW TICKET: close superseded Max halt PRs #440 / #439 / #446 on replacement merge

- [ ] Three merged Max halt-recording PRs are superseded by Wave 02 loops but remain referenced:
  `#440` (row-8 no-note halt) → superseded by **W2-04**; `#439` (batch failure pop-up halt) →
  superseded by **W2-05**; `#446` (fichas-as-tab halt) → superseded by **W2-06**.
- **Action:** when each replacing loop MERGES, add a closing comment on the corresponding halt PR
  pointing at the replacement (e.g. "Superseded by W2-04 / PR #NNN — no-note indicator shipped"),
  so the halt record is not left looking open/unresolved. These PRs are already merged; this is a
  comment-only housekeeping step, no revert, no reopen.
- **Recommended default:** the executor of W2-04 / W2-05 / W2-06 posts the closing comment on
  #440 / #439 / #446 respectively as the final step of its own merge.
- **Owner:** whichever lane merges the replacement loop.

## 2026-07-03 — SMS confirmation flow (W2-13 SPEC): owner/JP decisions before any build

> Source: `docs/design/SPEC-sms-confirmation.md` (SPEC ONLY, no build this wave). A build
> loop is gated on all four items below.

- [ ] **Twilio as a new vendor (owner-confirmable).** The SMS flow introduces Twilio (new
  third-party vendor, CLAUDE.md). Needs owner approval AND confirmation of an EU region /
  signed DPA before any integration is wired. **Recommended default:** approve only with
  Twilio EU region + DPA; otherwise re-evaluate an EU-native SMS provider.
- [ ] **Message + confirm-page copy (pt-PT).** Exact SMS body and the SIM/NÃO confirm-page
  wording (JP tone: serious, "padrão ouro", no emoji). **Recommended default:** a two-line
  SMS (clinic + appointment date/time + short link) and a page showing date/time/therapist/
  location with SIM (Confirmar) / NÃO (Não posso) buttons — final wording is JP's.
- [ ] **Exact send times (Europe/Lisbon).** What "day-before" and "same-day-morning" mean.
  **Recommended default:** 18:00 on D-1 and 08:00 on D0 (Europe/Lisbon), skip if the
  appointment is already confirmed/declined.
- [ ] **Opt-out / consent (GDPR).** STOP handling, per-patient SMS preference, and consent
  capture. **Recommended default:** honour the existing per-patient `reminder_sms_enabled`
  flag; add a STOP keyword handler and suppress on opt-out; no SMS without the flag set.
- **Owner:** JP for copy; owner for the Twilio vendor + residency call. A future build loop
  picks these up once answered.

## 2026-07-03 — Wave 02 close: QUESTIONS sweep

Housekeeping sweep at Wave 02 close. No new questions; records what the wave closed and what stays open.

- **CLOSED — Notas Rápidas write destination** (open since Wave 01, STATE 2026-06-30 audit finding #1): resolved by **W2-11 (#463)**. Patient notes now flow through the append-only `patient_note_revisions` relation; the notes UI no longer reads/writes `patients.notes` (column retained, untouched). Recorded in STATE 2026-07-03 wave-02 close audit.
- **CLOSED — W2-03 location cleanup** ambiguity: resolved by owner ruling **Option A** (DECISIONS 2026-07-03), executed in **#455**. Not a standing QUESTIONS entry; noted here for the trail.
- **OPEN (unchanged) — SMS confirmation JP/owner decisions**: message wording, exact send times, opt-out/consent, and the **Twilio new-vendor** confirmation — see the 2026-07-03 SMS-confirmation entry above. A future build loop is blocked on these.
- **OPEN (unchanged) — standing next-wave-planning batch**: marcações row-open (SPEC-v2-marcações §2.3, unimplemented), delete policy (cancel-only intentional?), Bodychart term, portal ficha naming, consulta/marcação brand-voice. These live in the legacy `docs/QUESTIONS.md` shelf (untouched here per the canonical-shelf ruling); they roll forward as Wave 03 planning inputs and are folded into the legacy-shelf consolidation candidate (BACKLOG Wave 03).
- **OPEN (unchanged) — infra/CI tickets**: CI db-gate hardening (owner-hold, touches `db-tests.yml`) and Preview DB isolation — both 2026-07-03 above; both carried into Wave 03 candidates.

## 2026-07-06 — Wave 03 close: owner answers + QUESTIONS sweep

Append-only; original open items above are left unedited. This sweep records the owner/JP
answers taken at Wave 03 close (rulings in DECISIONS.md 2026-07-06) and lists what stays open.

### CLOSED this sweep (answered by owner/JP, 2026-07-06)

- **CLOSED — SMS send timing** (was 2026-07-03 SMS item "exact send times", route JP). **Answer:** a SINGLE reminder **24h before the appointment**; **NO at-booking message**. This SUPERSEDES the earlier 18:00 D-1 / 08:00 D0 two-touch default. Ref DECISIONS 2026-07-06 "SMS confirmation flow product calls".
- **CLOSED — SMS opt-out / consent** (was 2026-07-03 SMS item "opt-out/consent", route JP/GDPR). **Answer:** a **per-patient, staff-toggleable flag** (reuses `patients.reminder_sms_enabled`, 0019); **NO automated STOP-keyword handler** and no inbound reply parsing. Narrows the earlier "add a STOP handler" default. Ref DECISIONS 2026-07-06.
- **RESOLVED (mechanism) — SMS message wording** (was 2026-07-03 SMS item "message + confirm-page copy", route JP). **Answer:** JP will **pick the final pt-PT wording from Max's drafted variants**. The selection mechanism is decided; the exact string is JP's pick (not blocking the build's structure). Ref DECISIONS 2026-07-06. NOTE: this is the only SMS item not fully closed to a final string — see OPEN list for the still-blocking Twilio-vendor item.
- **CLOSED — AI recording consent capture** (route JP). **Answer:** a **consent checkbox before Record**, stored with **actor + timestamp**, minimum-viable format approved. Ref DECISIONS 2026-07-06 "AI recording consent capture". Build item is a Wave 04 candidate.
- **CLOSED — Visitor stub patient retention** (route JP; owner-confirmable clinical-data-retention item, CLAUDE.md). **Answer:** stub patients that never become real patients are **cleaned after 30 days**; promoted stubs retained normally. Ref DECISIONS 2026-07-06 "Visitor stub retention". 30-day cleanup job is a Wave 04 candidate.
- **CLOSED — Photos in fichas** (route JP). **Answer:** **APPROVED** — clinical records may carry photo attachments (signed-URL storage only, CLAUDE.md rule 8). Ref DECISIONS 2026-07-06 "Photos in fichas approved". Camera-to-ficha capture is a Wave 04 candidate.
- **CLOSED (housekeeping) — superseded Max halt PRs #440/#439/#446** (was 2026-07-03 ticket). Confirmed by **W3-10 (#477)**: all three merged and each already carried its superseded-by comment; no duplicate posted. Done.

### AI recording infrastructure — RECORDED (owner-confirmed), with one coordination item still owed

Ref DECISIONS 2026-07-06 "AI recording infrastructure". Terms confirmed: bucket `osteojp-audio-intake`
on André's AWS (eu-central-1); vault-delivered scoped IAM key (PutObject+GetObject on that bucket only);
backend signs both presigned PUT and GET; M1 webhook gains API-key auth; contract adds `audio_filename`.
- **OWED (coordination, not a blocker for authoring) — EMR origins list for André's CORS rule.** The CORS rule on André's side is PENDING our (production + preview) EMR origins list. OsteoJP must supply the exact allowed origins before direct-to-S3 upload works. Tracked into the Wave 04 "presigned PUT + CORS coordination" candidate.

### STILL OPEN after this sweep (for report-back)

- [ ] **SMS — Twilio as a new vendor + EU residency / signed DPA** (route: owner). The only SMS item still blocking the build. No vendor introduced yet; approve only with Twilio EU region + DPA, else re-evaluate an EU-native SMS provider. (2026-07-03 SMS entry, item 1.)
- [ ] **Q-V2W2-1 — blocked-time band data model** (route: Ivan/backend). Agenda blocked-time band unrendered until a `blocked_time` model + query exist.
- [ ] **Q-V2W2-2 — missing v2 glass primitives** (foundation follow-up, non-blocking). Green Button variant + glass DatePicker/SegmentedControl/Select; add in a `packages/ui` foundation pass, not a section wave.
- [ ] **Q-V2W2-3 — service catalogue → colour-category mapping** (non-blocking). Confirm live service names map to the five categories, or provide the mapping.
- [ ] **Q-V2W7-1 — service-tinted chip has no glass primitive** (foundation follow-up, non-blocking). Add a glass `ServiceChip` / lift service+conflict helpers into `lib/scheduling` in a later foundation pass.
- [ ] **Preview DB isolation** (route: Ivan/infra). Deferred until the separate-prod-project gate is executed. (2026-07-03.)
- [ ] **CI db-gate hardening** (route: Ivan; owner-hold — touches `db-tests.yml`). Opens a PR and HALTS for owner merge; cannot be folded into a normal loop. (2026-07-03.)
- [ ] **Legacy-shelf consolidation loop** (route: Ivan/docs). Migrate still-open legacy `docs/QUESTIONS.md` items (Bodychart term, portal ficha naming, consulta/marcação brand-voice, marcações row-open, cancel-only delete policy) and live `docs/DECISIONS.md` content onto the canonical `docs/design/` shelf; leave pointer stubs. (2026-07-03.)
- [x] **AI recording — EMR origins list for André's CORS rule** (route: OsteoJP → André). ~~Coordination item owed before direct-to-S3 upload works.~~ **→ CLOSED (2026-07-06, confirmed at Wave 04 close):** RESOLVED by André's amendment — CORS is locked to exactly three browser-PUT origins (`https://osteojp-platform.vercel.app`, `https://app.osteojp.pt`, `http://localhost:3000`); `osteojp-api.vercel.app` deliberately excluded. Ref DECISIONS 2026-07-06 "AI recording spec amended per André's confirmation". A new capture-page origin must be added by André before it can PUT (a future coordination step, not this open item).
- [x] **AI recording — scoped-audio-signer env vars (W4-08).** The presigned S3 signer reads these from Vercel env (values from the vault-delivered scoped key — PutObject+GetObject on `osteojp-audio-intake` only, eu-central-1): **`AUDIO_S3_REGION`**, **`AUDIO_S3_BUCKET`**, **`AUDIO_S3_ACCESS_KEY_ID`**, **`AUDIO_S3_SECRET_ACCESS_KEY`**. **→ CLOSED at Wave 04 (2026-07-07):** env var **names finalized and set**; consumed by the shipped signer (#491), mock-verified in CI (no AWS key locally, by design). The real-bucket round-trip (presigned GET 200 against `osteojp-audio-intake`) is a DEPLOY verification folded into the **W4-10 AWAITING-EXTERNAL** relay, not a standing open question. Values NEVER committed.
- [x] **AI recording — M1 webhook env vars (W4-09).** The post-upload fire reads: **`M1_WEBHOOK_URL`** (André's Make.com scenario endpoint) and **`M1_WEBHOOK_API_KEY`** (value = vault key `osteojp-m1-webhook-key`, sent as the `x-make-apikey` header). **→ CLOSED at Wave 04 (2026-07-07):** env var **names finalized and set**; consumed by the shipped fire path (#492), mock-verified in CI (payload contract, header-from-env, non-2xx handling). The real fire (200 from André's endpoint) is the **W4-10 AWAITING-EXTERNAL** relay (André receipt + `audio_filename` token), not a standing open question. Values NEVER committed.

> Legacy-shelf note: additional standing planning items live in the LEGACY `docs/QUESTIONS.md` shelf
> (untouched here per the canonical-shelf ruling, DECISIONS 2026-07-03). They roll forward via the
> legacy-shelf consolidation loop and are not re-listed here.

## 2026-07-07 — Wave 04 close: QUESTIONS sweep

### CLOSED this sweep (answered; flipped `[x]` in the 2026-07-06 STILL-OPEN list above)
- **CLOSED — AI recording scoped-audio-signer env vars (W4-08):** `AUDIO_S3_REGION` / `AUDIO_S3_BUCKET` / `AUDIO_S3_ACCESS_KEY_ID` / `AUDIO_S3_SECRET_ACCESS_KEY`. Names finalized and set; consumed by the shipped signer (#491), mock-verified in CI. Residual real-bucket 200 is folded into the W4-10 AWAITING-EXTERNAL relay. Values never committed.
- **CLOSED — AI recording M1 webhook env vars (W4-09):** `M1_WEBHOOK_URL` / `M1_WEBHOOK_API_KEY` (→ `x-make-apikey`). Names finalized and set; consumed by the shipped fire path (#492), mock-verified in CI. The real fire (200 from André) is the W4-10 relay. Values never committed.
- **CLOSED — AI recording EMR-origins CORS list:** RESOLVED by André's amendment (DECISIONS 2026-07-06) — CORS locked to three browser-PUT origins, `osteojp-api.vercel.app` excluded. The item was stale-open in the 2026-07-06 snapshot; cleared here.
- **DISPOSITIONED — W4-03 nova-marcação Serviço auto-select halt:** the escalated 2026-07-06 QA symptom closed **resolved-unreproducible** (docs-only, #495; owner live QA 2026-07-07). No open design question remains in this shelf (the halt lived in the GREEN↔CYAN mailbox, not here); recorded for the trail. Ref DECISIONS 2026-07-07.

### STILL OPEN after this sweep (carried into Wave 05, unchanged)
- [ ] **SMS — Twilio as a new vendor + EU residency / signed DPA** (route: owner). The only SMS item still blocking the build. Approve only with Twilio EU region + DPA, else re-evaluate an EU-native provider. (JP still picks the final pt-PT wording from Max's variants — mechanism decided, string pending, non-blocking to structure.)
- [ ] **Q-V2W2-1 — blocked-time band data model** (route: Ivan/backend).
- [ ] **Q-V2W2-2 — missing v2 glass primitives** (foundation follow-up, non-blocking).
- [ ] **Q-V2W2-3 — service catalogue → colour-category mapping** (non-blocking).
- [ ] **Q-V2W7-1 — service-tinted chip has no glass primitive** (foundation follow-up, non-blocking).
- [ ] **Preview DB isolation** (route: Ivan/infra). Deferred until the separate-prod-project gate.
- [ ] **CI db-gate hardening** (route: Ivan; owner-hold — touches `db-tests.yml`). Opens a PR and HALTS for owner merge.
- [ ] **Legacy-shelf consolidation loop** (route: Ivan/docs). Migrate still-open legacy `docs/` items onto the canonical shelf; leave pointer stubs.

### External relays (not design questions — tracked in BACKLOG, close via one-line docs flip)
- **W4-10** — André confirms receipt of the real fire + `audio_filename` token exposure (relayed by Ivan). Owner-performed; machine DoD already merged (#493).
- **W4-05** — Rodica real-phone camera-capture check (relayed by Ivan). #484 shipped; loop stays awaiting, non-blocking.

## 2026-07-08 - Wave 05 authoring (YELLOW)

Raised while authoring the Wave 05 loops + `docs/design/SPEC-ficha-medica.md`. Each
has a recommended default so the build can proceed; none blocks authoring. The
first five are the design/product calls the loops surface; the last two are
briefing-vs-reality RECON MISMATCHES logged per the blocked-task protocol (record +
recommended default + continue; a per-loop mismatch stops one branch, never the run).

### Q-W5-1 - Data do Episodio: editable, prefilled today?
The Ficha Medica separates the record's auto-stamped `created_at` (no manual picker,
SPEC-ficha-medica sec 4) from the clinical `episode_date`. `episode_date` is the
date the episode/consultation pertains to.
- **Recommended default (YES):** keep `episode_date` **editable, prefilled to
  today**. It is a clinical fact a clinician may back/forward-date (e.g. writing up a
  prior visit); the record's creation instant is captured separately + immutably.
- **Owner:** JP / Ivan. Consumed by W5-14.

### Q-W5-2 - Keep both Plano de Tratamento AND Objectivos do Tratamento after Tratamento?
The field sequence (SPEC sec 5.12) places the new Diagnostico + Tratamento fields,
then the existing `treatment_plan` (Plano) and `treatment_objectives` (Objectivos).
Both are among the twelve AI-populated keys (keys 10-11).
- **Recommended default (KEEP BOTH):** retain Plano and Objectivos after Tratamento.
  They are distinct (plan = what will be done; objectives = intended outcomes), both
  are AI-filled from the transcription, and dropping either would break the twelve-key
  compatibility contract (SPEC sec 2). Keep both, keys unchanged.
- **Owner:** JP. Consumed by W5-15.

### Q-W5-3 - Consent + RGPD wording (JP picks from Max's variants)
All consent/RGPD strings in the signature/consent section (SPEC sec 7) ship as pt-PT
placeholders flagged `PENDENTE-JP`.
- **Recommended default:** Max drafts **2-3 pt-PT variants per text** (RGPD data
  processing, SMS reminders acknowledgment, data handling); **JP picks the final
  string** per item. No consent string is treated as final until JP selects it;
  build ships the placeholders so structure is not blocked on copy.
- **Owner:** JP (final wording), Max (variants). Consumed by W5-16. (Parallels the
  SMS-wording mechanism: structure decided, string pending, non-blocking.)

### Q-W5-4 - Appointments inside a new therapist block: warn, not auto-cancel?
When a therapist block (W5-12) overlaps existing appointments.
- **Recommended default (WARN ONLY):** **list the overlapping appointments as a
  warning; never auto-cancel.** Auto-cancelling clinical/scheduling data is
  destructive and owner-confirmable (CLAUDE.md security defaults); the staff member
  resolves each overlap manually. Warn-only is the safe default.
- **Owner:** JP / Ivan. Consumed by W5-12.

### Q-W5-5 - NESA: template vs booking-warning ambiguity (recon-found)
Recon found "NESA" names two unrelated things: (a) the `nesa` v1 **template**
(`packages/db/seed/form-templates/nesa-v1.json`, a full schema whose structure
follows the osteopathy episode form), and (b) the NESA **contraindication
booking-warning** system (migration `0031`: `patients.contraindication_epilepsy`,
`patients.contraindication_pregnancy`, `services.contraindication_sensitive`, driving
the W2-08 soft booking warning). The Ficha Medica unification retires other templates
from the creation flow.
- **Recommended default:** the Ficha Medica DECISION retires **only the NESA
  *template*** (a) from record creation (like Ficha Geral / Fisioterapia / the
  wrappers). The NESA **booking-warning** system (b) is a separate, live feature and
  **stays fully intact** - untouched by W5-13. The two are not the same thing; do not
  conflate.
- **Owner:** JP / Ivan (confirm NESA-template retirement is acceptable). Consumed by
  W5-13 (SPEC sec 1).

### Q-W5-6 - RECON MISMATCH: Profissao is ALREADY in the form + profile (W5-03)
The briefing scoped W5-03 to "expose the existing profession column in the
new-patient form as an optional Profissao field and display it on the profile," and
named "if the column is absent, that is a briefing mismatch, HALT." **Recon (2026-07-08)
found the opposite of the halt condition and the work already done:** `patients.profession`
EXISTS (migration 0022); the new-patient form ALREADY collects Profissao
(`apps/web/app/patients/_components/patient-form.tsx` lines 147-153); the profile
ALREADY displays it (`apps/web/app/patients/[id]/page.tsx` ~line 119). The named
hard-halt trigger (column absent) did NOT fire; this is a soft "already-shipped"
mismatch, so it is logged here rather than escalated as a whole-run halt.
- **Recommended default:** **close W5-03 as already-shipped** after a thin
  verification pass (mirrors the W4-16 docs-only already-shipped close), OR, if the
  owner wants the loop to add value, scope it down to the small residual gaps
  (confirm the field reads as optional; add e2e coverage for the create -> profile
  round-trip). Do not manufacture rework.
- **Owner:** Ivan (pick already-shipped-close vs residual-gap). Consumed by W5-03.

### Q-W5-7 - RECON MISMATCH: `time_off` already exists; migration 0034 likely unnecessary (W5-12)
The briefing scoped W5-12 as "migration 0034 adds therapist availability blocks"
supporting Bloqueio pontual (date + hour range) and Ausencia prolongada (date range).
**Recon (2026-07-08) found the data model already exists:** the `time_off` table
(migration `0006_availability_timeoff.sql`) has `starts_at`/`ends_at` timestamptz + a
`reason` enum (vacation, sick, holiday, other) + note - a timestamptz range
**structurally covers both modes** (pontual = same-day range; prolongada = multi-day
range, reason vacation = ferias). The conflict system already reads it
(`apps/web/lib/scheduling/conflict.ts`); booking already refuses overlaps. The two
real gaps are **both migration-free**: (1) no "Bloquear horario" admin UI on the
Horarios card; (2) `getTherapistAvailability` (`day-availability.ts`) does not deduct
`time_off` (only the conflict check does), so blocks still show as free in the
availability view / lote. **Related:** Q-V2W2-1 left the Agenda blocked-time band
unrendered pending "a blocked-time data model + query" - `time_off` IS that model.
- **Recommended default:** build W5-12 **migration-FREE on `time_off`** - add the
  Bloquear horario UI (both modes -> `time_off` rows) and **integrate `time_off` into
  `getTherapistAvailability` + the lote availability check** so blocks are excluded
  everywhere; warn-not-cancel (Q-W5-4). Open a **minimal migration 0034 ONLY** if the
  owner wants a persisted pontual-vs-prolongada distinction or an all-day/recurring
  flag `time_off`'s current columns cannot express. Do not open 0034 speculatively.
- **Owner:** Ivan (confirm migration-free-on-`time_off` vs a minimal column).
  Consumed by W5-12.

## 2026-07-08 - Owner rulings addendum (Ivan, resolves Q-W5-1..7) + W5-01 halt

Recorded from the owner rulings addendum dispatched 2026-07-08. These outrank the
loop files where they conflict.

- [x] **Q-W5-1 ANSWERED:** Data do Episodio is **editable, prefilled today** (the recommended default). Consumed by W5-14.
- [x] **Q-W5-2 ANSWERED:** keep **BOTH** Plano de Tratamento and Objectivos do Tratamento (recommended default; twelve-key contract unchanged). Consumed by W5-15.
- [x] **Q-W5-3 ANSWERED:** consent/RGPD wording stays **PENDENTE-JP placeholders**; Max drafts variants, JP picks. Never invent legal wording. Consumed by W5-16.
- [x] **Q-W5-4 ANSWERED:** appointments inside a new therapist block are **WARNED, never auto-cancelled**. Consumed by W5-12.
- [x] **Q-W5-5 ANSWERED:** retire the NESA **template** from the creation flow only; the 0031 booking-warning system is **untouched**. Consumed by W5-13.
- [x] **Q-W5-6 ANSWERED (conditional, resolved PRESENT):** owner ruling: if the field is present in the deployed app, close W5-03 docs-only as already-shipped. GREEN verified PRESENT with machine evidence 2026-07-08: production deployment `dpl_AWKNbRzyTgvSGHVg31fXNgqFMwXL` builds commit `9f5c960` (exact `origin/main` tip, zero drift), which renders Profissao unconditionally in the new-patient form (`patient-form.tsx` 147-153). Profile row is conditional on a value being set (`page.tsx:119`), the likely source of the QA observation. **W5-03 closed already-shipped in this PR.**
- [x] **Q-W5-7 ANSWERED (conditional):** build W5-12 **migration-free on `time_off` (0006) IF AND ONLY IF** recon proves it supports both an intra-day hour-range block and a multi-day range block, with schema evidence pasted. If whole-day-only, HALT proposing a minimal 0034; never force whole-day semantics onto Bloqueio pontual. Consumed by W5-12 at dispatch.

### Q-W5-8 - W5-01 login branding needs a new BrandLockup size step (packages/ui)
- [x] **ANSWERED:** Owner approved Option 1 (additive xl:96 BrandLockup step + optional brandSize prop), 2026-07-08 via CYAN relay.

Raised by the W5-01 executor 2026-07-08 (halt file in the mailbox). `BrandLockup`
tops out at `lg` = 48px, the sidebar already uses `lg`, and the near-square lockup
art renders ~44px wide at that height, so "significantly larger and prominent" is
unreachable without a `packages/ui` change (the loop's explicit halt trigger).
- **Recommended default:** approve an **additive `xl: 96` size step** on BrandLockup
  plus an optional `brandSize` prop on SidebarAppShell (default keeps today's `lg`).
  Non-breaking for every consumer; smallest honest change that meets the scope.
  Alternatives (important-override hack, or staying at 48px) are worse or fail the goal.
- **Owner:** Ivan. Consumed by W5-01 (blocked on this answer; recon complete and reusable).

## 2026-07-12 - Wave 05 Ficha Final 2 (FF2) open items (W5-31 Declaracao de Presenca)

Raised by YELLOW at FF2 authoring 2026-07-12. Three non-blocking items on the Declaracao de Presenca (W5-31); each has a recommended default so the loop ships without a decision.

### Q-W5-9 - Signature/stamp image asset for the Declaracao de Presenca
The Declaracao (W5-31) renders a signature/stamp image slot only if a tenant asset exists (a settings key); the asset is pending from the owner.
- **Recommended default:** render **blank vertical space** for a physical stamp + signature until the owner sources the asset (from the Fisiozero export or JP). The settings key + conditional render ship now; the asset drops in later with no code change.
- **Owner:** Ivan (source the stamp/signature image from Fisiozero or JP). Consumed by W5-31. Non-blocking.

### Q-W5-10 - Localidade line default on the Declaracao (per-location vs fixed "Lisboa")
The "{localidade}, {dia}" line (W5-31) takes `localidade` from the selected marcacao's location, falling back to the tenant default location.
- **Recommended default:** **per-location** (from the marcacao, tenant-default fallback), as built. Confirm with JP whether a **fixed "Lisboa"** is preferred instead.
- **Owner:** Ivan (confirm with JP). Consumed by W5-31. Non-blocking (default is per-location).

### Q-W5-11 - Responsavel name on the Declaracao (configurable per tenant)
The responsavel line "(Dr. Joao Paulo Santos Silva)" (W5-31) is sourced from a tenant setting, not hardcoded.
- **Recommended default:** keep it a **tenant setting** with the current value defaulted to "Dr. Joao Paulo Santos Silva"; confirm the exact current value + spelling with JP.
- **Owner:** Ivan (confirm current value with JP). Consumed by W5-31. Non-blocking.

### Q-W5-27 - Ficha field order is not driven by template property order (jsonb) - RESOLVED 2026-07-12
**ANSWERED (owner ruling 2026-07-12):** x-order fix approved and implemented. `"x-order"` array (jsonb-preserved) in the v4 schema; `parseTemplateSchema`/`topLevelFields` sort by it (single source for body + nav); v1/v2/v3 never retrofitted (rule 5). Seeder `deepEqual` made order-independent so it reports true file-DB parity. Scoped live UPDATE applied + verified; v4 stays active. Nested-object orders (Outros grid, systems_review) remain jsonb-ordered - out of W5-27 scope, flagged for follow-up. See DECISIONS 2026-07-12 W5-27 execution.
`form_templates.schema` is a **jsonb** column; Postgres jsonb normalizes object-key order (length, then bytewise), so the renderer + left-nav (both `topLevelFields` = `Object.entries(schema.properties)` off the DB jsonb) render ficha fields in **length-order**, not the template's authored order. Verified live on jaxmkwoxjcgzkwxgbayx: v3 and v4 both come back length-sorted. Consequence: (1) the W5-27 loop mechanism (reorder the v4 seed) cannot deliver FF2-A; (2) production has rendered every osteopathy version in length-order, never the SPEC "authoritative sequence" (the file-order unit tests masked this). GREEN HALTED W5-27 before PR/merge per the FF2 briefing ("HALT-LOUD on briefing-vs-reality mismatch"). The v4 seed row WAS applied (authorized) and is currently active; attempt to deactivate it while halted was classifier-denied.
- **Recommended default:** add `"x-order": string[]` (FF2-A key order) to the v4 template schema (jsonb preserves ARRAY order), teach `parseTemplateSchema`/`topLevelFields` to sort by it when present (absent -> current order, so v1/v2/v3 keep their original structure, rule 5). Migration-free. Requires a scoped UPDATE of the live v4 row to carry x-order (needs explicit live-DB authorization after the deactivation denial).
- **Owner:** Ivan / CYAN (technical). Full detail + evidence: ~/osteojp-mailbox/escalations/W5-27-jsonb-order-mismatch.md and inbox/W5-27-order-mechanism-question.md. BLOCKS W5-27 and the FF2 chain.

### Q-W5-29 - Modelo picker still shows the "v4" version suffix (TSX-baked, not i18n) - FLAG
W5-29 renamed the Inicio tile ("Registo clinico" -> "Ficha Clinica") and the new-ficha button ("Novo registo clinico" -> "Nova ficha clinica") in i18n. The remaining user-visible version suffix - the Modelo picker option "Ficha Clinica v4" - is composed in TSX (`apps/web/app/clinical/new/page.tsx:61`, `title + \` v${version}\``), NOT an i18n display string. Per W5-29 Field 6 (a version suffix baked into code is surfaced, not stripped, in this i18n-only loop), it was left untouched.
- **Recommended default:** a small follow-up loop strips the ` v${version}` concatenation from the picker label (display-only), and updates the E2E fixture `TEMPLATE_CURRENT_LABEL` + the picker selectors that currently match "Ficha Clinica v4". Low-risk, but it is a code+E2E change, out of W5-29's i18n-only scope.
- **Owner:** Ivan. Non-blocking; the two named renames shipped in W5-29 (#TBD).

### Q-W5-30 - Delete/annul secret + capability (proceeded on recommended defaults)
W5-30 needed two decisions the loop left open; both proceeded on the recommended default (non-blocking).
1. **Shared vs separate delete-password secret** — REUSED the shared tenant delete-password (`appointmentDeletePasswordHash`, default "1234") for both hard-delete and Anular, per the W5-30 Field-2 recommendation. No new secret introduced.
2. **Capability** — both hard-delete (draft) and Anular (signed) require `clinical_records:author` (the therapist who owns fichas), NOT `settings:manage`. Rationale: admin is read-only on clinical records (permission matrix), so a clinical-content lifecycle action belongs to the author. The password gate is the destructive-action confirmation on top.
- **Owner:** Ivan. If a distinct secret or an admin-only gate is preferred, say so and it becomes a small follow-up. Shipped in W5-30 (#TBD) on these defaults.

### Q-W5-31 - Declaração responsável + stamp: code-default + tenant override (no live-DB write)
The signature/stamp asset (owner ADDENDUM) was extracted from ~/Downloads/Fisiozero.pdf and committed to the repo (apps/web/lib/clinical/declaracao/assets/signature-stamp.png + a base64 module for reliable serverless bundling). Rather than a live tenant-settings write, the PDF renders the responsável name and the carimbo BY DEFAULT (sane defaults in declaracao-settings.ts), with a `tenants.settings.declaracao` override (responsavel / signatureStamp) for any tenant. This makes the declaration render correctly in every environment (preview/CI/prod) with NO live-DB step (per the W5-31 merge note) while still honoring the ADDENDUM (the PDF renders the image + name). The PDF renderer (declaracao-pdf.ts) contains NO responsável literal - it draws model.responsavel; the sane default lives in the config layer.
- **Recommended default:** keep the code-default + tenant-override design. If the owner wants the name/stamp gated strictly on a DB setting (rendered blank until set), a small follow-up flips the defaults and sets the tenant key. Non-blocking. Shipped in W5-31 (#TBD).

### Q-W5-33 - Final consent texts do not map cleanly to the consent structure - RESOLVED 2026-07-12
**ANSWERED (owner ruling 2026-07-12):** recommended default ratified. Ficha Consinto block = two items, treatment (new item, TEXT 1 verbatim) + rgpd (TEXT 2 verbatim); recording (TEXT 3 verbatim) on the Iniciar consulta step; sms + dataHandling items + all nine .v1/.v2/.v3 variants + both PENDENTE-JP notices REMOVED; SMS communication stays governed by the per-patient reminder opt-out flag (untouched). Signed-record guard: consent DECISIONS read from stored data._consent, text is live i18n, and the deleted keys are no longer referenced by any code path, so no signed-record view breaks. Twelve AI keys frozen; W5-13 compat 3/3. Implemented in W5-33.

### Q-W5-33 (original) - Final consent texts do not map cleanly to the consent structure - BLOCKING (legal copy)
The owner's 3 FF2 final texts (TEXT 1 treatment / TEXT 2 RGPD / TEXT 3 recording) don't line up with the ficha Consinto block, which has 3 DIFFERENT items (`rgpd`, `sms`, `dataHandling`, each body + `.v1/.v2/.v3` variants) + PENDENTE-JP notices. CLEAN: TEXT 2 -> `rgpd` + RGPD PDF; TEXT 3 -> `consultation.consentLabel`. UNDETERMINED (needs owner decision, do not guess on legal copy): TEXT 1 (treatment) has no consent item; `sms` + `dataHandling` have no owner text; the `.v1/.v2/.v3` variant keys are obsolete now the wording is final. Resolving these is a consent-STRUCTURE change, conflicting with the loop's "keys frozen, only values change". GREEN HALTED W5-33 before any edit (Field 6: does not map cleanly, do not guess).
- **Recommended default:** Consinto block = {treatment (new item, TEXT 1), RGPD (TEXT 2)}; DROP `sms` (lives in reminder prefs 0019) + `dataHandling` (subsumed by TEXT 2) + the variant keys; recording (TEXT 3) on the Iniciar consulta step; remove the pending/draft notices. Faithful en-GB, zero em/en dashes.
- **Owner:** Ivan / CYAN. Full detail: ~/osteojp-mailbox/escalations/W5-33-consent-mapping-ambiguity.md + inbox/W5-33-consent-mapping-question.md. Blocks W5-33 + W5-34.

## 2026-07-14 - Wave 05 Ficha Final 2 (FF2) close: QUESTIONS sweep

FF2 (W5-27..W5-34) is merged (#559-#566, main c541e8b) and staff-verified. Sweep by YELLOW at close.

### CLOSED this sweep (ruled + shipped)
- [x] **Q-W5-27 CLOSED as ruled (2026-07-12).** The jsonb render-order finding was ruled: `x-order` array is the standing order authority for v4 and onward; v1/v2/v3 are never retrofitted. Shipped in W5-27 (#559). See DECISIONS.md 2026-07-12 "W5-27 execution" and the 2026-07-14 close-out entry.
- [x] **Q-W5-33 CLOSED as ruled (2026-07-12).** Consinto = treatment (TEXT 1) + rgpd (TEXT 2); recording (TEXT 3) at Iniciar consulta; sms + dataHandling + the `.v1/.v2/.v3` variants + PENDENTE-JP notices removed; SMS governed by the per-patient reminder opt-out flag. **JP reviewed and confirmed the three consent texts 2026-07-12.** Shipped in W5-33 (#565). See DECISIONS.md 2026-07-13 "W5-33 execution".

### STILL OPEN after this sweep (JP batch, non-blocking)
- [ ] **Q-W5-10 - Declaracao localidade line default.** Per-location (from the marcacao, tenant-default fallback) shipped in W5-31 (#563). Confirm with JP whether a fixed "Lisboa" is preferred instead. Default is per-location; non-blocking.
- [ ] **Q-W5-11 - Declaracao responsavel name (tenant setting).** The responsavel line is a tenant setting defaulted to "Dr. Joao Paulo Santos Silva" (code-default + `tenants.settings.declaracao` override, per Q-W5-31). Confirm the exact current value and spelling with JP. Non-blocking.

Other FF2 items (Q-W5-9 stamp asset, Q-W5-29 Modelo picker v4 suffix, Q-W5-30 delete/annul defaults, Q-W5-31 declaracao stamp design) proceeded on recommended defaults and shipped; each notes its follow-up above and is not a blocker.

### W6-02 (invite email + self-service profile) - opened 2026-07-14
- [ ] **Q-W6-02-1 (env, part a) - invite email live-send config.** The Convidar invite email is already fully wired to Resend in code (inviteStaff -> sendEmail, temp-password fallback, sent/failed messaging). It stays in SANDBOX (no send) until the owner sets, in Vercel **osteojp-platform**: `RESEND_API_KEY`, `REMINDERS_EMAIL_FROM` (a verified osteojp.pt sender), and `REMINDERS_LIVE_SEND=true`. **Caveat:** `REMINDERS_LIVE_SEND=true` is a GLOBAL live-send switch (also enables live appointment reminders), and real delivery needs the osteojp.pt domain verified in Resend. Recommended default: verify the domain, then set the three vars. If invites should go live WITHOUT enabling live reminders, that needs a small follow-up code change to decouple the invite gate. See mailbox inbox `*-W6-02-invite-email-env.md`. No invite code change shipped (none needed).
- [ ] **Q-W6-02-2 (schema, part b contact) - staff phone/contact column.** The self-service profile ships editable **name** + **change password** + read-only **email**. The `users` table has NO phone/contact column, so an editable "contact" field would need a migration. Per the migration-free loop rule this was NOT added. Recommended default: add a nullable `users.phone` in a follow-up migration loop, then surface it on the profile. Confirm whether staff phone is wanted.
- [ ] **Q-W6-02-3 (part b email) - own-email editing.** Email is shown read-only on the profile because it is the Supabase auth login identity AND the `(tenant_id, email)` unique key; changing it is a distinct auth email-change + verification flow. Recommended default: keep email read-only in self-service (admins can already change staff details via users:manage). Confirm if self-service email change is wanted (separate flow).

### W6-04 (deleted-patients management) - opened 2026-07-14
- [ ] **Q-W6-04-1 - merged (duplicate) patients are visible but not restorable.** The Pacientes eliminados view lists both soft-deleted (deletedAt) and duplicate-marked (mergedIntoId) patients. Restore is offered ONLY for soft-deleted rows: a merged loser's history was repointed to the survivor, so restorePatient refuses it by design (restoring would duplicate rows already on the survivor). Merged rows show "Duplicado de <survivor>" for visibility. Recommended default: keep merged rows non-restorable (unmerge is a data-reconciliation operation, not a simple restore). Confirm whether an explicit "unmerge" flow is wanted; if so it is a follow-up loop (needs a reconciliation model).

### W6-05 (Estatisticas owner-only KPIs) - opened 2026-07-14
- [ ] **Q-W6-05-1 - charting library (owner-confirmable).** The stack has NO charting dependency. Per CLAUDE.md a new third-party vendor is owner-confirmable, so the MVP chart is a dependency-free hand-rolled SVG bar chart (revenue per month), which meets the "at least one polished chart" bar with zero new dependency and AA preserved. Recommended default: keep the hand-rolled chart. If you later want richer/interactive charts (multiple series, tooltips, pie/line), the standard React choice is `recharts` (MIT) - say the word and it is a one-loop add. No vendor was added silently.

### W7-01 (invite regression + live-send flag decoupling) - opened 2026-07-14
- [ ] **Q-W7-01-1 (env) - live-invite env set, decoupled from reminders.** W7-01 introduces `INVITES_LIVE_SEND` so invites can go live WITHOUT enabling live appointment reminders (the decoupling flagged in Q-W6-02-1). To send REAL invite emails, set in Vercel **osteojp-platform** (names only, never a value): `RESEND_API_KEY`, `REMINDERS_EMAIL_FROM` (a verified osteojp.pt sender/from address), and `INVITES_LIVE_SEND=true`. **Prerequisite:** the osteojp.pt sending domain must be verified in Resend before real delivery. Until all three are set (and the domain verified), invites stay on the temp-password path and the UI shows the temporary password with a clear "email not sent" message (never the generic failure). **`REMINDERS_LIVE_SEND` is unchanged and still gates reminders only** - the two switches are independent after W7-01. Recommended default: verify the osteojp.pt domain, then set the three invite vars; leave `REMINDERS_LIVE_SEND` as-is unless live reminders are also wanted. The exact root-cause finding + fix are recorded in the W7-01 loop file appendix at execution.
