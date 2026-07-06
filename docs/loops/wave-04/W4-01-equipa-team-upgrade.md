# Loop W4-01 - Equipa tab: primary service for zero-mapping therapists + per-therapist working-hours entry (migration-free, recon-first)

GATE: none. Admin UI + server, migration-free. Recon-first: reuse existing surfaces before building new. Ships AHEAD of the rest of Wave 04 because real therapist data entry (Max, in progress) is BLOCKED on part (a). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Two fixes on the therapist management admin (the **Equipa** tab, pt-PT label for the staff admin surface). Both close gaps found in owner QA on 2026-07-06 after Wave 03.

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):

- **`therapist_services` (migration 0023)** — tenant-scoped join `(id, tenant_id, therapist_user_id → users.id, service_id → services.id, created_at)`, UNIQUE `(tenant_id, therapist_user_id, service_id)`. It uses the **NO-GRANT append pattern**: RLS/grants allow **SELECT / INSERT / DELETE only**; **UPDATE is revoked at the privilege layer and THROWS SQLSTATE 42501** (DECISIONS 2026-07-01 "Append-only table conventions"; DECISIONS 2026-07-01 "Migration 0023 therapist-service mapping: mutability"). A mapping is add/remove, never edit-in-place. Re-designation is therefore **DELETE + INSERT, never UPDATE**.
- **W3-04 (#471) built "primary service" re-designation** among a therapist's EXISTING `therapist_services` mappings. Representation (no schema change, no UPDATE): **primary = the EARLIEST-CREATED mapping** for that therapist (`ORDER BY created_at ASC`, tie-break by id). Re-designating primary = **DELETE the other mappings and INSERT them again** so the chosen service becomes the earliest-created row (this is the W3-04 delete+insert mechanism). The admin control is **"Serviço principal"** on the staff/Equipa admin surface (W3-04 landed it at `/admin/staff`; confirm the exact path in recon).
- **W3-03 (#470) consumes the primary at booking:** in **Nova marcação**, selecting a Terapeuta auto-fills the **Serviço** field from that therapist's mapped service ordered `created_at ASC` (i.e. the primary), editable override honored. So making the earliest-created mapping correct is what drives the booking auto-fill.
- **W2-12 (#464) built the working-hours admin:** an Administração **"Horários"** surface at **`/admin/working-hours`**, gated behind the admin layout (`settings:read` to view, `settings:manage` to write), doing per-therapist **`availability_templates`** CRUD (list / create / edit / archive by weekday, start, end, active location). Migration-free over `availability_templates`; archive = `is_active = false`; overlap rejected for the same therapist+weekday+location; end > start enforced; location dropdowns show ACTIVE locations only. Creating a template makes the therapist's hours appear in the booking availability panel.
- **Permission matrix (CLAUDE.md, server-enforced):** "Manage users/roles = Admin only". The Equipa primary-service control and any working-hours write are **admin-only, server-enforced**, never relaxed client-side.
- Build and verify against the EXISTING dev fixture therapists (seeded `USR_*` users) AND cover the **zero-mapping** case explicitly. Max enters the REAL therapists through these same admin surfaces later, with NO further code change.

**The QA gap (part a):** a therapist with **zero `therapist_services` mappings** (e.g. **Catarina Vieira**) shows **"Sem serviços"** in Equipa and **no control at all** — there is no way to assign a first/primary service, so Nova marcação has nothing to auto-fill for that therapist. W3-04 only handled re-designation AMONG existing mappings; the empty case was never wired.

Scope:
- **(a) Per-therapist primary-service dropdown in the Equipa tab, listing ALL active services of the tenant.** Selecting a service:
  - when the therapist has **zero mappings** → **creates the mapping through the existing INSERT path** (one `therapist_services` row; it is trivially the earliest-created → the primary), so "Sem serviços" is replaced by a working control and a set primary; then
  - when the therapist **already has mappings** → **re-designates via the W3-04 delete+insert mechanism** (never UPDATE), exactly as W3-04 does today.
  The dropdown is the single control for both cases (empty and non-empty). It must be admin-only, server-enforced.
- **(b) Per-therapist working-hours access from the Equipa row.** RECON FIRST (cheaper-correct path):
  - determine whether the **W2-12 `/admin/working-hours` (Horários) CRUD already supports per-therapist editing** and only needs a **link / entry point from the Equipa row** (e.g. "Horários" action deep-linking to the Horários area scoped/filtered to that therapist), OR
  - whether a **per-therapist working-hours view must be built** because Horários has no per-therapist scoping.
  Take the **cheaper correct path**: if Horários already does per-therapist CRUD, add only the entry point (prefer passing the therapist id so the Horários view opens focused on that therapist); do NOT rebuild CRUD that already exists.

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free.**

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-01-equipa-team-upgrade origin/main -b osteojp-w4-01-equipa-team-upgrade`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-01-equipa-team-upgrade`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE writing (paste paths):**
   - The Equipa/staff admin surface and its component(s); the exact route (confirm `/admin/staff` or wherever W3-04's "Serviço principal" lives); the server action(s) that INSERT/DELETE `therapist_services`; how the current "Serviço principal" control renders and why it collapses to "Sem serviços" when there are zero mappings.
   - The tenant "all active services" read (there is an existing active-services query used elsewhere — reuse it; do not write raw SQL).
   - The W2-12 Horários surface (`/admin/working-hours`): does it accept/scope by a therapist id today (per-therapist CRUD), or is it flat? Determine the cheaper-correct path for (b) and state which one you will take, with the paths.
3. **(a) Zero-mapping + re-designation dropdown:** render a primary-service `<Select>` in the Equipa row/detail listing ALL active tenant services. On select:
   - zero existing mappings → INSERT one `therapist_services` row (existing INSERT path) — becomes the primary (earliest-created);
   - existing mappings → apply the W3-04 delete+insert re-designation so the chosen service is the earliest-created row. **Never issue UPDATE** against `therapist_services` (42501). Admin-gated, server-enforced.
4. **(a) confirm the booking consumption:** the primary set here is what W3-03 reads (`created_at ASC`); no change to W3-03 needed — verify by test that Nova marcação auto-fills the newly-assigned service for that therapist.
5. **(b) Working-hours entry point:** per the recon decision, add the Equipa-row entry point to the therapist's working hours (link into Horários scoped to the therapist if Horários already supports it; otherwise build the minimal per-therapist view over the same `availability_templates` CRUD — reusing W2-12's actions, not duplicating them). Admin-gated (`settings:read`/`settings:manage`), active locations only, overlap + end>start rules preserved.
6. **Tests:**
   - zero-mapping therapist (fixture standing in for Catarina Vieira, i.e. a therapist with no `therapist_services`) → set a primary from the dropdown → row persists, "Sem serviços" replaced, read returns the service as primary;
   - non-empty therapist → change primary → re-designation is delete+insert, **NO UPDATE** issued against `therapist_services`;
   - Nova marcação auto-fills the assigned primary when that therapist is selected;
   - non-admin cannot set primary and cannot write working hours (server-side permission check);
   - working hours for a single therapist are reachable from the Equipa row and editable (create/edit/archive persists), active-locations-only + overlap-reject preserved.
7. **Full gates for the touched admin + booking views:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for the Equipa primary-service flow (incl. the zero-mapping path) and the working-hours entry point.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** Equipa surface + `therapist_services` write actions + the active-services read; the (b) cheaper-correct decision (link vs build) with paths.
- **Zero-mapping therapist gets a primary:** a therapist with no `therapist_services` (Catarina-Vieira case) is assigned a primary from the dropdown and it PERSISTS. Paste the test + e2e summary.
- **Nova marcação auto-fills** that service when the therapist is selected. Paste the test.
- **No `UPDATE` against `therapist_services`:** paste the test proving re-designation uses delete+insert (consistent with the 42501-on-UPDATE mechanism).
- **Working hours reachable + editable from the Equipa row** for a single therapist. Paste the test/e2e.
- **Admin-gating enforced server-side** for both the primary control and working-hours writes: paste the non-admin-refused test.
- **Suite counts** pasted (web + db) alongside a green `lint/typecheck/test/build` (paste the commands run). Baseline reference: web 685, db 56 local + 255 DB-gated at Wave 03 close (STATE 2026-07-06) — report the new totals.

## Field 4. Verification (paste evidence)
Recon report + (b) decision, migration-free `git diff --name-only origin/main`, zero-mapping set-primary test, Nova marcação auto-fill test, no-UPDATE delete+insert proof, working-hours-from-Equipa test, permission-gate test, e2e summary (screenshots or test output), and suite counts. Screenshots of: the Equipa dropdown on a zero-mapping therapist before/after, and the working-hours view reached from the Equipa row.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-01-equipa-team-upgrade` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Represent primary WITHOUT a new column and WITHOUT any `UPDATE` to `therapist_services` (respect the 0023 no-grant mechanism; re-designation = delete+insert).
- **Never touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.** One migration may be in flight elsewhere; this loop opens none.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- Reuse existing surfaces: prefer a link into W2-12 Horários over rebuilding working-hours CRUD; reuse the existing active-services read and the existing INSERT/DELETE `therapist_services` actions.
- Build/verify against EXISTING dev fixture therapists (incl. a zero-mapping one); do NOT create real therapists (Max does that through this same UI later, no code change).
- Admin-only, server-enforced (permission matrix "Manage users/roles = Admin"; working hours = `settings:manage`). Do not relax gating client-side.
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state in the report. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The Equipa/staff admin surface or the `therapist_services` INSERT/DELETE actions are not where ground truth says (build target missing or moved) — report the actual state before proceeding.
- Assigning a first mapping for a zero-mapping therapist cannot be done through the existing INSERT path without an UPDATE or a schema change (it should not — a first INSERT is the append pattern; if reality differs, surface it).
- The W2-12 Horários surface neither supports per-therapist scoping NOR can accept a therapist id without a change larger than "add an entry point" — report the blast radius of building a per-therapist view and recommend link-vs-build.
- Any required write would need an `UPDATE` to `therapist_services` (42501) with no delete+insert alternative.
- A required change would force editing `packages/ui` primitives or a workflow file — surface the ripple, do not proceed.

## Field 7. Report back
Recon report + (b) link-vs-build decision, the zero-mapping dropdown + working-hours entry-point implementation, the set-primary/auto-fill/no-UPDATE/working-hours/permission tests, migration-free proof, e2e summary with screenshots, suite counts, and the PR number.
Close: **open a PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
