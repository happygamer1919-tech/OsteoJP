# MIGRACAO plan v2 — ADDENDUM A (auth identity copy)

Addendum to `docs/recon/W11-03-migracao-plan-v2.md`. Closes a plan gap found at W11-04:
plan v2 migrated `public.users` (19) but **no `auth` rows**, so `auth.users` on NEW is empty
and no one can authenticate ("Não foi possível iniciar sessão"). This addendum copies the auth
identities for the migrated users. Same discipline as the config executor (dry-run default,
atomic, per-table count assertion, row-by-row fidelity, HALT-on-mismatch). **OLD read-only.**

- **Source (OLD):** `jaxmkwoxjcgzkwxgbayx` — read-only throughout. **Target (NEW):** `dfotoodqvmjhbdcxyaxf`.
- **Authorization:** runs under the standing W11-04 cutover (owner already repointed Production).
  Same owner-gated dry-run→commit protocol: **COMMIT only after owner pastes a green dry-run.**

## Scope (exactly this, nothing else)
Copy, for ONLY the identities whose `auth.users.id` matches one of the migrated
`public.users.id` (the 19), preserving UUIDs, emails, `encrypted_password` hashes, and
confirmation status:
1. `auth.users`  (the identity + password hash + confirmation state)
2. `auth.identities`  (the email-provider linkage; `user_id` ∈ the scoped set)

**NOT copied** (intentionally): `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`,
`auth.one_time_tokens`, SSO/SAML tables, and everything else in `auth`. Sessions/refresh tokens
are re-created on next login. If any migrated user uses **MFA**, their factor is NOT carried
(flag to owner — expected: none). No `public` rows are touched (config already migrated).

## auth-schema handling (differs from the config copy)
- **Generated columns are excluded from the insert** and left to compute: `auth.users.confirmed_at`
  (`GENERATED ALWAYS`), `auth.identities.email` (generated from `identity_data`), plus any other
  `is_generated='ALWAYS'` column. Inserting into them would error.
- **Column reconciliation OLD↔NEW:** the executor introspects both projects' `auth` schema and
  copies only the intersection of non-generated columns present on BOTH (guards GoTrue version
  skew between OLD and the newer NEW project). Any NEW `NOT NULL`/no-default column missing from
  OLD → HALT (surfaced in pre-flight).
- **jsonb** (`raw_app_meta_data`, `raw_user_meta_data`, `identity_data`) cast `::jsonb`.
- **Permissions:** writing to `auth.*` needs a role with rights on the auth schema. The direct
  (session-pooler 5432) connection user for the project should have it; if the dry-run throws a
  permission error on `auth.*`, HALT and the owner runs it as the auth-admin / grants temporarily.
- Copy runs with `session_replication_role=replica` (no auth triggers fire; FK checks deferred),
  `auth.users` before `auth.identities`.

## Pre-flight (read-only, must pass before any write)
- NEW `auth.users` = 0 and `auth.identities` = 0 (empty target).
- OLD `public.users` = 19; **scoped `auth.users` count = N** (the subset of the 19 that have a real
  auth row — placeholder-email therapists have none; **report the real N**, expected < 19).
- 1:1: every scoped `auth.users.id` exists in NEW `public.users.id`.
- Report how many `public.users` have NO matching `auth.users` (the placeholders) — informational.
- Scoped `auth.identities` count = M (report).

## Copy + assertions (atomic on NEW)
- `auth.users`: insert scoped rows; assert `target == scoped source N`; row-by-row fidelity
  (every copied column incl. `encrypted_password`, compared not printed).
- `auth.identities`: insert scoped rows; assert `target == scoped source M`; fidelity.

## Post-checks
- NEW `auth.users` = N, `auth.identities` = M.
- **Owner check:** the `roles.slug='owner'` user's `public.users.id` is present in NEW `auth.users`
  with a non-null email matching OLD (same UUID). Report owner-present = true/false (email not printed).
- `custom_access_token_hook` function still present; immutability trigger still ENABLED.
- OLD untouched: anchor still `2026-07-22T20:22:20.097694Z` (verified by the standing W11-04 check).

## Execution protocol
1. GREEN hands owner the **dry-run command** (rolls back, zero risk).
2. Owner runs it, pastes output. GREEN confirms green (N/M correct, fidelity pass, owner present).
3. Only then GREEN hands the **COMMIT=1** command; owner runs it; GREEN verifies post-commit
   (owner logs in on NEW to confirm auth works end-to-end — the real §4 login check, finally).
4. Evidence → `docs/recon/W11-03-addendum-A-auth-evidence.md`; owner-merge PR.

**Rollback:** OLD untouched. NEW auth copy is additive into an empty auth schema; if wrong, truncate
NEW `auth.identities` then `auth.users` (owner-confirmable) and re-run, or repoint Production to OLD.
