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
