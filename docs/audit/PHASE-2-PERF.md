# PHASE 2, PERFORMANCE AUDIT, AND THE RECUPERAÇÃO DEFECT

**Terminal:** BLUE (platform lane). **Base:** `origin/main` @ `831a4772`.
**Date:** 2026-08-30. Go-live: 2026-08-31.
**Branch:** `audit/phase-1-2-prelaunch`, local only, NOT pushed, NOT merged.
**Scale used for every measurement:** 8,400 patients, 41,000 appointments
(1,640 with a secondary patient), 35,720 completed, the owner's real volumes.

> **TASK 0 MERGED NOTHING, AND THAT IS THE INSTRUCTED OUTCOME.** The dominant
> cause is a missing index. The dispatch states that a `CREATE INDEX` through the
> Drizzle migration path counts as a migration file, so the exact statement is
> written on a card below and the owner applies it. No PR was opened.

---

## TASK 0, THE RECUPERAÇÃO DEFECT, DIAGNOSED TO THE LINE

### The single dominant cause

**`appointments.patient_2_id` has no index, and every clause behind
/recuperação filters on `(patient_id = X OR patient_2_id = X)`. An OR whose
second arm has no index cannot be answered by a BitmapOr, so Postgres
sequentially scans all 41,000 appointments, once per patient row, 13,881 times
per page load.**

The column was added by `packages/db/migrations/0032_secondary_participants.sql:30`
with a foreign key at `:32` and **no index**. Every other appointment access path
got one in `0001` (`appointments_patient_idx` on `patient_id`). The secondary
column never did.

### The query

`apps/web/app/recuperacao/page.tsx:107` runs both queries in `Promise.all`:

    const [candidates, postponements] = await Promise.all([
      listFollowupCandidates(ctx),
      listActivePostponements(ctx),
    ]);

`listFollowupCandidates` (`apps/web/lib/followup/queries.ts:243`) builds
`FROM patients WHERE <clause1> AND <clause2> AND <clause3>` with **no LIMIT**,
and selects two more correlated subqueries. All five expressions come from
`packages/db/src/followup-selection.ts` and every one of them carries the same
OR:

| Expression | File:line | Correlated OR |
|---|---|---|
| `followupLastAttendanceClause` | `followup-selection.ts:63` | `(done.patient_id = X OR done.patient_2_id = X)` |
| `followupNoFutureBookingClause` | `followup-selection.ts:80` | `(fut.patient_id = X OR fut.patient_2_id = X)` |
| `followupNotPostponedClause` | `followup-selection.ts:96` | (postponements only, indexed, fine) |
| `followupLastAttendanceSql` (SELECT) | `followup-selection.ts:198` | same OR **again** |
| `followupPractitionerSql` (SELECT) | `followup-selection.ts:214` | same OR **a third time** |

### The plan, measured, not inferred

Stock `postgres:16`, schema and index set copied exactly from the repository's
own migrations (`0001` + `0032` + `0067`), seeded to production scale, `ANALYZE`d,
warm cache. Clause text byte-for-byte from `followup-selection.ts`.

    Sort  (cost=26563626.42..26563628.72 rows=920) (actual time=14439.279..14439.384 rows=1558 loops=1)
      ->  Nested Loop Anti Join  (actual time=173.768..14438.890 rows=1558 loops=1)
            ->  Seq Scan on patients  (actual time=171.513..11227.630 rows=1585 loops=1)
                  Filter: (((SubPlan 3) >= ...) AND ((SubPlan 4) <= ...))
                  Rows Removed by Filter: 6815
                    ->  Aggregate  (actual time=1.028..1.028 rows=1 loops=8400)
                          ->  Seq Scan on appointments done_2  (actual time=0.136..1.027 rows=4 loops=8400)
                                Filter: ((status = 'completed') AND ((patient_id = patients.id) OR (patient_2_id = patients.id)))
                                Rows Removed by Filter: 40996

**`Seq Scan on appointments ... loops=8400`, and `Rows Removed by Filter: 40996`
on every one of those loops.** That single line is the defect. Counting all four
correlated subplans, one page load performs:

    8,400  seq scans   clause 1, lower bound of the BETWEEN
    2,365  seq scans   clause 1, upper bound
    1,558  seq scans   followupLastAttendanceSql in the SELECT list
    1,558  seq scans   followupPractitionerSql in the SELECT list
    ------
    13,881 sequential scans of a 41,000-row table, per page load

### The timing, before and after, same box, same data

Using the page's REAL window (`window.ts`: first day of the previous month →
7 days ago), which returns **1,320 rows**:

| State | Execution time |
|---|---|
| **BEFORE** (repository's current index set) | **17,962.890 ms** |
| **AFTER** (one index added) | **190.940 ms** (231.9 / 190.9 across runs) |

Cross-checked on a 90→21 day window: **14,449.862 ms → 176.7 / 177.5 / 180.3 ms**
over three runs. Planning time is unchanged at ~1 ms. The plan flips from
`Seq Scan on appointments` to `Bitmap Heap Scan` under a `BitmapOr` of
`appointments_patient_idx` and the new index.

**A 94x reduction. And it is 14 to 18 seconds on a warm local container with
everything in shared_buffers, production is a shared Supabase instance with a
cold cache and RLS on top.**

### Answering each item the dispatch asked me to check, in order

1. **The query computing each patient's most recent completed consultation**,
   `followupLastAttendanceClause` / `followupLastAttendanceSql`. It is a
   `max(done.starts_at)` correlated subquery, not a window function, and it is
   computed **twice per qualifying row** (once in the WHERE, once in the SELECT)
   because the two are separate expressions Postgres does not dedupe.
2. **Its plan against the real row counts**, `Seq Scan on appointments`,
   `loops=8400`, `Rows Removed by Filter: 40996`. Above.
3. **Does it scan appointments per patient or in one pass**, **PER PATIENT.**
   13,881 scans per load.
4. **Missing indexes on the columns it filters, joins and orders by**, one, and
   it is the whole defect: `appointments.patient_2_id`. `patient_id`,
   `starts_at`, `practitioner_id`, `tenant_id` and the postponements pair are
   all covered.
5. **Every column any RLS policy on those tables filters on**, see Task 3. The
   `patients_select` policy calls `patient_appt_at_viewer_location(id)`, whose
   body (`0047_patients_location_rls.sql:165`) carries **the identical
   unindexed OR**. Measured separately: `SELECT count(*) FROM patients WHERE
   patient_appt_at_viewer_location(id)` runs in **1,077.421 ms without the index
   and 36.255 ms with it**. The same one index fixes both.
6. **Does the page fetch everything with no pagination and hydrate thousands of
   rows client-side**, **YES, both.** `listFollowupCandidates` has no `LIMIT`
   and no `OFFSET`. `followup-list.tsx:1` is `"use client"` and receives every
   row; `:72` is `rows.map(...)`, and each row becomes a component with three
   `useState` hooks. At the measured 1,320 rows that is 1,320 stateful client
   components plus every patient's telephone number in the RSC payload. This is
   a real second-order cost but it is **not** the dominant one: the server query
   is 18 seconds before the browser receives a byte.
7. **Does a fetch run in a layout or block navigation**, **not in a layout**
   (`app/layout.tsx` and the route's own tree have no data fetch), **but it does
   block navigation**: `/recuperacao` has **no `loading.tsx`** and no Suspense
   boundary, so there is no streaming shell. The router waits for the whole
   18-second RSC response before painting anything.
8. **Does the therapist scope guard added this month run a per-row subquery**,
   **Yes, and it is a fourth correlated scan**, `followupOwnPatientClause`
   (`followup-selection.ts:181`), added under the 2026-08-27 owner ruling, with
   `ORDER BY done.starts_at DESC LIMIT 1` over the same unindexed OR. **But it is
   NOT the cause and must not be blamed:** it is appended only when
   `therapistScope(ctx)` is non-null, i.e. for the `therapist` role. The owner
   who reported the defect is the `owner` role, for whom `ownScope` is null and
   the clause is never added. The 18 seconds above were measured **without** it.
   It will make a therapist's load worse than an owner's, and the same index
   fixes it too.

### Why "the whole platform becomes unclickable", which is a separate mechanism

The slow query alone would make one page slow. Three things turn it into a
platform-wide freeze, and all three are load-bearing:

1. **`packages/db/src/client.ts:44`, `postgres(url, { prepare: false, max: 2, ... })`.
   Two connections per serverless instance.**
2. **`withTenantContext` (`packages/db/src/client.ts`) wraps every scoped read in
   an explicit `transaction()`**, so a connection is held for the query's entire
   duration, not just the statement.
3. **`page.tsx:107` runs both queries in `Promise.all`**, so one page load opens
   **two** transactions at once, **the instance's entire pool**, and holds both
   for ~18 seconds. Every other request routed to that instance waits on a
   connection until `connect_timeout: 10` fires.

And then the part that explains "about 30 minutes of use":

**`apps/web/lib/followup/actions.ts:101` and `:153` call
`revalidatePath("/recuperacao")`, and `followup-list.tsx:152` calls
`router.refresh()`.** Marking a patient contacted or postponing one re-runs the
entire 18-second query. The page's whole purpose is working down that list, so a
receptionist re-triggers the full-table churn on **every single row they touch**.
Thirty minutes of use is thirty minutes of back-to-back 18-second scans holding
both connections. That is precisely the symptom the owner reported, and it is not
a coincidence, it is the feature working as designed on top of a missing index.

### THE FIX, CARDED, NOT APPLIED

An index is a migration file. Per the dispatch I stop here. **The exact
statement, ready to be authored into the next free migration number (0068):**

```sql
-- PERF-01. appointments.patient_2_id has no index. Every /recuperacao clause
-- and the patients_select RLS helper patient_appt_at_viewer_location() filter
-- on (patient_id = X OR patient_2_id = X); with one arm unindexed Postgres
-- cannot BitmapOr and sequentially scans all 41,000 appointments, 13,881 times
-- per page load. Measured at production scale: 17,962 ms -> 191 ms.
--
-- PARTIAL and that is measured too, not assumed: only 1,640 of 41,000 rows
-- carry a secondary patient. The partial index is 32 kB against 632 kB for the
-- full one, gives an identical plan and identical timings (177 ms vs 177 ms),
-- and costs nothing on the 96% of inserts that leave the column NULL. The
-- predicate is safe because `patient_2_id = <non-null uuid>` implies NOT NULL,
-- so the planner can always use it for these lookups.
CREATE INDEX IF NOT EXISTS appointments_patient_2_idx
  ON public.appointments (patient_2_id)
  WHERE patient_2_id IS NOT NULL;
```

**Apply with `CREATE INDEX CONCURRENTLY` if it is run against production while
the clinic is working** (it cannot then be inside the migration transaction; it
is a separate, non-transactional statement). On 41,000 rows the blocking build
is well under a second, so a plain build during a quiet window is also fine.
Verify afterwards with:

```sql
EXPLAIN ANALYZE SELECT count(*) FROM appointments
 WHERE patient_id = '<any patient uuid>' OR patient_2_id = '<same uuid>';
-- expect: Bitmap Heap Scan under a BitmapOr. NOT Seq Scan.
```

---

## TASK 1, SERVER VERSUS CLIENT COMPONENTS

    apps/web      77 of 137 .tsx are "use client"   (56%)
    packages/ui   18 client components
    apps/portal    0 of 41                          (fully server-rendered)
    apps/admin     2 of 4
    apps/api       1 of 4

**No `next build` bundle report is included, and I am saying so rather than
estimating one.** A production build of four Next apps needs the real
environment (`withSentryConfig` reads `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT`) and I hold no credentials. Every number in this report is
measured; I will not print an invented payload table beside them. What static
analysis does establish:

- **`recharts` is the only heavy library reaching the browser**, in
  `apps/web/app/estatisticas/indicadores/kpi-charts.tsx`. It is correctly
  isolated to that one route and not imported from any shared layout, so it does
  not tax any other page.
- **`@sentry/nextjs` is imported in `apps/web/app/global-error.tsx`**, which is
  the documented pattern and is loaded only on an error boundary.
- **No `date-fns`, `lodash`, `moment`, `xlsx` or `framer-motion` anywhere.**
  Date handling is native `Intl` in `Europe/Lisbon`; icons are `lucide-react`
  (tree-shaken SVG). For a codebase this size that is unusually lean.
- `apps/portal`, the patient-facing app, is **100% server components**.

The 56% client share in `apps/web` is high, but it is a staff tool where almost
every screen is an editable form or an interactive agenda. I found no client
component doing work that obviously belongs on the server.

---

## TASK 2, DATA FETCHING

**This section is mostly clean, and the clean parts are load-bearing evidence
that the Recuperação defect is a missing index and not a systemic pattern.**

- **N+1: none found in a hot path.** The one place it would have appeared,
  loading each candidate's contact history, is already batched:
  `followup/queries.ts:337` collects the ids and issues **one** `inArray` query,
  with a comment saying exactly why. No `await` inside a `for` or `.map(async`
  over a query anywhere in `apps/web/lib` or `apps/api/lib`.
- **Sequential awaits: `Promise.all` is used in 29 places**, including the two
  Recuperação queries. Ironically that is what makes the freeze total rather
  than partial (both pool connections at once), but it is the right pattern and
  becomes right again once the query is fast.
- **Column narrowing: 4 unnarrowed `.select()` calls**, all in the patients
  domain, `patients/queries.ts:54` (single row, `.limit(1)`), `:126`, `:173`,
  and `patients/actions.ts:695`. `:126` is the paginated list, capped at 50 rows
  by default and 200 maximum, so the widest realistic read is 200 patient rows.
  Low impact; listed for completeness.
- **Fetches in layouts re-running per navigation: none.** No layout in
  `apps/web`, `apps/portal` or `apps/api` performs a data fetch.
- **Caching:** `unstable_cache` is used for stable reference data
  (`scheduling/data.ts:261` agenda reference, `:327` therapist location
  assignments). 15 routes carry `export const dynamic = "force-dynamic"`, every
  one with a written reason (auth landing, tokenised, signed webhook,
  per-request patient data). Nothing stable is being re-fetched needlessly.
- **The one real finding:** `revalidatePath("/recuperacao")` at
  `followup/actions.ts:101` and `:153` re-runs the unbounded query after every
  mutation. Correct today, ruinous while the query costs 18 seconds. See Task 0.

---

## TASK 3, DATABASE

### Missing indexes on the hot paths

| Path | Verdict |
|---|---|
| **recuperação** | **`appointments.patient_2_id` MISSING.** The defect. See Task 0. |
| **agenda** | Covered, `appointments_tenant_start_idx (tenant_id, starts_at)` and `appointments_tenant_location_start_idx (tenant_id, location_id, starts_at)`. |
| **patient list** | Covered, `patients_tenant_name_idx (tenant_id, full_name)` serves both the filter and the `ORDER BY asc(fullName)`; `listPatients` is paginated (default 50, max 200). |
| **patient ficha** | Covered, `appointments_patient_idx` for the primary side. **The secondary side is not**, so a ficha for a patient who has been a *second* participant hits the same seq scan. Same one index fixes it. |
| **booking** | Covered, `appointments_practitioner_start_idx (practitioner_id, starts_at)` serves the conflict window; `patient_followup_postponements_active_idx` is a partial index matching its predicate exactly. |

Full index set on `appointments` today: `appointments_tenant_idx`,
`appointments_tenant_start_idx`, `appointments_practitioner_start_idx`,
`appointments_patient_idx`, `appointments_tenant_location_start_idx`,
`appointments_booking_group_idx`, `appointments_batch_idx`,
`appointments_tenant_origin_idx`, `appointments_pack_instance_idx`. Nine
indexes, and the one column that needs a tenth is `patient_2_id`.

### Every RLS policy checked for per-row subqueries, with its verdict

**69 policies across 36 tables**, taking the latest definition of each after
every `DROP POLICY`. Verdict per policy: a call to `auth.uid()`,
`public.jwt_tenant_id()`, `public.jwt_role()` or
`public.viewer_has_location_assignment()` is **cached** when it is wrapped as
`(select ...)`, which makes Postgres evaluate it once as an InitPlan instead of
once per row.

    ok, every volatile call wrapped, or no volatile call        54
    UNWRAPPED auth/jwt call, re-evaluated per row               11
    CORRELATED per-row helper, takes a column, CANNOT be wrapped 4
    ----
    TOTAL                                                        69

**The 4 correlated ones, these are the ones the dispatch was asking about:**

| Policy | Table | Correlated helper(s) |
|---|---|---|
| `patients_select` | patients | `patient_appt_at_viewer_location(id)`, `patient_appt_treated_by_viewer(id)`, `location_in_viewer_scope(primary_location_id)` |
| `patients_update` | patients | same three |
| `patients_delete` | patients | same three |
| `appointments_rls` | appointments | `location_in_viewer_scope(location_id)` |

**These CANNOT be wrapped in a scalar `(select ...)` and it would be wrong to
try**, they take the row's own column as an argument, so they are genuinely
per-row by definition. Wrapping them would either fail to compile or, worse,
freeze one row's answer and apply it to every row, which is a security defect
dressed as an optimisation. **The correct fix for these is the index**, and it
is measured: `patient_appt_at_viewer_location` over all 8,400 patients runs in
**1,077.421 ms today and 36.255 ms with the index**, a 30x tax paid by every
location-assigned admin or reception user on every patients read.

`location_in_viewer_scope` is cheap by comparison: its body touches only
`staff_locations`, a table with one row per staff-location pair.

**The 11 unwrapped ones, a real but second-order finding:**

| Policy | Table | Unwrapped call |
|---|---|---|
| `action_token_consumptions_tenant_insert` | action_token_consumptions | `jwt_tenant_id` |
| `action_token_consumptions_tenant_select` | action_token_consumptions | `jwt_tenant_id` |
| `patient_audit_log_patient_insert` | patient_audit_log | `jwt_tenant_id` |
| `patient_audit_log_tenant_insert` | patient_audit_log | `jwt_tenant_id` |
| `patient_audit_log_tenant_select` | patient_audit_log | `jwt_tenant_id` |
| `patient_terms_acceptances_tenant_insert` | patient_terms_acceptances | `jwt_tenant_id`, `auth.uid` |
| `patient_terms_acceptances_tenant_select` | patient_terms_acceptances | `jwt_tenant_id` |
| `quick_notes_own_row` | quick_notes | `auth.uid` |
| `staff_notifications_own_select` | staff_notifications | `jwt_tenant_id`, `auth.uid` |
| `staff_notifications_own_update` | staff_notifications | `jwt_tenant_id`, `auth.uid` |
| `staff_notifications_tenant_insert` | staff_notifications | `jwt_tenant_id` |

Each is a one-token change (`jwt_tenant_id()` → `(select jwt_tenant_id())`) and
each saves one function call per scanned row. **None of them is on a large
table**, audit logs and token consumptions are append-mostly and read by narrow
filters, `staff_notifications` is per-recipient, and `quick_notes` is one row per
staff member and its application code is dead (Phase 1, SAFE TO DELETE). This is
tidy-up, not a launch item, and it is a migration file either way.

The newer policies (`patients_select`, `appointments_rls`, `clinical_records_*`,
all the `*_selfscope` ones) already wrap correctly, somebody learned this
lesson mid-project and applied it forward.

---

## TASK 4, CONCURRENCY FOR 20+ SIMULTANEOUS STAFF

### Which connection string, and the pool limits

- **The apps use `DATABASE_URL`**, `packages/db/src/client.ts:37`.
- **`DATABASE_URL_DIRECT` is used only by `drizzle-kit migrate`**, and
  `.env.example` documents why: the Supabase **session** pooler on port 5432,
  because the transaction pooler does not support session advisory locks.
- **`prepare: false`** at `client.ts:44` is the signature of the Supabase
  **transaction** pooler (port 6543): prepared statements cannot be used there.
  So `DATABASE_URL` is the transaction pooler. I cannot read the value to confirm
  the port, and I have not tried.
- **`max: 2`, `idle_timeout: 20`, `connect_timeout: 10`**, `client.ts:44`.
  A lazy singleton, so it is 2 connections **per warm serverless instance**.

**`max: 2` is defensible for serverless and is not a defect on its own**, it is
what stops a fan-out of instances exhausting the pooler. It becomes a defect only
in combination with an 18-second query, and my recommendation is therefore to
**leave it alone and fix the query**. Raising it before launch, without a load
test and without visibility of the pooler's own limit, trades a known fixed
problem for an unknown one. Carded POST-LAUNCH for a proper load test.

### Race exposure on booking and scheduling writes

**Double-booking is prevented by a database constraint ONLY for
`status = 'confirmed'`. For every other status it is application logic alone.**

The constraint, from `0061_no_double_confirmed_and_confirm_notification.sql`:

```sql
ALTER TABLE public.appointments
ADD CONSTRAINT appointments_no_double_confirmed
EXCLUDE USING gist (
  practitioner_id <gist_uuid_opclass> WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status = 'confirmed')
```

(built via `format()` after looking up the gist uuid opclass, because
`btree_gist` is required for `practitioner_id WITH =` and the migration refuses
to guess the schema.)

For `scheduled`, which is what a normal booking is, the protection is:

1. **Transaction-scoped advisory locks**, `apps/api/lib/appointments/slot-lock.ts`,
   bucketed to `SLOT_BUCKET_SECONDS = 15 * 60` and taken in **ascending** bucket
   order so two transactions locking overlapping sets cannot deadlock.
2. **A conflict guard** producing the ordinary "slot taken" answer.

`slot-lock.ts`'s own header is admirably blunt about the limits, and I am quoting
it rather than paraphrasing because it is the honest statement of the risk:

> *"This is an APPLICATION guarantee with NO database backstop behind it: the
> partial EXCLUDE constraint was cancelled once a DB-gated test proved
> `created_by` cannot identify portal rows. `write-paths.test.ts` is the only
> thing keeping the set of writers honest. If that test is weak, this protection
> is weak."*
> *"RLS does NOT back any of this up. The appointments policies scope visibility
> and authorship, not concurrency."*

It also records that deliberate double-booking ("Save anyway") is **permitted
product behaviour**, asserted by `apps/web/e2e/agenda-cards.spec.ts:104`. So the
absence of a blanket constraint is a decision, not an oversight. **The residual
risk is a writer that bypasses the choke point**, and one test guards that.

### Realtime subscriptions versus polling

**Neither and that is the right answer.** No Supabase Realtime channels
(`.channel(`, `postgres_changes`) anywhere, the only `subscribe()` calls are
`onAuthStateChange` in the two set-password clients. No `setInterval` polling
anywhere. Refresh is action-driven `router.refresh()` / `revalidatePath`. There
is **zero background database load** from 20 idle staff browsers, which is the
single best thing about this application's concurrency profile.

### Any mutation that serializes more than it needs

- The advisory lock is correctly scoped: transaction-lifetime, bucketed to
  15 minutes, ascending, and `pg_advisory_xact_lock` is re-entrant so a
  transaction touching the same bucket twice does not self-block
  (`scheduling/actions.ts:1396`).
- `pg_advisory_xact_lock(hashtext('patients_patient_number'), tenant)` in the
  patient-number trigger (`0029_patient_number.sql:55`, re-declared at
  `0047:95`) **serialises every patient INSERT across the whole tenant**. That is
  inherent to gapless per-tenant numbering and is correct. It matters only during
  the import, which is complete.
- No mutation holds a lock across an external call.

---

## TASK 5, PAGE LOAD

- **Images: nothing to optimise.** `apps/web` and `packages/ui` contain **zero**
  `<img>` tags and **zero** `next/image` imports. Every icon is `lucide-react`
  SVG. The only raster assets are the two signature-stamp PNGs, which are
  embedded as base64 into generated PDFs server-side and never reach a browser.
- **Fonts: already optimal.** `apps/web/app/layout.tsx:2` uses
  `next/font/google` with `Inter`, self-hosted at build time with `latin` +
  `latin-ext` subsets, exposed as the `--font-inter` CSS variable
  (`globals.css:24`, `packages/ui/theme.css:137`). No render-blocking
  `fonts.googleapis.com` link anywhere. Nothing to do.
- **Missing `loading.tsx` / Suspense: the real finding here.** Only **3**
  `loading.tsx` files exist in `apps/web` (`agenda`, `dashboard`, `marcacoes`)
  and only **3** files use `Suspense`. Eleven top-level sections have a
  `page.tsx` and no loading boundary:

      admin  clinical  consultation  estatisticas  horarios  invoicing
      login  notificacoes  patients  perfil  RECUPERACAO

  **`/recuperacao` is on that list, and it is the slowest route in the
  application.** With no boundary there is no streamed shell: the router holds
  the current screen and paints nothing until the whole 18-second response
  arrives. Adding `apps/web/app/recuperacao/loading.tsx` would not make the page
  faster, but it would turn a frozen application into a visibly loading one,
  which is most of what the owner actually experienced.

---

## TASK 6, ONE RANKED LIST BY USER-VISIBLE IMPACT

| # | Finding | Impact | Tag |
|---|---|---|---|
| **1** | **`appointments.patient_2_id` has no index.** /recuperação **17,962 ms → 191 ms**; the `patients_select` RLS helper **1,077 ms → 36 ms**. Holds both pool connections for 18 s, freezing every other section, and re-fires on every contact-mark and postpone. | **Critical** | **PRE-LAUNCH SAFE, index. NOT APPLIED: it is a migration file. Statement carded above.** |
| **2** | **`/recuperacao` has no `loading.tsx`.** No streamed shell, so the 18 s wait presents as a frozen app rather than a loading one. | High | **PRE-LAUNCH SAFE**: one new file, no schema, no query change. Not in Task 0's implement list, so carded. |
| **3** | **No pagination on `listFollowupCandidates`.** 1,320 rows measured, all hydrated into stateful client components, every patient's phone number in the payload. | High | **POST-LAUNCH**: refactor (needs a paging UI and an ordering decision). |
| **4** | **The same correlated subquery is computed 4× per qualifying row.** `followupLastAttendanceClause` (WHERE) and `followupLastAttendanceSql` (SELECT) are byte-identical; `followupPractitionerSql` is a third scan; `followupOwnPatientClause` a fourth for therapists. One `LATERAL` join computes the date and the practitioner once. | Medium (drops to low once #1 lands) | **POST-LAUNCH**: query rewrite in a shared `packages/db` file with a DB-gated proof behind it. Not eve-of-launch work. |
| **5** | **`revalidatePath("/recuperacao")` after every mutation** re-runs the unbounded query. Correct pattern, ruinous cost while #1 stands. | Medium | **POST-LAUNCH**: revisit after #1 and #3; likely needs no change at all. |
| **6** | **11 RLS policies call `auth.uid()` / `jwt_tenant_id()` unwrapped**, re-evaluated per row. All on small tables. | Low | **POST-LAUNCH**: migration file, one token each. |
| **7** | **`max: 2` connection pool** (`client.ts:44`) with transaction-scoped reads. Not a defect alone, but the amplifier for #1. | Low once #1 lands | **POST-LAUNCH**: needs a load test, not a guess, before any change. **My recommendation is to leave it alone for launch.** |
| **8** | **Double-booking has a DB constraint only for `status='confirmed'`;** `scheduled` relies on advisory locks plus one test guarding the writer set. | Low (decided behaviour) | **POST-LAUNCH**: a decision to revisit, not a bug to fix. |
| **9** | **10 other top-level sections lack a `loading.tsx`.** | Low | **POST-LAUNCH**. |
| **10** | **4 unnarrowed `.select()` in the patients domain**, widest realistic read 200 rows. | Very low | **POST-LAUNCH**. |

    PRE-LAUNCH SAFE   2   (#1 carded for owner apply, #2 carded)
    POST-LAUNCH       8
    ---
    TOTAL            10

### Not findings, recorded so they are not re-audited

Fonts (`next/font`, self-hosted, subsetted). Images (none exist). N+1 (none;
the one candidate is explicitly batched). Realtime/polling (neither; zero idle
load). Heavy client libraries (only `recharts`, correctly isolated to one
route). `apps/portal` is 100% server components.

---

## Reproduction, so any number here can be re-checked

Disposable `postgres:16` container, never the local Supabase stack and never
production. Schema and index set transcribed from `packages/db/migrations`
(`0001`, `0032`, `0067`); clause text copied byte-for-byte from
`packages/db/src/followup-selection.ts`; 8,400 patients / 41,000 appointments /
1,640 dual-patient / 35,720 completed; `ANALYZE` before every measurement; each
timing taken 2-3 times. The RLS helper
`patient_appt_at_viewer_location` was transcribed verbatim from
`0047_patients_location_rls.sql:161-171`. The container is disposable and no
credential, no production host and no local dev database was touched.

---

*BLUE, platform terminal. Task 0 merged nothing: the fix is an index, an index
is a migration file, and migration files are not this lane.*
