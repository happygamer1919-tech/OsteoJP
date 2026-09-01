import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, count, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { locations, patients } from "@osteojp/db";
import { runScoped, requireRequestContext, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope, therapistPatientScope } from "@/lib/patients/scope";
import { activePatientsOnly } from "@/lib/patients/filters";
import { escapeLike, parseSearch } from "@/lib/patients/validation";
import { followupWindow } from "@/lib/followup/window";
import { PATIENT_STATS_TAG } from "./cache-tags";

/**
 * UX-01 - the /patients working list, read side.
 *
 * ==========================================================================
 * EVERY FILTER IS A WHERE CLAUSE. NONE IS A .filter() ON THE RESULT.
 * ==========================================================================
 * The list is 8,400 rows. Filtering client-side would mean shipping 8,400
 * patients - names, telephone numbers and fiscal numbers - to a browser in
 * order to hide most of them, which is a disclosure wearing a feature's
 * clothes. It is the same argument RB-01 makes for the therapist scope one
 * directory over, and it applies harder here because this list is unscoped for
 * reception.
 *
 * ==========================================================================
 * THE ROLE SCOPE IS UNCHANGED AND IS NOT THIS CARD'S BUSINESS
 * ==========================================================================
 * `therapistPatientScope` and `patientLocationScope` are the same helpers
 * `listPatients` and `searchPatients` already use, ANDed in the same order. A
 * redesign that quietly widened who can see a row would be a security change
 * dressed as a table.
 */

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type PatientSort = "name" | "lastVisit";
export type SortDirection = "asc" | "desc";

export type PatientListFilters = {
  q: string;
  locationId: string | null;
  upcomingOnly: boolean;
  sort: PatientSort;
  dir: SortDirection;
  page: number;
};

export type PatientListRow = {
  id: string;
  patientNumber: number | null;
  fullName: string;
  nif: string | null;
  phone: string | null;
  locationName: string | null;
  lastVisitAt: Date | null;
  nextAppointmentAt: Date | null;
};

export type PatientListPage = {
  rows: PatientListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type PatientListStats = {
  total: number;
  seenThisMonth: number;
  withUpcoming: number;
  inRecoveryWindow: number;
};

/** The qualified outer reference the shared followup clauses take. */
const PATIENT_ID = '"patients"."id"';

/**
 * Last COMPLETED visit, and the next non-cancelled appointment.
 *
 * ==========================================================================
 * WHY THESE ARE SAFE TO WRITE NOW AND WERE NOT BEFORE
 * ==========================================================================
 * Both carry `(patient_id = X OR patient_2_id = X)` - the shape that had no
 * index until migration 0068 and that cost /recuperacao 127 seconds on
 * production. With 0068 in place each is a BitmapOr over two index scans,
 * measured at 0.108 ms on production. This card is sequenced after 0068 for
 * exactly that reason.
 *
 * THEY LIVE IN THE SELECT LIST, so Postgres evaluates them only for the rows a
 * page actually returns - at most 100 - and never for the 8,400 the filter
 * scanned. The one exception is sorting by last visit, which necessarily pushes
 * the first of them into the ORDER BY; see `orderFor`.
 */
const lastVisitSql = sql<string | null>`(
  SELECT max(v.starts_at) FROM appointments v
   WHERE (v.patient_id = ${sql.raw(PATIENT_ID)} OR v.patient_2_id = ${sql.raw(PATIENT_ID)})
     AND v.status = 'completed'
)`;

const nextApptSql = sql<string | null>`(
  SELECT min(n.starts_at) FROM appointments n
   WHERE (n.patient_id = ${sql.raw(PATIENT_ID)} OR n.patient_2_id = ${sql.raw(PATIENT_ID)})
     AND n.starts_at > now()
     AND n.status NOT IN ('cancelled', 'no_show')
)`;

/**
 * THE NIF SEARCH MATCHES WITH AND WITHOUT SPACES, IN BOTH DIRECTIONS.
 *
 * `parseSearch` already strips the typed side to digits, so "123 456 789"
 * becomes "123456789". That alone is only half the problem: the STORED value
 * may itself carry spaces or dots, and `nif ILIKE '123456789%'` then matches
 * nothing at all.
 *
 * So both sides are normalised. `phone` has a STORED generated column for this
 * (`phone_digits`, migration 0015) and is matched against it; `nif` has none,
 * and one cannot be added today because migration authorship freezes after 0068
 * per SR-11. The per-row `regexp_replace` is the honest cost of that, and it is
 * bounded: it runs over the location- and role-scoped patient set of a single
 * tenant, on a table of 8,400 rows, beside an ILIKE that already scans.
 *
 * A `nif_digits` generated column mirroring 0015 is the right long-term fix and
 * is carded POST-LAUNCH rather than smuggled in here.
 */
const nifDigits = sql`regexp_replace(coalesce(${patients.nif}, ''), '[^0-9]', '', 'g')`;

function searchMatcher(raw: string): SQL | undefined {
  const { text, digits } = parseSearch(raw);
  if (text.length === 0) return undefined;
  const matchers: SQL[] = [ilike(patients.fullName, `%${escapeLike(text)}%`)];
  if (digits.length > 0) {
    const like = `${escapeLike(digits)}%`;
    matchers.push(sql`${nifDigits} like ${like}`);
    matchers.push(sql`"phone_digits" like ${`%${escapeLike(digits)}%`}`);
    // A patient number is typed as digits and compared as a number, so "42"
    // finds patient 42 and not 420. Cast defensively: patient_number is NOT
    // NULL post-backfill but the column's default says otherwise.
    if (digits.length <= 9) {
      matchers.push(sql`${patients.patientNumber} = ${Number(digits)}`);
    }
  }
  return or(...matchers);
}

async function scopeConditions(ctx: RequestContext, locationId: string | null) {
  const locIds = await viewerLocationScope(ctx);
  const roleScope =
    therapistPatientScope(ctx, patients.id) ??
    (locIds ? patientLocationScope(patients.id, locIds) : undefined);
  // The location SELECT narrows within the viewer's own scope; it can never
  // widen it. A located receptionist choosing another clinic gets their own
  // scope ANDed with a clinic they cannot see, which is an empty list - the
  // truthful answer, not an error.
  const chosen = locationId ? patientLocationScope(patients.id, [locationId]) : undefined;
  return { roleScope, chosen };
}

function orderFor(sort: PatientSort, dir: SortDirection): SQL {
  const d = dir === "desc" ? sql`desc` : sql`asc`;
  if (sort === "lastVisit") {
    // NULLS LAST in both directions, deliberately: a patient who has never been
    // seen is not "the oldest visit", and floating them to the top of an
    // ascending sort would bury the answer the sort was asked for.
    return sql`(${lastVisitSql}) ${d} nulls last`;
  }
  // patients_tenant_name_idx (tenant_id, full_name) serves this directly.
  return sql`${patients.fullName} ${d}`;
}

export async function listPatientsPage(
  filters: PatientListFilters,
  ctxInput?: RequestContext,
): Promise<PatientListPage> {
  const ctx = ctxInput ?? (await requireRequestContext());
  assertCan(ctx.role, "patients:read");

  const pageSize = PAGE_SIZE;
  const page = Math.max(1, Math.floor(filters.page) || 1);
  const { roleScope, chosen } = await scopeConditions(ctx, filters.locationId);

  const upcoming = filters.upcomingOnly
    ? sql`EXISTS (SELECT 1 FROM appointments u
          WHERE (u.patient_id = ${sql.raw(PATIENT_ID)} OR u.patient_2_id = ${sql.raw(PATIENT_ID)})
            AND u.starts_at > now()
            AND u.status NOT IN ('cancelled', 'no_show'))`
    : undefined;

  const where = and(activePatientsOnly, roleScope, chosen, searchMatcher(filters.q), upcoming);

  return runScoped(ctx, async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(patients).where(where);
    const total = Number(n ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pageCount);

    const rows = await tx
      .select({
        id: patients.id,
        patientNumber: patients.patientNumber,
        fullName: patients.fullName,
        nif: patients.nif,
        phone: patients.phone,
        locationName: locations.name,
        lastVisitAt: lastVisitSql.as("last_visit_at"),
        nextAppointmentAt: nextApptSql.as("next_appointment_at"),
      })
      .from(patients)
      .leftJoin(locations, eq(locations.id, patients.primaryLocationId))
      .where(where)
      .orderBy(orderFor(filters.sort, filters.dir))
      .limit(pageSize)
      .offset((safePage - 1) * pageSize);

    return {
      // Converted at the boundary, once, where the string is known to be one.
      // A raw sql fragment carries no column type, so the driver hands back a
      // string and NOT a Date - the INC-12 fourth defect, one directory over.
      rows: rows.map((r) => ({
        ...r,
        lastVisitAt: r.lastVisitAt ? new Date(r.lastVisitAt) : null,
        nextAppointmentAt: r.nextAppointmentAt ? new Date(r.nextAppointmentAt) : null,
      })),
      total,
      page: safePage,
      pageSize,
      pageCount,
    };
  });
}

/**
 * The four numbers above the filter bar. ONE PASS OVER `appointments`, not one
 * correlated subquery per patient per statistic.
 *
 * ==========================================================================
 * WHAT THIS REPLACED, AND WHY "ONE ROUND TRIP" WAS THE WRONG THING TO COUNT
 * ==========================================================================
 * The previous version wrote each statistic as a scalar subquery inside
 * `count(*) filter (where ...)`, and its comment said: "FOUR COUNTS IN ONE ROUND
 * TRIP, not four queries: so the page pays one transaction rather than four."
 *
 * One round trip, and SIX CORRELATED SUBQUERIES PER PATIENT ROW inside it - two
 * for `patientLocationScope`, one for `seenThisMonth`, one for `hasUpcoming` and
 * two for `inRecoveryWindow`. `EXPLAIN ANALYZE` put the location-scope subplan at
 * `loops=8400`: it ran for every patient in the tenant before anything narrowed,
 * and reported `Buffers: shared hit=151158` for a single render of four numbers.
 *
 * The transaction count was true and it was not the cost. It is the same shape
 * PORTAL-REHYDRATE §1.3 warns about, one layer out: a sentence that reports
 * something reasonable about a path whose real expense sits somewhere else.
 *
 * ==========================================================================
 * MEASURED, AT PRODUCTION SCALE
 * ==========================================================================
 * Disposable postgres:16 seeded to the shape the PERF-01 card recorded from
 * production - 8,400 patients, 41,429 appointments, 36,309 completed, dual = 0 -
 * with the index set transcribed from packages/db/migrations including 0068,
 * ANALYZEd, warm, three runs each:
 *
 *     as shipped   163.976 / 170.457 / 187.834 ms
 *     this version  11.036 /  11.206 /  31.255 ms
 *
 * At thirty concurrent staff sessions against the unchanged `max: 2` pool, the
 * whole /patients path moved from p50 1330 ms / p95 1523 ms to p50 408 / p95 475.
 *
 * ==========================================================================
 * THE PREDICATES ARE UNCHANGED AND THAT IS PROVEN, NOT ASSERTED
 * ==========================================================================
 * `list-queries.db.test.ts` fixes every one of these four numbers by
 * construction against a real database, through these functions, with RLS
 * enforced - and pins `patientLocationScope` separately with RLS out of the way,
 * because RLS is the ceiling and would otherwise carry the visible set on its
 * own. Five negative controls redden it, including one patient that exists
 * solely so `followupNoFutureBookingClause` has an assertion.
 *
 * ==========================================================================
 * ONE PROPERTY IS LOST HERE, AND IT IS REPLACED RATHER THAN DROPPED
 * ==========================================================================
 * The previous version IMPORTED `followupLastAttendanceClause` and
 * `followupNoFutureBookingClause` from @osteojp/db and bound them directly, so
 * "in the recovery window" could not drift from what /recuperacao selects on.
 * Its comment said exactly that, and it was the right instinct: "a second
 * definition here would be a number that drifts from the page it claims to
 * summarise".
 *
 * THIS VERSION CANNOT BIND THEM. Both clauses are correlated subqueries over
 * `appointments` - re-scanning per patient row is precisely what they are, and
 * precisely what cost 164-188 ms. Evaluating them against the aggregate means
 * expressing the same rule a second time, which is the drift the old comment
 * warned about.
 *
 * SO THE GUARANTEE MOVES FROM A SHARED EXPRESSION TO A MECHANICAL TEST.
 * `list-queries.db.test.ts` computes `inRecoveryWindow` BOTH ways on the same
 * fixture - once through this aggregate, once through the imported clauses
 * verbatim - and asserts they agree. If /recuperacao's definition changes, that
 * test reddens and names this function. A comment asking the next person to keep
 * two definitions in step would not have; this is the same reasoning
 * `scripts/local-target.mjs` uses for reading its allowlist from source rather
 * than copying it.
 *
 * THE UNNEST IS OVER BOTH PATIENT COLUMNS. `patient_2_id` is the arm every one
 * of these expressions carried and the one a rewrite drops silently; the suite
 * has a patient reachable ONLY through it, in the scope and in the window.
 */
export async function getPatientListStats(
  locationId: string | null,
  ctxInput?: RequestContext,
  now: Date = new Date(),
): Promise<PatientListStats> {
  const ctx = ctxInput ?? (await requireRequestContext());
  assertCan(ctx.role, "patients:read");
  const { roleScope, chosen } = await scopeConditions(ctx, locationId);
  const base = and(activePatientsOnly, roleScope, chosen);
  const { from, to } = followupWindow(now);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return runScoped(ctx, async (tx) => {
    /**
     * Every per-patient fact the four statistics need, computed in ONE pass.
     *
     * The UNION ALL unnests `appointments` over both participant columns, so a
     * row where the patient is the SECOND participant contributes to their own
     * aggregates exactly as a primary row does. `patient_2_id IS NOT NULL` on the
     * second arm is what migration 0068's partial index answers.
     *
     * RLS APPLIES INSIDE THIS CTE. It runs in the same transaction, under the
     * same `authenticated` role and claims as everything else in `runScoped`, so
     * `appointments_rls` scopes it exactly as it scoped the correlated subqueries
     * this replaced.
     */
    const perPatient = sql`
      SELECT pid,
             max(starts_at) FILTER (WHERE status = 'completed')                     AS last_completed,
             count(*)       FILTER (WHERE status = 'completed'
                                      AND starts_at >= ${monthStart.toISOString()}::timestamptz)
                                                                                     AS completed_this_month,
             bool_or(starts_at > ${now.toISOString()}::timestamptz
                     AND status NOT IN ('cancelled', 'no_show'))                     AS has_future
        FROM ( SELECT patient_id   AS pid, starts_at, status FROM appointments
               UNION ALL
               SELECT patient_2_id AS pid, starts_at, status FROM appointments
                WHERE patient_2_id IS NOT NULL ) participations
       GROUP BY pid`;

    /**
     * The recovery window, from the SAME shared clauses /recuperacao selects on.
     *
     * `followupLastAttendanceClause` is a subquery yielding the patient's latest
     * completed attendance, compared BETWEEN two bounds; `agg.last_completed` is
     * that same value, already computed above. `followupNoFutureBookingClause` is
     * a `NOT EXISTS` over future non-cancelled appointments, which is exactly
     * `NOT has_future`.
     *
     * THIS IS A SECOND EXPRESSION OF THE SAME RULE, said plainly rather than
     * implied. The equivalence is held by the drift test named in the header, not
     * by this comment.
     */
    const inWindow = sql<number>`(
      agg.last_completed BETWEEN ${from.toISOString()}::timestamptz AND ${to.toISOString()}::timestamptz
      AND NOT coalesce(agg.has_future, false)
    )`;

    const [row] = await tx
      .select({
        total: count(),
        seenThisMonth: sql<number>`count(*) filter (where coalesce(agg.completed_this_month, 0) > 0)`,
        withUpcoming: sql<number>`count(*) filter (where coalesce(agg.has_future, false))`,
        inRecoveryWindow: sql<number>`count(*) filter (where ${inWindow})`,
      })
      .from(patients)
      .leftJoin(sql`(${perPatient}) agg`, sql`agg.pid = ${patients.id}`)
      .where(base);

    return {
      total: Number(row?.total ?? 0),
      seenThisMonth: Number(row?.seenThisMonth ?? 0),
      withUpcoming: Number(row?.withUpcoming ?? 0),
      inRecoveryWindow: Number(row?.inRecoveryWindow ?? 0),
    };
  });
}

/* ================================================================== */
/* The stat strip, cached. SR-25.                                      */
/* ================================================================== */

/**
 * The invalidation tag lives in `./cache-tags`, which has no imports and no
 * top-level calls. See that file for why: a constant must not drag this
 * module's `unstable_cache` side effect into everything that names the tag.
 */

/**
 * ==========================================================================
 * WHY A SEPARATE FUNCTION AND NOT A FLAG ON `getPatientListStats`
 * ==========================================================================
 * `getPatientListStats` takes an injectable `now`, and eleven DB-gated
 * assertions pass a fixed one so their windows are deterministic. A cache keyed
 * without the clock CANNOT serve a caller who pinned the clock, so a single
 * function would have needed a branch on "was `now` supplied", and that branch
 * is the shape PORTAL-REHYDRATE 1.3 catalogues: two different questions
 * answered by one code path, distinguished by whether an optional argument
 * happened to be present.
 *
 * So the cached read is its OWN export, the uncached one is untouched, and
 * every existing caller and test keeps the function it already had. The page is
 * the only caller that wants a cache and it asks for one by name.
 *
 * ==========================================================================
 * WHY THIS IS CACHED AND THE LIST IS NOT
 * ==========================================================================
 * Measured under PERF-06 TASK 2, RLS enforced, at the shipped pool size: the
 * stat strip is the most expensive thing on the page and the least read. Not
 * running it takes 20 concurrent renders from 4,815 ms to 1,481 ms and 60 from
 * 17,492 ms to 4,634 ms.
 *
 * STREAMING IT WAS MEASURED AND REFUSED (SR-25). A Suspense island leaves the
 * query running and competing for the same connections, so it moves the wait
 * rather than removing it: 13% WORSE at 20 concurrent and only 19% better at
 * 60. That is SR-20's finding one layer up.
 *
 * A SEGMENT `loading.tsx` IS STILL REFUSED and this does not revisit it. See
 * `app/patients/page.tsx`: one was added under PERF-02 and turned
 * `/patients/[id]`'s `notFound()` into a streamed 200.
 *
 * ==========================================================================
 * KEYED ON FOUR PRIMITIVES, NOT ON THE CONTEXT OBJECT
 * ==========================================================================
 * The same reasoning `viewer-locations.ts` records: `unstable_cache` serialises
 * its arguments, and a caller that builds a fresh `RequestContext` must still
 * hit. `RequestContext` is exactly three strings, so all three are passed
 * flat, plus the location filter, which changes the answer.
 *
 * THE ROLE IS IN THE KEY BECAUSE IT IS IN THE ANSWER. `scopeConditions` branches
 * on it and RLS narrows on it, so two roles see different totals. A key without
 * the role would serve one role's numbers to another.
 *
 * ==========================================================================
 * WHAT IS STALE, AND FOR HOW LONG
 * ==========================================================================
 * Sixty seconds, and the tag is dropped by every patient mutation
 * (`revalidatePatient`), so a receptionist who adds or removes a patient sees
 * `total` move immediately.
 *
 * APPOINTMENT MUTATIONS ARE NOT INVALIDATED AND THAT IS A KNOWN WINDOW, stated
 * here rather than discovered later: `seenThisMonth`, `withUpcoming` and
 * `inRecoveryWindow` all move on appointment events, so booking or cancelling
 * can leave those three up to 60 seconds behind. SR-25 named patient create and
 * delete; widening it to the appointment paths is a separate ruling, and the
 * three numbers concerned describe the whole clinic rather than the viewer's own
 * last action, so nobody is watching one of them change.
 */
const fetchPatientListStats = unstable_cache(
  async (
    tenantId: string,
    role: RequestContext["role"],
    userId: string,
    locationId: string | null,
  ): Promise<PatientListStats> =>
    getPatientListStats(locationId, { tenantId, role, userId }),
  ["patients-stat-strip-v1"],
  { revalidate: 60, tags: [PATIENT_STATS_TAG] },
);

/**
 * The stat strip for the page, served from a 60-second cache.
 *
 * `assertCan` runs HERE, before the cache is consulted, and that ordering is
 * load-bearing: a cache hit does not execute the function it cached, so a
 * capability check living inside would be skipped for every hit after the first.
 * Authorization outside, data inside.
 */
export async function getCachedPatientListStats(
  locationId: string | null,
  ctx: RequestContext,
): Promise<PatientListStats> {
  assertCan(ctx.role, "patients:read");
  return fetchPatientListStats(ctx.tenantId, ctx.role, ctx.userId, locationId);
}

/** Locations for the filter select, restricted to the viewer's own scope. */
export async function listFilterLocations(
  ctxInput?: RequestContext,
): Promise<{ id: string; name: string }[]> {
  const ctx = ctxInput ?? (await requireRequestContext());
  assertCan(ctx.role, "patients:read");
  const locIds = await viewerLocationScope(ctx);
  return runScoped(ctx, (tx) =>
    tx
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(
        locIds
          ? and(eq(locations.isActive, true), inArray(locations.id, locIds))
          : eq(locations.isActive, true),
      )
      .orderBy(asc(locations.name)),
  );
}

export const PATIENTS_PAGE_SIZE = PAGE_SIZE;
export const PATIENTS_MAX_PAGE_SIZE = MAX_PAGE_SIZE;
