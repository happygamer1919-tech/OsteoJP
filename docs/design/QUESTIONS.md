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
