import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import {
  followupLastAttendanceClause,
  followupNoFutureBookingClause,
  locations,
  patients,
} from "@osteojp/db";
import { runScoped, requireRequestContext, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope, therapistPatientScope } from "@/lib/patients/scope";
import { activePatientsOnly } from "@/lib/patients/filters";
import { escapeLike, parseSearch } from "@/lib/patients/validation";
import { followupWindow } from "@/lib/followup/window";

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
 * The four numbers above the filter bar.
 *
 * FOUR COUNTS IN ONE ROUND TRIP, not four queries: every one is a scalar
 * subquery in a single SELECT, so the page pays one transaction rather than
 * four. All four are scoped by the same role/location rules as the list, so the
 * strip can never report a number the table below it cannot account for.
 *
 * "IN THE RECOVERY WINDOW" REUSES THE RECUPERACAO PREDICATE ITSELF -
 * `followupLastAttendanceClause` and `followupNoFutureBookingClause` from
 * @osteojp/db, the exact clauses /recuperacao selects on. A second definition
 * here would be a number that drifts from the page it claims to summarise, and
 * that package exists precisely so there is one.
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

  const bind = (clause: string): SQL =>
    sql.join(
      clause
        .split(/(\$[123])/g)
        .map((part) =>
          part === "$1"
            ? sql`${from.toISOString()}::timestamptz`
            : part === "$2"
              ? sql`${to.toISOString()}::timestamptz`
              : part === "$3"
                ? sql`${now.toISOString()}::timestamptz`
                : sql.raw(part),
        ),
      sql``,
    );

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return runScoped(ctx, async (tx) => {
    const seenThisMonth = sql<number>`(
      SELECT count(*) FROM appointments m
       WHERE (m.patient_id = ${sql.raw(PATIENT_ID)} OR m.patient_2_id = ${sql.raw(PATIENT_ID)})
         AND m.status = 'completed'
         AND m.starts_at >= ${monthStart.toISOString()}::timestamptz) > 0`;

    const hasUpcoming = sql<number>`EXISTS (
      SELECT 1 FROM appointments u
       WHERE (u.patient_id = ${sql.raw(PATIENT_ID)} OR u.patient_2_id = ${sql.raw(PATIENT_ID)})
         AND u.starts_at > ${now.toISOString()}::timestamptz
         AND u.status NOT IN ('cancelled', 'no_show'))`;

    const inWindow = sql<number>`(${bind(followupLastAttendanceClause(PATIENT_ID))}
      AND ${bind(followupNoFutureBookingClause(PATIENT_ID))})`;

    const [row] = await tx
      .select({
        total: count(),
        seenThisMonth: sql<number>`count(*) filter (where ${seenThisMonth})`,
        withUpcoming: sql<number>`count(*) filter (where ${hasUpcoming})`,
        inRecoveryWindow: sql<number>`count(*) filter (where ${inWindow})`,
      })
      .from(patients)
      .where(base);

    return {
      total: Number(row?.total ?? 0),
      seenThisMonth: Number(row?.seenThisMonth ?? 0),
      withUpcoming: Number(row?.withUpcoming ?? 0),
      inRecoveryWindow: Number(row?.inRecoveryWindow ?? 0),
    };
  });
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
