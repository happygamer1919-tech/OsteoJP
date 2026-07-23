# Loop W12-26 - "Diversos" internal-only service (Wave 12 Lote Castelo Branco + Rodica July batch)

GATE: **Wave 12, FEATURE, migration-gated, owner-confirm. OWNER-MERGE (migration + owner-confirm). CYAN pre-merge audit mandatory. The coupled-flags lesson applies.** A "Diversos" service that staff can book internally but that NEVER appears in the patient-portal booking wizard. Recommended default; owner confirms (Q-W12-04). One migration in flight, one PR in flight. Starts from **fresh `origin/main`**; never stacked.

## Field 1. Scope and ground truth

Add a decoupled `internal_only` flag to `services` so a service (e.g. "Diversos") is bookable by staff but excluded from the portal wizard; create the "Diversos" service (data). Owner confirms the behaviour before build.

Ground truth (recon at authoring 2026-07-23, embed - executor verifies, ZERO memory):

- **No internal/portal-bookable flag exists today.** Booking/agenda + the portal catalog both filter `services.is_active = true` (`apps/web/lib/scheduling/data.ts:227`; portal `apps/api/lib/appointments/store.ts:258`); there is no way to make a service staff-bookable but portal-hidden. `services` (`schema.ts:248-277`).
- **Recommended default (owner to confirm, Q-W12-04):** add `services.internal_only boolean NOT NULL DEFAULT false` (decoupled; the coupled-flags lesson - do not fold into unrelated service migrations); the PORTAL catalog query excludes `internal_only = true`; the STAFF booking/agenda includes it. Then create the "Diversos" service (data, owner-gated) as `internal_only = true`. If the owner prefers a non-schema approach (e.g. a naming/location convention), HALT to the Q rather than guessing.
- **Portal source of truth:** the portal wizard reads the catalog via `listOpenSlots`/the portal service list; the exclusion must be applied there without changing staff behaviour or LV portal slots.

**Scope:** one migration (the decoupled `internal_only` flag) + the portal exclusion + the staff-includes behaviour + the owner-gated creation of the "Diversos" service + tests. One migration in flight; head +1; manual `drizzle-kit` direct apply (5432, cwd `packages/db`). Cloud REAL DATA ONLY; verify on local + Preview.

## Field 2. Ordered steps
1. **Owner-confirm gate:** confirm Q-W12-04 (internal-only "Diversos", the flag approach) is ruled. If unruled, register/advance the Q with the recommended default and HALT the build (Field 6). **A0 isolation guard** off fresh `origin/main`; worktree; assert clean tree + HEAD == tip.
2. **Migration (decoupled):** add `services.internal_only` (boolean, NOT NULL, default false), mirrored both migration dirs; `tenant_id`/RLS on `services` unchanged; a coverage test.
3. **Portal exclusion:** the portal wizard/catalog excludes `internal_only = true`; a portal guard test asserts a "Diversos"-type service never appears in the wizard; LV portal slots unchanged.
4. **Staff includes:** the staff booking/agenda includes internal-only services (they are bookable internally).
5. **Create "Diversos" (DATA, owner-gated):** rehearse on local; apply to prod under the owner phrase, before/after counts.
6. **CYAN pre-merge audit** (migration); manual live-apply journal; Preview smoke.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`; `git diff --name-only origin/main` scoped.

## Field 3. Definition of done (machine-verifiable)
- **Owner-confirm PROOF:** Q-W12-04 ruled (internal-only via the flag).
- **Migration PROOF:** `services.internal_only` added (decoupled); head +1; CYAN CLEAN; manual live-apply journal; coverage test green.
- **Portal-exclusion PROOF:** a guard test asserts an `internal_only` service is absent from the portal wizard; LV portal slots unchanged.
- **Staff-include PROOF:** an e2e books a "Diversos" appointment internally.
- **Creation PROOF (owner-gated):** the "Diversos" service created on prod under the owner phrase, before/after counts.
- **Gates green** incl. Preview smoke.

## Field 4. Verification (paste evidence)
The Q ruling, the migration + CYAN + journal, the portal-exclusion guard, the staff-book e2e, the owner-gated creation counts, suite counts, the Preview URL (owner books Diversos internally + confirms it is portal-hidden), PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight, one PR in flight.** Owner-confirmable (new service class + portal behaviour) - do NOT build before Q-W12-04 is ruled.
- **Coupled-flags lesson:** the `internal_only` flag is a SEPARATE migration; do not fold into other service migrations or change `is_active` semantics.
- **Portal behaviour must not change for existing services** (only `internal_only=true` ones are excluded); LV portal slots unchanged.
- **Migration ships tenant_id intact + RLS unchanged + a coverage test + a CYAN pre-merge audit**; live-apply manual (direct 5432). The "Diversos" creation is a REAL-PROD data write, owner-gated, rehearsed on local. Cloud REAL DATA ONLY.
- Money/currency rules if the service carries a price; pt-PT + en both; no emoji; plain hyphens; no em/en dashes. **Never force-push / `--admin`.**

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails, OR Q-W12-04 is unruled - HALT the build (register/advance the Q with the flag default).
- The owner prefers a non-schema approach - HALT to the Q; do not build the flag against the ruling.
- The migration lacks its coverage test, or the portal exclusion would change LV portal slots - HALT.

## Field 7. Report back
The Q ruling, the migration + CYAN + journal, the portal-exclusion guard, the staff-book e2e, the owner-gated creation counts, suite counts, PR number.

## Merge policy (embed, Wave 12 Lote Castelo Branco + Rodica July batch)
- **W12-26 is OWNER-MERGE (migration + owner-confirm + real-prod data creation).** NOT `[SELF-MERGE-OK]`. Required checks + all three Vercel deploys green (checks API not banner) NECESSARY; **CYAN pre-merge audit mandatory**; the owner rules Q-W12-04, authorizes the creation, and merges.
- One migration in flight, one PR in flight, fresh `origin/main`, never stacked. Workflow files never touched. HALT-LOUD on an unruled Q or a portal behaviour change.
