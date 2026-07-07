# Loop W4-14 - Horários admin: per-therapist cards + Editar horário modal (weekday toggles, per-day hours/location, in-modal delete) (redesign + functional change, recon-first, migration-free)

GATE: depends on **W4-13 merged** (consumes `docs/design/UI-STYLE.md` — this redesign conforms to it). Admin UI + server, migration-free. **Includes a functional change** (per-day modal editing + no-password row delete). Runs in parallel with any one in-flight migration (touches no `packages/db/migrations`, `supabase/migrations`, or `.github/workflows` files).

## Field 1. Scope and ground truth
Redesign the **Horários** admin surface (`/admin/working-hours`) from a flat all-therapists table into a **per-therapist card dashboard with a per-day editing modal**, conforming to `docs/design/UI-STYLE.md` (W4-13).

Ground truth (locked mechanisms to embed — GREEN runs with ZERO memory; do not assume anything not written here):
- **W2-12 (#464) built the working-hours CRUD:** `/admin/working-hours`, gated behind the admin layout (`settings:read` to view, `settings:manage` to write), doing per-therapist **`availability_templates`** CRUD (list / create / edit / archive by weekday, start, end, active location). **Archive = `is_active = false`**; **overlap rejected** for the same therapist+weekday+location; **end > start** enforced; location dropdowns show **ACTIVE locations only**. **This loop reuses the W2-12 write paths — it does NOT rewrite the CRUD.**
- **W3-02 (#469) top-layer dialog precedent:** the shared **`useAnimatedDialog`** hook lifts a `<dialog>` into the **top layer via `showModal`** (isolated from in-flow overlays / discard guards). Use this for the Editar horário modal.
- **W4-02 (#481) 24h time component:** the **`TimeField` / `TimeFieldInput` wrapper**, 24h `HH:mm` (`00:00`–`23:59`), **15-minute step** (`:00 / :15 / :30 / :45`, exposed as a `step` prop; DECISIONS 2026-07-06). **No AM/PM anywhere.** Use this component for every start/end input in the modal.
- **W4-01 (#480) deep link:** the Equipa row's Horários action deep-links to `/admin/working-hours?t=<id>` and preselects that therapist. **This deep link MUST keep working and keep preselecting.**
- **Availability reads consume these rows:** `getTherapistAvailability` (`apps/web/lib/scheduling/day-availability.ts:72`, read-only, tenant-scoped) turns `availability_templates` minus booked intervals into booking availability. **The booking availability panel and this read must NOT regress** — a template edited/deleted here changes what the booking flow offers.
- **Admin-gated already:** the page sits behind `settings:read`/`settings:manage`. **Availability-template row delete requires NO password** (owner ruling 2026-07-06 — the page is admin-gated already; DECISIONS 2026-07-06 "Availability template row delete"). This is a **direct delete**, distinct from the password-gated therapist/appointment deletes.

**Current pain (owner UX finding 2026-07-06):** hours are entered **one row at a time per therapist per day** via a global add form, and results render as **one flat all-therapists table** — confusing to read.

**Build:**
- **(a) Per-therapist dashboard:** one **card per therapist** showing a **compact weekly summary** (days worked, hours, location per day), styled per UI-STYLE.md.
- **(b) One `Editar horário` button per card** opening a **top-layer modal** (`showModal`, W3-02 `useAnimatedDialog`): **toggle which weekdays** the therapist works; **set start and end hours per selected day** (24h `TimeField`, 15-min step, W4-02); **pick location per day** (active locations only); a **single `Guardar`** writes through the existing **W2-12 CRUD paths** (create/edit/archive as needed to reconcile the modal state), preserving overlap-reject + end>start + active-locations-only.
- **(c) Delete option for schedule rows INSIDE the modal — no password** (owner ruling 2026-07-06), **direct removal** (reuse the W2-12 delete/archive path per its existing semantics; if W2-12 removes via archive `is_active=false`, keep that mechanism — recon confirms delete-vs-archive and the loop states which it uses).
- **(d) The deep link `/admin/working-hours?t=<id>`** from Equipa keeps working and **preselects that therapist** (opens focused on that therapist's card).

All UI copy is **pt-PT via i18n keys** (no hardcoded strings, no emoji). **Migration-free** (any proven schema need is a HALT). All build/verify work is **synthetic-data-only**; verify on the **E2E seed tenant**.

## Field 2. Ordered steps
1. **A0 isolation guard:** `git worktree add ../osteojp-w4-14-horarios-redesign origin/main -b osteojp-w4-14-horarios-redesign`; assert `git rev-parse --show-toplevel` ends in `osteojp-w4-14-horarios-redesign`; assert `git status --porcelain` is empty. HALT (Field 6) if either fails.
2. **Recon, report BEFORE editing (paste paths):** the `/admin/working-hours` route + component; the **W2-12 create/edit/archive(/delete)** server actions over `availability_templates` (state which mechanism removes a row — delete vs archive); the `useAnimatedDialog` hook + a current `showModal` mount site; the `TimeField`/`TimeFieldInput` component + its `step` prop; the `?t=<id>` deep-link handling; `getTherapistAvailability` and the booking availability panel that must not regress; the Horários Playwright specs that will move.
3. **(a) Per-therapist cards:** group the flat table into one card per therapist with the weekly summary (days/hours/location), per UI-STYLE.md.
4. **(b) Editar horário modal:** build the top-layer `showModal` modal with weekday toggles, per-day `TimeField` start/end (15-min step), per-day active-location picker, and a single `Guardar` that reconciles to the W2-12 write paths (overlap-reject + end>start + active-locations preserved).
5. **(c) In-modal delete (no password):** wire the per-row remove to the existing W2-12 remove path; **no password prompt** (page is admin-gated). State delete-vs-archive semantics used.
6. **(d) Deep link:** confirm `/admin/working-hours?t=<id>` preselects/opens the therapist's card focused.
7. **Regression check:** confirm `getTherapistAvailability` + the booking availability panel reflect an edited/deleted template correctly and no availability read regresses.
8. **Update the Horários Playwright specs on-branch** (**never touch `db-tests.yml` or `e2e.yml`**). **Full gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for: open modal → toggle a weekday → set 24h hours → pick location → Guardar persists; in-modal delete persists (no password); deep link preselects.

## Field 3. Definition of done (machine-verifiable)
- **Migration-free PROOF:** `git diff --name-only origin/main` shows ZERO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. Paste it.
- **Recon report pasted:** route + W2-12 write paths (delete-vs-archive stated) + `useAnimatedDialog` + `TimeField` step + deep-link handling + `getTherapistAvailability` + the specs that move.
- **Per-therapist cards render** with the weekly summary. Paste a screenshot/DOM assertion replacing the flat-table QA state.
- **Modal edits persist through W2-12 paths:** toggling a weekday + setting 24h hours + location + `Guardar` writes `availability_templates` via the existing CRUD (overlap-reject + end>start + active-locations-only preserved). Paste the persistence test.
- **In-modal delete persists with NO password** (owner ruling): paste the delete test showing no password gate and the row removed (state delete/archive semantics).
- **Deep link preselects:** `/admin/working-hours?t=<id>` opens focused on that therapist. Paste the test.
- **Zero availability-read regression:** an edited/deleted template is reflected by `getTherapistAvailability` and the booking availability panel. Paste the regression test.
- **Conforms to `docs/design/UI-STYLE.md`** (W4-13): note which card/modal/badge/token patterns were applied.
- **Suite counts** pasted (web + db) with green `lint/typecheck/test/build`. Baseline: web 685, db 56 local + 255 DB-gated (STATE 2026-07-06) — report new totals.

## Field 4. Verification (paste evidence)
Recon report, migration-free `git diff --name-only origin/main`, per-therapist-card screenshot, the modal persist test, the no-password in-modal delete test, the deep-link preselect test, the availability-read regression test, the UI-STYLE conformance note, e2e summary, and suite counts.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation:** work ONLY in `../osteojp-w4-14-horarios-redesign` off `origin/main`; never edit the primary clone.
- **Migration-free:** NO files under `packages/db/migrations/`, `supabase/migrations/`, or `.github/workflows/`. No schema change. Any proven schema need is a **HALT**. One migration may be in flight system-wide; this loop opens none.
- **Reuse W2-12 write paths** — do NOT rewrite the `availability_templates` CRUD; the modal reconciles to it. Preserve overlap-reject, end>start, active-locations-only.
- **In-modal delete is NO-PASSWORD, direct** (owner ruling 2026-07-06) — do not add a password gate here; the page's admin gate stands.
- **Redesign WILL move Playwright selectors:** update the affected specs **on-branch**. **NEVER touch `.github/workflows/db-tests.yml` or `.github/workflows/e2e.yml`.**
- **LIVE-DATA CAUTION (STRONGEST here — real therapists' templates live on this page):** real therapist accounts (Max's entries) and their **`availability_templates`** live on dev tenant `3a2d0711-fbdb-4ce9-b940-b6a87e3d3560`. **Never modify or delete a real therapist's templates.** All create/edit/delete verification is on **synthetic therapists on the E2E seed tenant** — never on a real account.
- **Conform to `docs/design/UI-STYLE.md`** (W4-13); refinement, not rebrand. Use the W4-02 `TimeField` (24h, 15-min step) — **no AM/PM anywhere**.
- **Never force-push. Never merge with `--admin`. Never bypass branch protection.**
- **pt-PT via i18n keys**, no hardcoded strings, no emoji. DB access ONLY through `packages/db`; `tenant_id` from JWT context, never payload.

## Field 6. Halt loud if (CLASSIC halt — no CYAN desk running this batch)
Halt protocol for this batch is **CLASSIC**: on any blocker, **STOP and report to Ivan** with (1) the exact mismatch, (2) the options, (3) a recommended default. Leave the branch GREEN and record the resume state. **Never guess a product decision.** Do NOT poll a mailbox (none is running).

Halt if:
- The W2-12 CRUD cannot express the modal's per-day reconcile (e.g. a "set several days at once" write) without a NEW write path that changes semantics or needs schema — surface it; recommend reconciling via repeated existing create/edit/archive calls before proposing anything new.
- Removing a row requires an `UPDATE`/`DELETE` privilege the table denies, or a delete would orphan a referenced row — surface it (use the W2-12 archive mechanism if delete is not granted) and state the choice.
- Editing/deleting a template would regress `getTherapistAvailability` or the booking panel in a way the loop cannot preserve — STOP; availability reads must not regress.
- The modal or `TimeField` requires editing a `packages/ui` primitive whose ripple extends beyond Horários — surface the blast radius.

## Field 7. Report back
Recon report, the per-therapist cards + Editar horário modal + in-modal no-password delete + deep-link preselect, the persistence/delete/deep-link/availability-regression tests, the UI-STYLE conformance note, migration-free proof, e2e summary, suite counts, and the PR number.
Close: **open ONE PR against `main` per the standard template and HALT for owner merge.** Do NOT self-merge (this batch has no runner self-merge authority; classic stop-and-report). A refused or blocked merge is a HALT reported to Ivan.
