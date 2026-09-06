# OsteoJP — PURPLE session close, 2026-09-05

Written because the owner is closing out and BLUE has an unapplied migration in
flight. **Nothing here replaces repo ground truth.** `origin/main`, the board
JSON and `docs/board/PORTAL-REHYDRATE.md` outrank this document; it exists to
say what a fresh session would otherwise have to rediscover, and to carry three
findings that are worth more than the code they came with.

---

## 1. What this session shipped

| PR | what |
|---|---|
| #1181 | `LE-guest-convert-abandoned-booking`, **option B**. A converted guest request stays in reception's queue as `Convertido - sem marcação` until somebody dismisses it. |
| #1183 | **PERF-17.** The eleven call sites of `patientLocationScope` are enumerated by a test, and the two that pass a column other than `patients.id` are covered by a four-class DB suite. |

Neither touches a migration. Neither contacts production.

---

## 2. What is in flight, and whose it is

**BLUE holds an unapplied migration.** `#1175` — migration **0079**, revokes
`EXECUTE` from `service_role` and `anon` on the twenty SECURITY DEFINER
functions. Card `SEC-security-definer-service-role-execute`, gate
`owner_merge`, **OPEN, NOT MERGED, NOT APPLIED**. It is the one thing on the
board that changes production schema state, and it is the owner's to release.
**0079 is that migration.** Older cards (PERF-15, RLS-01) use "0079" to mean the
deferred patients-path predicate rewrite; that work is now carded as `RLS-02`
and is a different thing. Do not apply a ruling about one to the other.

**Blocked on people, and on whom** (re-derived from the board at close, not
copied from earlier in the session — `PACK-04` moved out of this lane while this
document was being written):

- **ivan (6)** — `LE-suppression-observation`,
  `LE-migration-patient-fields-not-persisted`, `LAUNCH-04-sunday-owner-packet`,
  `LE-48h-email-never-observed-sending`, `OBS-03-sentry-source-maps-never-uploaded`,
  `PL-admin-clinical-access`. Two incidents are also blocked on him inside the
  incidents lane: `SEC-supabase-anon-execute-segfault`, `INC-agenda-typeerror-m-id`.
- **jp (4)** — `LAUNCH-02-jp-packet-signoff`, `LE-terms-version-switch-on-jp-text`,
  `LE-24h-sms-tokenized-confirm-link`, `Q-PL-ADMIN-CLINICAL-1`.

**Open lanes at close:** 23 in flight, 6 incidents, 30 loose ends, 10 blocked on
people. `/admin/staff` stays deferred by owner ruling and nothing in this session
touched it.

**SR-52 landed while this session was closing** and binds every lane: privilege
assertions read EFFECTIVE privilege (`has_function_privilege` /
`has_table_privilege`), never a grep of `proacl` for a grantee name, because a
REVOKE from a named role does not remove what PUBLIC holds. Its corollary binds
grant migrations: state your own end state, revoke then GRANT to exactly the
roles intended. It is the rule behind both of 0079's errors and it is worth
reading before touching #1175.

---

## 3. The three findings the next session should inherit

These are not tasks. They are things that were measured, that cost something to
find, and that are easy to lose.

### 3.1 The control that did NOT fail is the most useful result of the week

Removing the app-layer `roleScope` from **all four** patients-path compositions
leaves every assertion in `location-scope-classes.db.test.ts` **green**, because
0073's `patients_select` narrows an admin to `viewer_visible_patient_ids()` and
produces the identical set on its own.

**So on that path the app predicate can only NARROW what RLS already returned.
Its ABSENCE is invisible to a composite gate and its MUTILATION is not.**

It lives in that file's header rather than in a report, which is what makes it
survive. Two consequences a future session must not rediscover the hard way:

- A gate that asserts SETS through the production functions cannot tell you
  whether the app predicate is still there. If that matters — and for
  defence-in-depth it might — it needs a different kind of assertion.
- PERF-17 then found the other half: **the two call sites disagree.**
  `listPatientsUnreachableBySms` selects `FROM appointments`, so every row first
  survives `appointments_rls`, which IS location-scoped — RLS gets there before
  the app predicate. `listStuckConsultations` reads a table whose policy is not
  location-scoped, so there the predicate is the whole rule. The same patient,
  the same principal, the same minute, two answers, both correct. Asserted in
  `scope-classes-other-columns.db.test.ts`.

### 3.2 What production still pays on /patients is NOT appointment-count-bound

Measured by moving the variable rather than by arguing about it: the lane's
appointments table went from **24,631 to 40,853** rows (production holds 41,558)
and the `/patients` reload moved by about **10 ms** — from a median near 90 to
near 100, inside the run-to-run spread.

| | production (owner) | purple lane |
|---|---|---|
| `db:patients-list`, first load | 654.3 ms | 599.3 ms |
| `db:patients-list`, reload | 657.6 / 626.1 ms | 91.1 / 100.7 / 100.1 / 112.1 ms |

The first load agrees; the reload does not, by about six times, and growing the
fixture does not close it. **The pooler and the round trips across it are the
place to look, not the query shape.** Noted by the owner, not dispatched. Do not
reopen the patients-path predicate rewrite on the strength of the lane's number:
the lane cannot see the cost that remains.

### 3.3 A harness can report the previous fixture's numbers, and a seed can lie about its own

Both were shipped by this lane and both were found by a screen refusing to go
green, not by a gate:

- **PERF-15's class construction drew its patients at random** from all 8,404
  seeded ones, 293 of which sit in a statistic bucket, and moved their
  appointments outside the assignment. It took 1 `seen this month` and 3 `with
  upcoming` with them — **after the seed printed "all four counts match the
  owner's screen"**, because its check asserted only the UNASSIGNED principal and
  counted appointments with RLS out of the way. Fixed in #1177: the classes are
  drawn from the bucket-free patients, and the ASSIGNED principal's four numbers
  are asserted with the appointment scan bounded the way the policy bounds it.
- **`next dev` persists `unstable_cache` to `.next/dev/cache/fetch-cache`, on
  disk**, so it outlives the dev server Playwright starts and stops. With the
  seed corrected and the database demonstrably holding 56 and 153, the spec kept
  failing with 55 and 150 — the previous seed's numbers — until that directory
  was cleared. `perf-admin-stats.spec.ts` now asserts the first click is a cache
  MISS and names the directory.

**The rule both of them are instances of:** a measurement instrument that is not
itself under test will report the last true thing it knew. Before believing a
number from this harness, check that the reading is a MISS and that the seed
asserted the principal you are measuring as.

---

## 4. Traps this session paid for, so the next one does not

- **`pnpm test` through turbo does NOT forward `DATABASE_URL`.** It reported 681
  skipped in packages/db and 130 in apps/web while looking green. The only honest
  DB-gated proof is the three suites run directly, the way `db-tests.yml` runs
  them: `cd packages/db && DATABASE_URL=… pnpm exec vitest run`, then
  `cd apps/web && DATABASE_URL=… pnpm exec vitest run .db.test.ts`, then the same
  in `apps/api`. Never quote a turbo summary line as the DB-gated gate.
- **The board artifact is one URL shared by both lanes.** On a publish refusal,
  read the live version, recover the other lane's cards from the render's
  `#board-data` island, merge additively, publish the union, and commit only your
  own JSON. This happened twice in two sessions.
- **A negative control that does not fire is a finding about your fixture.**
  PERF-17's `patient_2_id` arm was not load-bearing until a control proved it:
  the fixture had given the secondary-only patient their own appointment inside
  the assignment, so the first arm reached them. Run the controls; do not assume
  the arms you named are the arms being exercised.

---

## 5. Where to start

`PERF-17`'s own file names the four call sites still uncovered —
`followup/scope.ts`, `followup/queries.ts` twice, `statistics/kpi-queries.ts`.
They need window and aggregate fixtures no class suite builds, and all four pass
`patients.id`, which is the shape already pinned. That is the natural next piece
of harness work and it is small enough to finish inside one session.
