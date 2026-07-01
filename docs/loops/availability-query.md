# Loop - Availability query (read-only, migration-free)

Status: READY. Non-migration code lane. Green terminal. No migration in flight required (this loop ships no schema change).

## Field 1. Scope and ground truth
Build a read-only availability query: given a therapist (a `users` row with role therapist) and a date or a week, return booked vs free intervals, tenant-scoped. Shared by three consumers: the new-appointment panel, the batch engine, and multi-therapist conflict reporting. Build once, consume three times.

Sources (both already exist, no schema change):
- `appointments` - booked time. Start = `starts_at`, end = `ends_at` (both `timestamptz`). Therapist FK = `practitioner_id` -> `users.id`. Status enum: `scheduled, confirmed, completed, cancelled, no_show`.
- `availability_templates` - working windows. Therapist FK = `user_id` -> `users.id`. `weekday smallint` 0=Sun..6=Sat (JS `Date.getDay()`). `start_time`/`end_time` are `time` columns in Lisbon wall-clock. `valid_from`/`valid_until` are `date` (nullable = open-ended). `is_active bool`. `location_id`.

tenant_id is derived from the JWT (via `runScoped`/`withTenantContext`), never from payload. No schema change, no migration, no Supabase mirror.

## Field 2. Ordered steps
1. Fresh-main sync: git checkout main, git pull, git checkout -b osteojp-availability-query (worktree fallback if main checked out elsewhere).
2. Read-only recon: confirm the real column names for appointment start/end and the therapist FK, and the `withTenantContext` helper, before writing. Report findings.
3. Implement a server-side function accepting `therapistId` and a date range (single day or week), deriving tenant_id from JWT, returning per day: working windows from `availability_templates` minus booked appointment intervals, yielding `booked[]` and `free[]` with start/end. Add a thin API route only if the panel needs one.
4. Exclude `cancelled` and `no_show` from booked (they do not block a slot). Count `scheduled`, `confirmed`, `completed` as booked.
5. Unit-test the interval math: overlap, adjacency, full-day-free, fully-booked, empty template.

## Field 3. Definition of done (machine-verifiable)
- Interval-math unit tests pass (paste count and pass line).
- Typecheck and lint clean, CI green.
- `git diff --name-only` shows no file under `packages/db/migrations/` or `supabase/migrations/`.

## Field 4. Verification (paste evidence)
Recon output (real start/end and therapist FK column names), test summary line, `git diff --name-only` proving migration-free, CI status.

## Field 5. Restrictions and scope boundary
- Read-only. No schema change, no migration, no mirror. Do NOT generate a Supabase mirror.
- Do NOT modify `appointments` or `availability_templates` schema.
- Do NOT touch db-tests.yml or e2e.yml.
- tenant_id from JWT only, never from payload.

## Field 6. Halt loud if
- Real schema does not match assumptions (availability not in `availability_templates`, or start/end stored differently).
- Any interval case is ambiguous against real data.
- The task appears to need a schema change. Stop and report, do not improvise a migration.

## Field 7. Report-back format
Recon findings, function signature shipped, test count green, `git diff --name-only` proving migration-free, PR number.

Close: open a PR per template.
