# PERF-01, THE PLATFORM-WIDE SLOWNESS, PHASE 1 ONLY

**BLUE, platform terminal, 2026-09-01. Base `origin/main@950c5c09`.**

**PHASE 1 WAS NOT COMPLETED AND PHASE 2 WAS NOT ENTERED.** The dispatch halts on
"any Phase 1 finding that contradicts the board" and that condition fired. It was
ruled on the next day and the halt was upheld on both counts; see the box in §1
and, for the reads that were refused, §3. What
follows is what could be measured without touching production, what could not,
and the exact text of every read the owner has to run himself.

Nothing here was executed against production, the production Supabase project
`dfotoodqvmjhbdcxyaxf`, the local Supabase stack, or any console. Standing rule 1.

---

## 1. THE HALT

Four cards say the client-data import has not happened. A merged migration, a
shipped card and a merged audit say production carries the imported data.

| Says NOT run | Says it DID run |
|---|---|
| `LAUNCH-03-client-data-migration`, `todo` | `0068_appointments_patient_2_index.sql` header: *"sequentially scans all 41,000 appointments … 13,881 times per /recuperacao page load. Confirmed in production by Sentry statement timeouts … 2026-08-30"* |
| `MIG-05-prod-import-path`, in_flight: *"THE PRODUCTION RUN HAS NOT HAPPENED"* | `PERF-01` card: *"THE RECUPERACAO QUERY, ON PRODUCTION: AFTER, cold 227.163 ms / warm 170.734 ms"*, and *"production has dual=0 today"* |
| `MIG-07-test-patient-cleanup`, closes on *"`patients` 33 before and 0 after"* | `PERF-06` card: *"8,400 patients and 41,429 appointments"* |
| `LAUNCH-01`, `todo` | `PHASE-2-PERF.md` TASK 4: *"It matters only during the import, which is complete."* |

8,400 patients do not accumulate in two days of organic use. Carded `INC-16`.

> ### RESOLVED 2026-09-01, AGAINST THE RIGHT-HAND COLUMN. SR-17 (dispatched as SR-14).
>
> **The import ran.** The owner confirms go-live and reports a production
> dashboard showing a **153.3 MB** database; 33 staff-training patients do not
> produce 153.3 MB. The five cards in the left column carried a false status and
> are corrected to shipped by evidence.
>
> **Nothing measured here has to be re-run.** The shim below was seeded to the
> shape the `PERF-01` card had recorded *from production*, so this ruling
> confirms the premise the numbers already assumed. The ranking stands.
>
> **The evidence is a relayed owner reading, not a terminal proof, and it can
> never be anything else**: standing rule 1 means no terminal may read
> production, and SR-18 (dispatched as SR-15) makes that explicit for
> observability. Recording an owner reading *as* an owner reading is the honest
> form; recording it as a proof would be this incident's own error, inverted.

**`pnpm board:reconcile` exits 0 on this.** Its stale-card rule keys on the PRs a
card CITES and its gate-claim rule on the gate a card CLAIMS; a card whose PROSE
is falsified by another file's prose triggers neither. This is the third
staleness shape `reconcile-board.mjs`'s own header names.

---

## 2. WHAT WAS MEASURED, AND HOW

Disposable `postgres:16` container, port-mapped to `127.0.0.1:55432`, destroyed
after. Schema and index set transcribed from `packages/db/migrations` **including
0068**. Seeded to the production shape the `PERF-01` card recorded: 8,400
patients, 41,429 appointments, 36,309 completed, **dual = 0**, 2,246 future
active. `ANALYZE` before every measurement, each timing taken three times, warm.

Same method as `PHASE-2-PERF.md`. No credential, no production host, no local dev
database.

### 2.1 The query count per /patients load, derived from the code

`app/patients/page.tsx:125` runs three reads in a `Promise.all`. Each one calls
`viewerLocationScope` first, and that is `resolveViewerLocationIds`
(`lib/auth/viewer-locations.ts:21-29`) in **its own `runScoped` transaction**. So
the same `staff_locations` row set is fetched **three times per page load**.
React `cache()` is not used anywhere in `apps/web` — zero imports.

    SIX transactions, NINETEEN statements, per /patients load.

Confirmed by the harness: 3 page loads produced 18 transactions and 57 statements.

`withTenantContext` (`packages/db/src/client.ts:115-127`) opens a real
`transaction()` and holds the connection for the whole of `fn(tx)`, after two
setup statements (`set local role authenticated`, `set_config`). The pool is
`postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 })`
at `client.ts:44` — **two connections per warm instance, and one /patients load
asks for three at once.**

### 2.2 The per-row cost

`patientLocationScope` (`lib/patients/scope.ts:64-83`) is **two** correlated
subqueries. `getPatientListStats` adds `seenThisMonth` (1), `hasUpcoming` (1) and
`inRecoveryWindow` (2 — `followupLastAttendanceClause` +
`followupNoFutureBookingClause`). **Six correlated appointment subqueries per
patient row**, and the strip does not narrow with the search box by design
(`page.tsx:121-124`).

`EXPLAIN ANALYZE` puts the location-scope subplan at **`loops=8400`** — it runs
for every patient before anything narrows — and reports **`Buffers: shared
hit=151158`** for one stat strip.

The file's own comment at `list-queries.ts:95-98` says the correlated subqueries
"live in the SELECT list, so Postgres evaluates them only for the rows a page
actually returns - at most 100". **That is true of `listPatientsPage` and false of
`getPatientListStats`**, where the identical shapes sit inside
`count(*) filter (where …)` over the entire scoped set. `list-queries.ts:240-243`
frames it as an optimisation: *"FOUR COUNTS IN ONE ROUND TRIP, not four queries."*
One round trip, yes. 33,600 subquery executions inside it.

### 2.3 Timings, warm, local, zero network

    stat strip, reception-scoped     163.976 / 170.457 / 187.834 ms
    stat strip, unscoped (owner)     152.772 ms
    count(*) for the page             18.792 ms  (57.802 cold)
    page rows, sort=name              26.135 ms
    page rows, sort=lastVisit         29.100 ms
    staff_locations lookup (x3)        0.083 ms  (1.361 cold)

The stat strip is **~85% of the page's database time**.

**A HYPOTHESIS THAT DIED, RECORDED BECAUSE IT LOOKED RIGHT.** Sorting by last
visit pushes the correlated subquery into the `ORDER BY` (`orderFor`,
`list-queries.ts:170`), which should mean evaluating it for the whole filtered
set. It costs **29 ms**, not seconds, because 0068 makes that shape index-backed.
It is not the defect.

### 2.4 Thirty concurrent staff sessions

`postgres.js` with the options transcribed byte-for-byte from `client.ts:44` and
the `withTenantContext` preamble from `client.ts:120-126`. Mixed workload: agenda
reads, /patients loads and appointment creates.

    pool max=2 (as shipped)   /patients p50 1330  p95 1523
                              agenda    p50 1569  p95 2343
                              create    p50 1136  p95 1340
                              wall 5636 ms, 780 transactions, 2418 statements, 0 errors

One session, same code, no contention: **/patients p50 160 ms**. Contention alone
is **8x**, on a local database with no network latency at all.

The pool sweep, same load:

    max  wall     /patients p50/p95   agenda p50/p95   create p50/p95
      2  5665 ms      1347 / 1518        1569 / 2364      1150 / 1332
      4  3004 ms       709 /  878         862 / 1114       548 /  670
      8  2442 ms       569 /  792         579 /  707       356 /  427
     16  2870 ms       659 / 1128         424 /  617       307 /  345

**The knee is 8.** Past it the CPU saturates and /patients p95 regresses.

### 2.5 The rewrite, proven and not shipped

One pass over `appointments`, unnested over `patient_id` and `patient_2_id`,
grouped by patient, then joined to `patients`.

    stat strip AS SHIPPED   163.976 / 170.457 / 187.834 ms
    stat strip REWRITTEN     11.036 /  11.206 /  31.255 ms      15x

**Proven to return identical numbers**, by one query computing both arms and
comparing them: scoped `2800 / 5 / 749 / 253`, unscoped `8400 / 19 / 2244 / 843`,
all four equal in both cases.

End to end, **at the shipped pool of 2, unchanged**, 30 sessions, mixed:

    BEFORE  /patients p50 1330 p95 1523 | agenda p50 1569 p95 2343 | create p50 1136 p95 1340 | wall 5636 ms
    AFTER   /patients p50  408 p95  475 | agenda p50  504 p95  728 | create p50  363 p95  414 | wall 1759 ms

**3.2x on p50 and p95 with no pool change, no migration, no index, no RLS edit and
no console change.** It also beats raising the pool: `max=8` with the shipped
queries gave /patients p50 569 ms against **408 ms** here.

**IT IS NOT MERGED AND MUST NOT BE MERGED ON THIS NUMBER ALONE.** It reimplements
`patientLocationScope`'s predicate inside the aggregate, and `scope.ts` says in
its own words that *"a redesign that quietly widened who can see a row would be a
security change dressed as a table."* It needs the DB-gated isolation suites, not
an equivalence check on four integers.

### 2.6 The advisory lock is not the cause

`slot-lock.ts` keys on `(tenant, practitioner, 15-minute bucket)`, ascending,
transaction-scoped, re-entrant. Two receptionists contend only when booking **the
same therapist in the same quarter-hour**. It cannot produce a platform-wide
symptom, and the harness saw no lock wait. The `create` latency above is the pool,
not the lock.

---

## 3. WHAT COULD NOT BE MEASURED

Standing rule 1 forbids a terminal touching production or any production console,
read-only included. **Four of the eight Phase 1 items are therefore unanswered**:
Sentry route timings and error onset; `pg_stat_statements`; the pooler's own
connection limit and observed peak; Vercel `fra1` function duration and cold
starts. The `patients_select` policy body **as it exists on production** is
likewise unread — what is recorded here is the body as authored in
`0047_patients_location_rls.sql`, which is not the same claim.

The read-only statements and the console click paths for all of them are in the
session report and are the owner's to run.

---

## 4. A SEPARATE HAZARD FOUND ON THE WAY

**FIXED 2026-09-01 in #1092 (`ca970a9a`); the description below is what was
found.** The guard is now positive — an allowed local host is identified
affirmatively and every remote target is refused, including a production project
nobody has blocklisted. Removing it as a negative control makes the seeder reach
the production pooler and return `FATAL: password authentication failed`, so the
defect is demonstrated rather than argued.

`scripts/perf-seed-loadtest.mjs:23` aborted on `jaxmkwoxjcgzkwxgbayx` — the
**retired** project. `packages/db/seed/seed-guard.ts:31` is the canonical list and
holds both refs, with `dfotoodqvmjhbdcxyaxf` commented as *"PRODUCTION (Central EU
/ Frankfurt), the live clinic"*. Pointed at the current `DATABASE_URL` the script
does not abort; it inserts 2,000 patients and 20,000 appointments into the live
clinic. Its header still advertises the guard as working. Carded `PERF-08`.

What stops it today is that line 16 imports `postgres` from an absolute path on
another machine. That is an accident, not a safety property.
