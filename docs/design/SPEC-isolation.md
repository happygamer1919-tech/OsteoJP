# SPEC-isolation - Per-person access isolation (Wave 10 Dados Reais e Isolamento)

> Loop: `docs/loops/wave-10/W10-03-access-isolation-spec.md`. Authored 2026-07-21 (W10-03), grounded in a READ-ONLY inspection of `packages/auth` + the staff surfaces on `origin/main` (@ 787a598, head 0037). This is a SPEC, not code. It ends in the OPEN QUESTIONS the owner rules on; **W10-04 implements ONLY the matrix the owner approves.** No data was read from the cloud (real-data-only after W10-02); all facts are from source.

## 0. Goal (owner brief 2026-07-20)

The clinic starts real usage, so lock the platform down per-person: **a therapist logs in and sees only themselves, their own patients, their own location, with no location or therapist switching. Only `admin` and `owner` keep cross-visibility.** Isolation is a NARROWING layer; it never widens anything. `tenant_id` stays JWT-only; RLS stays fail-closed.

## 1. Role model (grounded in `packages/auth`)

- **Roles** (`packages/auth/permissions.ts:10`): `ROLES = ["owner", "admin", "therapist", "reception"]`. The fourth role is **`reception`** (not "receptionist"/"staff"). `owner` is distinct from `admin` (different capability sets; only `owner` may grant the `owner` role, `permissions.ts:178`).
- **JWT claim** is **`user_role`** (a text slug; `role` is reserved by Supabase for `SET ROLE`), values exactly `owner|admin|therapist|reception`, validated by `parseRole` and read from the VERIFIED claims by `getRequestContext()` (`apps/web/lib/auth/context.ts:24-40`), which returns `null` on any missing/invalid `tenant_id`/`user_role`/`sub` (fail-closed). RLS reads the same slug via `public.jwt_role()` (`0001_rls.sql:39`), tenancy via `public.jwt_tenant_id()` (`:30`).
- **Capability grid is DATA** (`permissions.ts:89-154`): `PERMISSIONS: Record<Role, ReadonlySet<Capability>>` over 26 capabilities (`permissions.ts:26-58`), checked by `can(role, cap)` (`:156`) and enforced by `assertCan(role, cap)` throwing `ForbiddenError` (`packages/auth/guard.ts:27`). **This grid says which VERBS a role may perform, not WHICH ROWS it sees.** Per-person isolation is a DATA-SCOPE layer ON TOP of the grid, not a new capability set.
  - **owner** = ALL capabilities.
  - **admin** = full operational + `clinical_records:read` (no author/review/sign), `users:manage`, `settings:manage`, `audit_log:read`; NO `roles:manage`, NO `patients:recover`, NO `statistics:read`.
  - **therapist** = `patients:read/write`, `appointments:read/write`, `clinical_records:read/author/review/sign`, `services:read`, `locations:read`, `invoices:read`. NO delete, settings, user/role admin, or statistics.
  - **reception** = `patients:read/write`, `appointments:read/write/delete`, `services:read`, `locations:read`, `invoices:read/issue`. **NO `clinical_records` at all** (matches the RLS denial).
- **Patients are a SEPARATE trust domain** (`role = 'patient'`, `packages/auth/patient.ts`), not a staff `Role`. The patient portal (`apps/portal`) is out of scope for this matrix and unchanged.

### What therapist self-scope exists TODAY (the gap this spec fills)

- **Appointment-practitioner scope, on TWO surfaces only:** `lockTherapist = actor.role === "therapist"` forces `practitionerId = actor.userId` into `listAppointments` on the **agenda** (`apps/web/app/agenda/page.tsx:58-60`) and **marcacoes** (`apps/web/app/marcacoes/page.tsx:94-96`).
- **Everything else is tenant-wide for a therapist:** the **patients list** (`apps/web/lib/patients/queries.ts:listPatients` - `assertCan("patients:read")` + `activePatientsOnly`, NOT therapist-scoped) and **patient detail** (`apps/web/app/patients/[id]/page.tsx:97` `getPatient`, tenant/role scoped, not therapist-scoped); **clinical records RLS** grants a therapist read across the WHOLE tenant with an explicit standing TODO (`0001_rls.sql:174-175`: "therapist -> all in-tenant. TODO v0.1: tighten to patients-they-treat once user_locations / appointment scoping exists"). The spec fills exactly this gap.
- **"Their location" is DERIVED** from `availability_templates` (`getTherapistLocationIds` / `listTherapistLocationAssignments`, `apps/web/lib/scheduling/therapist-locations.ts:20,55`) - there is NO `therapist_locations` table.
- **"Their patients" has NO data model** (critical): no `assigned_therapist`/`primary_therapist`/`treating` column on `patients` (`schema.ts:431-492`; the only staff FK is `created_by`, PROVENANCE not assignment). Derivable candidate: patients with an appointment where `practitioner_id = actor.userId` (index `appointments_practitioner_start_idx` on `(practitioner_id, starts_at)` exists, `schema.ts:609`; secondary `practitioner_2_id` `:567` if co-treatment counts). **Whether to derive-from-appointments or add an explicit assignment column is OPEN QUESTION Q-W10-03-2 - not self-decided.**

## 2. Capability / visibility MATRIX (surfaces x roles)

Cell vocabulary (fixed): **`no-access`** (route/query denied) / **`own-only`** (only the actor's own rows: own appointments + own patients) / **`location`** (all rows at the actor's own location(s), derived from `availability_templates`) / **`tenant`** (all rows in the tenant). Therapist cells marked `own-only`/`location` are the NET-NEW narrowing W10-04 builds; every other cell is the current behaviour (no change). Reception and admin therapist-cells depend on the owner rulings (Q-W10-03-3, Q-W10-03-5) - shown as the RECOMMENDED DEFAULT with the open question noted.

| Surface (route) | owner | admin | therapist (NEW) | reception |
|---|---|---|---|---|
| **Agenda** (`/agenda`) | tenant | tenant | **own-only** (already `lockTherapist` on practitioner; + lose location switch) | **location** (default Q-W10-03-3) |
| **Marcacoes** (`/marcacoes`) | tenant | tenant | **own-only** (already `lockTherapist`; + lose location switch) | **location** (default Q-W10-03-3) |
| **Patients list** (`/patients`) | tenant | tenant | **own-only** (NEW: derive "their patients", Q-W10-03-2) | **location** (default Q-W10-03-3) |
| **Patient detail** (`/patients/[id]`) | tenant | tenant | **own-only** (NEW: 404/forbid a non-own patient) | **location** (default) |
| **Fichas / clinical** (`/clinical`, `/clinical/[id]`) | tenant (read; admin no author) | tenant (read only) | **own-only** (NEW: tighten the RLS TODO + query scope to patients-they-treat) | **no-access** (unchanged; reception has no `clinical_records`) |
| **Estatisticas** (`/estatisticas` + `painel` + `indicadores`) | tenant | no-access | no-access (unchanged; `statistics:read` owner-only, redirect) | no-access |
| **Equipa / staff** (`/admin/staff`) | tenant | tenant | no-access (no `users:manage`) | no-access |
| **Servicos** (`/admin/services`) | tenant | tenant | read-only catalog (`services:read`), no admin | read-only catalog, no admin |
| **Localizacoes** (`/admin/locations`) | tenant | tenant | no-access (`locations:write` absent) | no-access |
| **Definicoes** (`/admin/settings`) | tenant | tenant | no-access | no-access |
| **Pacientes eliminados** (`patients:recover`) | tenant | no-access | no-access | no-access |
| **Faturacao** (`/invoicing`) | tenant | tenant | read-only (`invoices:read`) | **location** issue (default Q-W10-03-3) / tenant today |
| **Acoes destrutivas** (password block on `/patients/[id]`) | tenant (`settings:manage`) | tenant (`settings:manage`) | no-access | no-access |
| **Portal** (`apps/portal`) | out of scope (separate trust domain) | out of scope | out of scope | out of scope |

**Reading the therapist column:** a therapist sees ONLY their own agenda/marcacoes (already true on the practitioner axis), ONLY their own patients + those patients' fichas (NEW), their own location (NEW - loses the location switch), read-only catalog, no admin/statistics/destructive surfaces. **owner and admin keep tenant-wide cross-visibility** (Q-W10-03-5/6 confirm admin stays global).

## 3. Enforcement plan (SERVER-SIDE FIRST; RLS defense-in-depth; nothing widened)

Per CLAUDE.md rule "server-side check in every API route + RLS as defense-in-depth". Every change is a NARROWING predicate; no existing RLS policy is relaxed; `tenant_id` stays JWT-only.

1. **Agenda + marcacoes (extend the existing path):** `lockTherapist` already forces `practitionerId = actor.userId` (`agenda/page.tsx:58-60`, `marcacoes/page.tsx:94-96`). ADD: for the therapist role, also force the location to the therapist's derived location(s) (`getTherapistLocationIds`) and DROP the location selector (see §4). Net-new predicate only; the practitioner lock is unchanged.
2. **Patients list + detail (NEW server scope):** `listPatients`/`searchPatients` (`apps/web/lib/patients/queries.ts:100,152`) and `getPatient` (`patients/[id]/page.tsx:97`) gain a therapist-only NARROWING predicate implementing the approved "their patients" definition (default Q-W10-03-2: `EXISTS (appointments a WHERE a.patient_id = patients.id AND a.practitioner_id = ctx.userId)` [+ `practitioner_2_id` if co-treatment counts], using `appointments_practitioner_start_idx`). Patient detail forbids/404s a patient outside the therapist's set. `assertCan("patients:read")` stays.
3. **Fichas / clinical (NEW server scope + RLS tighten):** scope the clinical list/detail queries to patients-they-treat for the therapist role, and tighten the standing RLS TODO (`0001_rls.sql:174-175`) from "therapist -> all in-tenant" to patients-they-treat. **This RLS change only NARROWS** (adds an `EXISTS(... practitioner_id = auth.uid())` predicate to the therapist branch); it never widens. Whether the tighten is expressible with the current model or needs a schema addition is set by Q-W10-03-2 (derive-from-appointments = migration-free; explicit assignment column = migration-gated `0038`).
4. **Location scope** reuses `getTherapistLocationIds`/`listTherapistLocationAssignments` (`therapist-locations.ts`) - no new `therapist_locations` table unless the owner mandates one (migration-gated).
5. **Reception (default Q-W10-03-3):** if the owner rules reception is location-scoped, add the same location predicate (derived from `availability_templates`) to reception's patients/appointments/invoicing queries, therapist-agnostic; clinical stays `no-access` (unchanged). If the owner keeps reception tenant-wide, no change.
6. **Capability checks stay** (`assertCan`); the isolation layer adds row-scope, it does not add or remove capabilities (unless the owner's "their patients" ruling mandates a net-new capability/column, Q-W10-03-2).
7. **RLS posture:** fail-closed, tenant-keyed on `jwt_tenant_id()` (`0001_rls.sql:30-45`); the ONLY current per-user (`auth.uid()`) policy anywhere is `quick_notes_own_row` (`0018:44-48`), so **per-therapist RLS on patients/appointments/records is NET-NEW**. Server-side query scoping is PRIMARY; RLS is defense-in-depth. **Any instinct to relax/widen a policy is escalated in W10-04, never self-authorized.**

## 4. UI consequences

- **Therapist loses BOTH selectors entirely on the agenda** (`apps/web/app/agenda/agenda-view.tsx`): the **therapist** selector (`:194`) is ALREADY gated by `{!lockTherapist && ...}`; the **location** selector (`:211`, "Todas as localizacoes") is **NOT** gated today - W10-04 adds a NEW gate so the therapist role renders NEITHER selector. The same `lockTherapist` prop exists in `marcacoes-view.tsx` and gets the same location-selector gate.
- No other role's UI changes on the default rulings (owner/admin keep both selectors; reception's selector treatment follows Q-W10-03-3).
- pt-PT for any copy W10-04 adds (both i18n files, JSON.parse both). No new nav items; isolation only hides/scopes.

## 5. OPEN QUESTIONS (owner rules before W10-04; already filed in `docs/design/QUESTIONS.md`, Wave 10 isolation batch)

These are filed as **Q-W10-03-1 .. Q-W10-03-7** (QUESTIONS.md, "W10-03 access-isolation batch", opened 2026-07-20 at authoring); restated here with recommended defaults so the matrix approval is self-contained. **None is self-decided.**

- **Q-W10-03-1 (Rodica's role class):** which of owner/admin/therapist/reception is Rodica, and does isolation apply to her? She coordinates the CB clinic (reads like location-ops, not a single clinician). **Default:** the owner assigns her role explicitly; make NO silent change until ruled. If she should see all CB activity, `admin` (or a location-scoped admin per Q-W10-03-5) fits; if she treats patients, she is isolated like any therapist.
- **Q-W10-03-2 ("their patients" definition):** patients with ANY appointment with the therapist (derive from `practitioner_id`, incl. secondary `practitioner_2_id`?) vs an explicit assignment column. **Default:** derive-from-appointments (migration-free, index exists). An explicit assignment column is net-new schema (migration-gated) - only if the owner wants a therapist to own patients they have not yet seen, or to NOT see a patient they treated once. **This ruling sets W10-04's migration disposition.**
- **Q-W10-03-3 (reception scope):** does reception see all therapists at their own location, or stay tenant-wide? Reception books across therapists, so full therapist-isolation would break their job. **Default:** reception is LOCATION-scoped, therapist-agnostic (own location(s) via `availability_templates`), clinical still out of reach. Confirm location-scoped (default) vs unchanged tenant-wide.
- **Q-W10-03-4 (coverage / substitution):** how does a therapist covering a colleague gain visibility? **Default:** visibility follows appointments - once the covering therapist has an appointment with the patient (primary or secondary), the derive-from-appointments rule makes that patient visible automatically; no standing cross-visibility, no special "coverage mode". Confirm sufficient, or whether an explicit temporary-delegation mechanism is wanted (larger scope).
- **Q-W10-03-5 (admin scope):** are admins location-scoped or global? **Default:** `admin` stays GLOBAL (tenant-wide across all locations), matching `owner`; only `therapist` (and reception per Q-W10-03-3) is scoped. Location-scoped admin is a net-new per-admin location model and changes the matrix.
- **Q-W10-03-6 (owner/admin cross-visibility confirm):** the brief says "only admin and owner keep cross-visibility". **Default:** confirmed as-is - `owner` = all, `admin` = full operational visibility (`clinical_records:read` only, unchanged); neither narrowed this wave.
- **Q-W10-03-7 (estatisticas):** does isolation change what a therapist sees in estatisticas? It is already owner-only (`statistics:read`, redirect). **Default:** no change; no therapist-scoped statistics surface this wave (that would be a new build).

## 6. W10-04 disposition (set by the approved matrix)

- **Migration-free GREEN self-merge** if the approved matrix is expressible with the existing model (default: derive "their patients" from `appointments.practitioner_id`, gate the location selector, add per-surface query scoping, tighten the therapist RLS branch with an `EXISTS` predicate).
- **Migration-gated OWNER-MERGE** (`0038`, live-apply verified) if the matrix mandates schema (an explicit patient-assignment column, a role/capability column, a `therapist_locations` table, or per-therapist RLS rows). **Security-sensitive: the isolation only NARROWS; any instinct to relax/widen RLS escalates.** Negative isolation E2E (therapist A cannot read therapist B's patients or another location's agenda) is MANDATORY, on local synthetic data only (cloud is real-data-only post W10-02).

**HALT for owner matrix approval - W10-04 does not start until the owner approves this matrix and rules Q-W10-03-1 .. Q-W10-03-7.**
