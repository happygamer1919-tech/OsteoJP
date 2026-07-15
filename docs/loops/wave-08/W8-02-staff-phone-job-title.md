# Loop W8-02 - Staff phone number + job title fields (Wave 08 Dados e KPI)

GATE: **Wave 08 Dados e KPI, MIGRATION loop, RECON-FIRST.** Adds a phone number field and a professional job-title field to the staff/therapists model in ONE migration, and surfaces both in Administracao > Equipa (list + edit) and in the staff-identity render points where sensible. The owner enters every value manually AFTER this ships; the loop delivers EMPTY (nullable) fields, no seeded values. **Runs FIRST in Wave 08** (it unblocks the owner's manual data entry). Starts from **fresh `origin/main`**; never stacked. **OWNER-MERGE with live-apply evidence** (this is a migration loop).

## Field 1. Scope and ground truth

Add two nullable columns to the staff record - a **phone number** and a **job title** (professional title, e.g. Fisioterapeuta, Osteopata, Recepcionista) - in a single migration, then surface them in the team-management UI and wherever a staff member's identity renders and a title/phone is useful. Both fields are optional and ship empty; the owner fills them in by hand afterwards.

Ground truth (recon at authoring 2026-07-15, embed - executor runs with ZERO memory):
- **There is NO dedicated therapist/staff table.** A staff member is a `users` row (`packages/db/src/schema.ts:190-213`) whose `roleId` points at a `roles` row whose `slug` is one of `owner | admin | therapist | reception`. Therapists are simply `users` with `role.slug = "therapist"`.
- **The `users` table today (`packages/db/src/schema.ts:190-213`) has exactly these columns:** `id`, `tenantId` (not null, FK tenants), `roleId` (nullable, FK roles), `email` (not null), `fullName` (not null), `isActive` (not null default true), `createdAt`, `updatedAt`. Indexes: `users_tenant_idx` on `tenant_id`, `users_tenant_email_uq` unique on `(tenant_id, email)`. **There is NO phone/telefone column and NO job_title/title column on `users`.** (A `phone` column exists on `locations` at `schema.ts:228` and on `patients` at `schema.ts:366`; neither is the staff phone.)
- **Auth role is NOT a job title.** The four permission roles live in `packages/auth/permissions.ts:10` (`ROLES = ["owner","admin","therapist","reception"]`) and drive the capability matrix + RLS. The NEW `job_title` field is an orthogonal DISPLAY/professional-title string (Fisioterapeuta, Osteopata, Recepcionista, ...): a therapist may hold `role.slug = "therapist"` and `job_title = "Osteopata"` OR `"Fisioterapeuta"`. **Do NOT couple `job_title` to the permission role**; it never gates anything.
- **The staff service layer is `apps/web/lib/admin/staff.ts`.** `listStaff()` (`~37-59`) returns `StaffMember { id, email, fullName, roleSlug, isActive }` (type at `~29-35`). `editStaff()` (`~332-387`) currently updates only `fullName` + `email`. `inviteStaff()` (`~104-173`), `setStaffActive()` (`~175-213`), `changeStaffRole()` (`~215-270`), `deleteStaffMember()` (`~430-488`). None read/write phone or job title today.
- **Administracao > Equipa UI is under `apps/web/app/admin/staff/`:** `page.tsx` (the list: a 6-column table - name, email, role, primary service, status, actions - plus summary KPIs), `StaffManageModal.tsx` (the centered edit modal, W5-06; edit fields at `~102-124`: full name, email, role, activate/deactivate, password-gated delete), `StaffInviteForm.tsx` (invite: full name + email + role only), `EquipaLocationFilter.tsx` (W5-32), and `actions.ts` (server actions: `inviteAction`, `editStaffAction`, `changeRoleAction`, `deleteStaffAction`, `setActiveAction`, `setPrimaryServiceAction`).
- **Staff identity renders in the app shell** at `apps/web/components/app-shell.tsx` (`UserAreaCluster` from `@osteojp/ui`, `~74-104`): avatar/initials + a name (derived from the email local part, `displayFromEmail` `~39-52`) + the auth role label (`ROLE_LABEL`, `~29-34`). The shell reads only the JWT `email` + `role` claims; it does not fetch the `users` row. The self-service profile route `/perfil` (`apps/web/app/perfil/`, shipped W6-02 / reachable W7-02) edits own name + password, email read-only.
- **Migrations live in BOTH `packages/db/migrations/` AND `supabase/migrations/`, kept in lock-step at the same numbers** (latest on main is `0035_record_annulments.sql` in both). A migration also updates the drizzle snapshot under `packages/db/migrations/meta/`. **The next number is `0036`** (confirm with `git fetch` + a directory listing at execution; W8-02 is the FIRST migration of Wave 08).

**Scope (single migration + UI surface):**
1. **Migration `0036` (both migration dirs + snapshot):** add two NULLABLE columns to `users`: a phone column (`phone`, text/varchar, nullable) and a job-title column (`job_title`, text, nullable). No default values, no backfill, no NOT NULL. `users` already carries `tenant_id` + its RLS policy (rule 1/2); these are additive nullable columns on an existing RLS-protected table, so no NEW policy or isolation surface is created - but the migration must not weaken the existing `users` RLS. Update `packages/db/src/schema.ts` to match.
2. **Service layer:** extend `StaffMember` + `listStaff()` to carry `phone` + `jobTitle`; extend `editStaff()` (and its action `editStaffAction`) to accept and persist both (tenant-scoped, audited per rule 6). `inviteStaff` may optionally accept them but is NOT required to (owner fills them post-invite). PII note: a phone number is PII - never log its value (rule 7); audit records the fact of the change, not the number.
3. **Administracao > Equipa UI:** surface **phone** + **job title** as editable fields in `StaffManageModal.tsx` (empty when null) and show them in the `page.tsx` list where they fit (e.g. job title beside/under the role, phone as an added column or in the row detail - keep the table readable; a new column is fine). Reuse the `admin-ui.ts` input classes + UI-STYLE.md.
4. **Identity render (where sensible):** where a therapist's professional identity renders and a title reads naturally, surface `job_title` (e.g. under the role label in the equipa row, or on `/perfil` as a read-only line). Do NOT rework the shell `UserAreaCluster` contract or add a `users`-row fetch to the shell just for this; a title on the equipa surfaces + `/perfil` is sufficient. Phone is an admin/contact field, not a shell chrome field.
5. **Empty by design:** ship both fields NULL for every existing staff row. No seed values, no owner data transcribed here. The owner enters phone + job title manually in Equipa after merge.
6. **i18n:** pt-PT + en for the two new labels/help strings (both files; JSON.parse both in the gate). Suggested keys `admin.staff.phoneLabel` / `admin.staff.jobTitleLabel` (recon the existing `admin.staff.*` namespace and match its style).

## Field 2. Ordered steps
1. **A0 isolation guard:** fetch origin; `git worktree add ../osteojp-w8-02-staff-phone-job-title origin/main -b osteojp-w8-02-staff-phone-job-title`; assert toplevel + clean tree + HEAD == `origin/main` tip. HALT (Field 6) if any fails.
2. **RECON, report first:** confirm the `users` columns (no phone, no job_title), the exact next migration number (fetch + list both migration dirs), the `editStaff`/`editStaffAction`/`StaffManageModal` seam, and the `admin.staff.*` i18n namespace. Paste findings.
3. **Migration `0036`:** author it in BOTH `packages/db/migrations/` and `supabase/migrations/` at the same number, regenerate/update the drizzle snapshot, update `schema.ts`. Two nullable columns, no backfill.
4. **Service layer + actions:** extend `StaffMember`, `listStaff`, `editStaff`, `editStaffAction` to carry + persist phone + jobTitle; audited; phone value never logged.
5. **UI:** editable phone + job title in `StaffManageModal`; surface both in the `page.tsx` list; surface job title on the identity render point(s) where sensible. Empty when null.
6. **Tests:** unit test that `editStaff` persists + returns both fields tenant-scoped and writes an audit row; a test that `job_title` is independent of the auth role (setting it does not change `roleSlug`/capabilities); RLS isolation stays green; component test that the modal shows + submits the two fields.
7. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (incl. RLS isolation), `pnpm build`, `pnpm test:e2e` (edit a DISPOSABLE staff member's phone + job title in Equipa, reload, values persist). JSON.parse both i18n files in the gate.
8. **Live-apply evidence (OWNER-MERGE):** apply `0036` to the live DB, paste the applied-migration evidence (the new columns present, PII-free), THEN the owner merges. Fetch-and-fast-forward before the live-DB operation; one migration in flight.

## Field 3. Definition of done (machine-verifiable)
- **Migration PROOF:** `0036` present in BOTH `packages/db/migrations/` and `supabase/migrations/` (same number) + snapshot updated; `git diff --name-only origin/main` lists them. Paste it. NO `.github/workflows/` file in the diff.
- **Schema PROOF:** `users` now has nullable `phone` + `job_title`; paste the schema diff (columns nullable, no NOT NULL, no default backfill).
- **Persist PROOF:** the `editStaff` self/tenant-scoped persist + audit test passes; paste it (never print a real phone value; use a synthetic number).
- **Role-independence PROOF:** setting `job_title` does not alter `roleSlug` or capabilities; paste the test.
- **UI PROOF (E2E):** a disposable staff member's phone + job title are edited in Equipa and persist across reload; paste it.
- **Empty-by-design PROOF:** existing rows have NULL phone + NULL job_title after the migration (no backfill); paste a count/`is null` check.
- **Live-apply PROOF (OWNER-MERGE):** the applied-migration evidence on the live DB (columns present), PII-free, pasted BEFORE the owner merges.
- **Suite counts** with all gates green.

## Field 4. Verification (paste evidence)
The recon report, the migration diff (both dirs + snapshot), the schema diff, the persist + role-independence tests, the Equipa edit E2E, the empty-by-design check, the live-apply evidence, suite counts, preview URL, PR number.

## Field 5. Restrictions and scope boundary
- **A0 worktree isolation** off fresh `origin/main`. **One migration in flight** (W8-02 is the only Wave 08 migration until it merges; W8-01a's migration follows AFTER this merges). **Fetch-and-fast-forward before any live-DB operation.**
- **Two nullable columns only.** No NOT NULL, no default, no backfill, no values transcribed. Owner enters data by hand post-merge.
- **`job_title` is a display field, never a permission role.** Do not couple it to `roleId`/capabilities.
- **DB access only through `packages/db`.** No raw SQL in app code. Audit every mutation (rule 6). Phone is PII - never log the value (rule 7).
- **Do not rework the shell `UserAreaCluster` contract** or add a users-row fetch to the shell; surface job title on the equipa/`/perfil` surfaces instead.
- pt-PT i18n (both files, keep-both on rebase, JSON.parse both in the gate); no emoji; UI-STYLE.md. **Never force-push / `--admin`.** Plain hyphens only. **SYNTHETIC-DATA-ONLY for verify.**
- **Standing test-data rule (Wave 08):** never run destructive QA against patient **Maria Joao Silva** (`triboimax635+maria@gmail.com`); use **disposable test patients only**; the reference therapist for tests is **Tiago Reis**.

## Field 6. Halt loud if (halt file to `~/osteojp-mailbox/escalations` + osascript, then stop; product/scope to `docs/design/QUESTIONS.md` with a recommended default)
- The A0 guard fails (not toplevel, dirty tree, or HEAD != `origin/main` tip).
- Recon finds a phone or job_title column already exists on `users` (contrary to authoring) - HALT with the finding; do not add a duplicate.
- Adding the columns cannot be done without altering the existing `users` RLS policy or a NOT NULL/backfill - HALT (this loop is additive-nullable only).
- A second migration would be needed (this loop must be ONE migration) - HALT and re-scope.
- The live-apply step cannot run (DB access blocked / credentials only the owner holds) - HALT with the exact blocker; the owner applies + merges.

## Field 7. Report back
The recon report, the migration diff (both dirs + snapshot), the schema diff, the persist + role-independence tests, the Equipa edit E2E, the empty-by-design check, the live-apply evidence, suite counts, PR number.

## Merge policy (embed, Wave 08 Dados e KPI)
- **W8-02 is OWNER-MERGE (migration loop).** All required checks green (DB-gated tests, Lint+typecheck+test, Playwright E2E) AND all three Vercel deploys (osteojp-api, osteojp-platform, osteojp-portal) green, read from the checks API NOT the banner, is NECESSARY. Additionally, the `0036` **live-apply evidence must be pasted before the owner merges**. GREEN NEVER self-merges a migration loop.
- **One migration in flight:** W8-02 (`0036`) is the only Wave 08 migration until it merges; W8-01a's migration (`0037`) starts only after this is merged and `origin/main` is fast-forwarded. Never stacked, strict sequence, fresh `origin/main` after each merge.
- Workflow files are NEVER touched. JSON.parse both i18n files in every gate. HALT-LOUD on scope/product/data/reality mismatch; any immutability-bypass claim escalates instantly.
