# W11-03 Addendum A — auth identity copy: execution evidence + jsonb incident

Executed 2026-07-23 under the standing W11-04 cutover. Runbook:
`docs/recon/W11-03-migracao-plan-v2-addendum-A-auth.md`. Closes the plan gap where plan v2
migrated `public.users` (19) but no `auth` rows, so no one could authenticate on NEW
("Não foi possível iniciar sessão"). OLD (`jaxmkwoxjcgzkwxgbayx`) read-only throughout.

## What was copied
`auth.users` + `auth.identities` for exactly the identities matching the 19 migrated
`public.users` — UUIDs, emails, `encrypted_password` hashes, confirmation status preserved.
Nothing else from the `auth` schema.

| Table | before (NEW) | source (OLD, scoped) | after (NEW) | match |
|---|---|---|---|---|
| auth.users | 0 | 19 | 19 | ✓ |
| auth.identities | 0 | 19 | 19 | ✓ |

- Real identity count = **19** (all 19 staff had auth rows; `public_users_without_auth` = 0 —
  the placeholder-email therapists do have auth identities). Of OLD's 26 total `auth.users`,
  the other 7 are non-staff (patient-portal / old accounts) and correctly stayed behind.
- Method: single atomic transaction on NEW, `session_replication_role=replica`, generated
  columns excluded (`auth.users.confirmed_at`, `auth.identities.email`), OLD↔NEW column
  reconciliation, jsonb cast. Dry-run (rolled back) before commit. Owner login-critical fields
  verified identical OLD↔NEW; hook grant `auth_admin_execute=true` on both.

## INCIDENT: jsonb double-encode (introduced by the addendum copy, then repaired)
**Symptom:** after the auth copy, login still failed. Supabase Auth logs showed
`500 POST /token — Error finding user: sql: Scan error on column index 26, name "raw app meta
data": json: cannot unmarshal string`.

**Root cause:** the addendum's jsonb write path stringified values the driver had already
returned parsed, so three `auth` jsonb columns landed as jsonb **string scalars** instead of
**objects**. GoTrue cannot unmarshal a string where it expects an object → every login 500'd.
The count + fidelity checks did not catch it because the driver decodes one level on read-back,
so both sides matched as strings. **Blast radius (measured via `jsonb_typeof` OLD vs NEW):**

| Column | OLD | NEW (corrupted) |
|---|---|---|
| auth.users.raw_app_meta_data | object | string ×19 |
| auth.users.raw_user_meta_data | object | string ×19 |
| auth.identities.identity_data | object | string ×19 |

The **config migration jsonb was NOT affected** (`tenants.settings`, `form_templates.title/schema`
all `object` on NEW — the config path used a correct jsonb method). So only the 3 auth columns.

**Repair:** in-place un-double-encode on NEW — `col = (col #>> '{}')::jsonb WHERE
jsonb_typeof(col)='string'` — atomic, dry-run first, and **verified every one of the 19 rows
byte-identical to OLD** (canonical `::text`) before commit. Post-repair: all 3 columns `object`;
`jsonb_typeof` matches OLD; login succeeded.

**Lesson:** a cross-DB jsonb copy must assert `jsonb_typeof` parity (object-vs-string), not only
value equality — the driver's read-side decode hides a double-encode from a naive fidelity check.

## Post-repair verification (independent, read-only)
NEW `auth.users`=19, `auth.identities`=19, 1:1 with `public.users`, owner present, all 19
email-confirmed, `custom_access_token_hook` present. OLD untouched (anchor
`2026-07-22T20:22:20.097694Z`, audit 700, newest #120).
