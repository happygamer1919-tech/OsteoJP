# Loop 0023 - Therapist-service mapping (greenfield)

Status: READY (gate: 0022 DONE, met). MIG lane. Green terminal. One migration in flight at a time - confirm 0022 is on main and no other migration is open before dispatch.

## Field 1. Scope and ground truth
Create a tenant-scoped relation mapping therapists (users with role therapist) to the services they deliver, so selecting a therapist in the booking flow resolves the eligible service(s). This is greenfield: the 2026-06-30 audit confirmed no therapist-to-service relation exists (no join table, array column, or FK), and there is no dedicated therapist table (a therapist is a users row with role therapist). This is migration 0023, sequential after 0022.
Authority: docs/design/wave-01/SPEC-appointments.md (therapist-service mapping section) and docs/design/STATE.md. Before writing, confirm against STATE.md that no such relation was added since the audit, confirm 0022 is the latest on main, and confirm the exact table/column names for users and services and the tenant_id convention used by sibling tenant-scoped tables.

## Field 2. Ordered steps
1. Fresh-main sync: git checkout main, git pull origin main, git checkout -b osteojp-therapist-service-mapping. Worktree fallback if main checked out elsewhere.
2. Read-only confirm: read SPEC-appointments.md and STATE.md. Run the Field 6 halt checks before writing. If any is true, stop and report.
3. Update the Drizzle schema in packages/db to add the new relation. Follow the existing migration convention (inspect 0021/0022 authoring style, match it - ADD ... IF NOT EXISTS idiom, journal entry).
4. Author migration 0023 creating the join table. Shape (confirm against SPEC; SPEC wins if it differs): id (pk), tenant_id (not null), therapist_user_id (FK to users, not null), service_id (FK to services, not null), created_at (timestamptz default now()), with a unique constraint on (tenant_id, therapist_user_id, service_id) to prevent duplicates. Match the FK and tenant_id type conventions used by sibling tenant-scoped tables. Do NOT modify users or services tables.
5. RLS: the new table needs fail-closed, tenant-isolated policies, tenant_id checked against the JWT claim (claim key user_role, tenant derived from JWT never payload), copying the pattern of an existing tenant-scoped table including any SECURITY DEFINER helper already in use. Default mutability per SPEC; if SPEC is silent, allow SELECT/INSERT/DELETE for tenant members (a mapping is add/remove, not edit-in-place), no UPDATE. Record the mutability choice in DECISIONS.md if SPEC is silent.
6. GENERATE THE SUPABASE MIRROR. After authoring the Drizzle migration, run the repo's supabase mirror sync (node scripts/sync-supabase-migrations.mjs, or the package.json named script) so supabase/migrations/0023_*.sql is created. Run the --check variant to confirm sync passes. THIS STEP IS MANDATORY - omitting it fails DB-gated tests and supabase-branch-sync in CI (the 0022 lesson).
7. Apply 0023 to dev via DATABASE_URL_DIRECT (credentials live in packages/db/.env, the file the tooling reads - not repo-root .env, not .env.local). Confirm clean apply.
8. Run the db suite. Must reach the DB (no hollow-skip). Green required.
9. Run verification A-E, paste raw output.
10. Open a PR per template. Do NOT merge (Ivan merges migration PRs).

## Field 3. Definition of done (machine-verifiable)
- Drizzle migration 0023 exists, sequential after 0022, journal registered once.
- Supabase mirror supabase/migrations/0023_*.sql exists and sync --check passes.
- Applies to dev, exit 0.
- db suite reaches DB, exit 0, real (non-hollow) pass count.
- The join table exists with the specified columns, both FKs, and the unique constraint.
- The table has relrowsecurity true and fail-closed tenant SELECT/INSERT policies present.
- users and services tables unchanged.
- No merge performed.

## Field 4. Verification (paste raw output)
A. SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='<join_table_name>' ORDER BY ordinal_position;
B. SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.<join_table_name>'::regclass;  (expect the two FKs and the unique constraint)
C. SELECT relname, relrowsecurity FROM pg_class WHERE relname='<join_table_name>';
D. SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='<join_table_name>' ORDER BY policyname;
E. drizzle-kit migrate exit code + db suite summary line + sync --check result.

## Field 5. Restrictions and scope boundary
- Do NOT modify users or services tables.
- Do NOT skip the Supabase mirror generation (Field 2 step 6).
- Do NOT apply via prod-migrate or any prod credential. Dev only. Tempted toward prod = HALT.
- Do NOT merge the PR.
- Do NOT put credentials in any file, commit, or PR. packages/db/.env is gitignored, keep it uncommitted.
- Do NOT touch db-tests.yml or e2e.yml.
- One migration in flight. Do not start 0024.

## Field 6. Halt-loud protocol
- 0022 is not the latest migration on main, or another migration is in flight.
- A therapist-service relation already exists (audit said none; if present, stop and report).
- SPEC-appointments.md conflicts with the shape in Field 2 step 4. Follow SPEC, report the divergence.
- The users or services table/column names cannot be confirmed from STATE.md.
- The sibling tenant-scoped RLS pattern cannot be located to copy.
- The task appears to require editing db-tests.yml or e2e.yml.
Report the mismatch and wait. Do not improvise around it.

## Field 7. Report-back format
1. Branch/worktree and migration file paths (Drizzle + Supabase mirror).
2. Schema files changed.
3. Mutability decision and any DECISIONS.md entry.
4. Pasted verification A-E.
5. PR link.
6. Any halt: state the briefing-vs-reality mismatch and what you did not do.

Do NOT merge. Report for Ivan's merge.
