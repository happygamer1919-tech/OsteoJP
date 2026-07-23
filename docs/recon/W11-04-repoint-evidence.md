# W11-04 — Production repoint evidence (cutover to NEW)

Cutover of Production (osteojp-platform, osteojp-api, osteojp-portal) from OLD
(`jaxmkwoxjcgzkwxgbayx`) to NEW (`dfotoodqvmjhbdcxyaxf`). Owner performed the Vercel env swaps +
redeploys; GREEN verified read-only. OLD stays untouched as the rollback (frozen at anchor
`2026-07-22T20:22:20.097694Z`).

> Process note: plan v2 §4 mandated a **Preview** smoke before any Production repoint. Production
> was repointed directly (owner's call), so the smoke was performed on Production instead. Two
> connection incidents surfaced there and were resolved (below).

## INCIDENT 1 — auth (see the addendum evidence)
Login failed because `auth` was never migrated, then failed again on a jsonb double-encode.
Both resolved. Detail: `docs/recon/W11-03-addendum-A-auth-evidence.md`.

## INCIDENT 2 — DATABASE_URL: dedicated vs shared pooler host
**Symptom:** login worked, but every data page failed — dashboard "Sem dados", agenda
"Não foi possível carregar o painel", `/admin/working-hours` 500 (Server Component render),
navigation dead.

**Diagnosis (browser + Vercel runtime logs, read-only):**
- The failures are **server-side** — `.rsc` Server Component data fetches; zero client API calls.
  Login was unaffected because GoTrue uses Supabase's own managed DB connection, not the app's.
- Vercel runtime errors: `getaddrinfo ENOTFOUND db.dfotoodqvmjhbdcxyaxf.supabase.co` (×25) and,
  on an earlier deploy, `connect ENETUNREACH <IPv6>:6543`.
- Repo audit: `packages/db/src/client.ts` reads **only** `process.env.DATABASE_URL`; no code
  derives that host; no `POSTGRES_URL`/`SUPABASE_DB_URL` reads anywhere.
- Vercel env enumeration: a single `DATABASE_URL` / `DATABASE_URL_DIRECT` (both Sensitive),
  **no integration-injected `POSTGRES_*` vars, no duplicate**. So nothing overrides it.

**Root cause:** `DATABASE_URL` held the **dedicated/direct** host `db.<ref>.supabase.co`
(Supabase "Direct connection"), which is **IPv6-only** (no IPv4 add-on on this project) and
therefore unreachable / unresolvable from Vercel's serverless runtime. Because `DATABASE_URL` is
Sensitive (unviewable after save), the value could not be re-verified by eye; the runtime was the
ground truth. Tell-tale: Direct = user `postgres` @ `db.<ref>.supabase.co`; Shared pooler =
user `postgres.<ref>` @ `aws-0-eu-central-1.pooler.supabase.com`.

**Resolution:** owner rebuilt `DATABASE_URL` (transaction pooler, **6543**) and
`DATABASE_URL_DIRECT` (session pooler, **5432**) on the **shared pooler host**
`aws-0-eu-central-1.pooler.supabase.com` for platform + api, and redeployed cache-off.

## Production smoke (GREEN, browser, post-fix — all green)
| Check | Result |
|---|---|
| Login (real JWT via auth hook) | ✅ owner logged in |
| Dashboard | ✅ real data (Pacientes ativos 0, Receita 0,00 €), weekly summary renders |
| Agenda | ✅ 18 non-reception therapists + 2 locations (CB, LV), 0 marcações, week grid |
| /admin/working-hours | ✅ renders migrated schedules (was 500) — config-visible |
| Pacientes | ✅ empty list, renders |
| Console errors | ✅ none on any page |
| Traffic to OLD | ✅ none — zero client requests to OLD host; OLD anchor unchanged |

## OLD frozen (rollback intact)
Read-only re-check at close: `max(audit_log.created_at)` = `2026-07-22T20:22:20.097694Z`,
audit_log total 700, newest write `patient.hard_delete` pn=120. Zero traffic to OLD across the
entire cutover. Rollback = repoint Vercel envs back to OLD (still the untouched system of record).

**W11-04 result: GREEN.** Production is live on NEW across platform + api (+ portal for
URL/anon). Immutability trigger enabled on NEW; head 0037. Next: W11-05 (hardening + close) after
the owner declares cutover final.
