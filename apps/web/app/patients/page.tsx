import { GlassPanel } from "@osteojp/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestContext } from "../../lib/auth/context";
import { s } from "../../lib/i18n";
import { formatPatientNumber } from "../../lib/patients/format";
import {
  getPatientListStats,
  listFilterLocations,
  listPatientsPage,
  type PatientListFilters,
  type PatientSort,
  type SortDirection,
} from "../../lib/patients/list-queries";
import { PatientsFilterBar } from "./_components/patients-filter-bar";
import { PatientsTable, type PatientRowView } from "./_components/patients-table";

export const dynamic = "force-dynamic";

/**
 * UX-01 - Utentes, the working list. Owner request, shape decided in dispatch.
 *
 * ==========================================================================
 * A SERVER COMPONENT, AND THE TWO CLIENT PIECES ARE THE TWO THAT MUST BE
 * ==========================================================================
 * The filter bar owns controlled inputs; the table takes `onSortChange`. Every
 * other thing on this screen - the four statistics, the seven columns, the
 * ordering, the paging, the empty state - is computed on the server and arrives
 * as text.
 *
 * NO SEGMENT-LEVEL loading.tsx ON THIS ROUTE, EVER. It would wrap the whole
 * /patients subtree including /patients/[id] in a Suspense boundary, turning
 * [id]'s notFound() 404 into a streamed 200 and breaking the cross-tenant
 * guardrail. PROVEN 2026-08-30: one was added under PERF-02 and shard 2 went red
 * on exactly patients.spec.ts:288 and isolation-therapist.spec.ts:44, both
 * "expected 404, received 200". The file was removed. This paragraph is the
 * spec, not a warning.
 *
 * ==========================================================================
 * DENSITY IS TIGHT ON PURPOSE
 * ==========================================================================
 * 8,400 rows and a receptionist with a telephone in one hand. The stat strip is
 * four numbers on one line, the filter bar is one row, and the table gets the
 * rest. It is a working tool, not a brochure.
 */

const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Lisbon",
};

/**
 * FORMATTED ON THE SERVER, IN Europe/Lisbon, and handed over as a string.
 *
 * A Date formatted in the browser renders in the BROWSER's timezone. For a
 * clinic in Lisbon read on a laptop still set to another zone that is wrong by
 * an hour twice a year and wrong by a day at the edges - silently, because a
 * date is always plausible. /recuperacao settled this; the same rule applies.
 */
function day(d: Date | null, fallback: string): string {
  if (!d) return fallback;
  return d.toLocaleDateString("pt-PT", DATE_FMT);
}

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function parseFilters(sp: Record<string, string | string[] | undefined>): PatientListFilters {
  const sortRaw = firstParam(sp.sort);
  const dirRaw = firstParam(sp.dir);
  // An unknown sort key falls back to name rather than reaching the query. The
  // value comes from a URL, so it is user input even when the UI only ever
  // writes two of them.
  const sort: PatientSort = sortRaw === "lastVisit" ? "lastVisit" : "name";
  const dir: SortDirection = dirRaw === "desc" ? "desc" : "asc";
  const pageRaw = Number(firstParam(sp.page) ?? "1");
  return {
    q: (firstParam(sp.q) ?? "").trim(),
    locationId: firstParam(sp.location),
    upcomingOnly: firstParam(sp.upcoming) === "1",
    sort,
    dir,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card flex flex-col gap-0.5 px-4 py-3">
      <span className="text-xs font-medium text-v2-text-secondary">{label}</span>
      <span className="text-xl font-semibold tabular-nums text-v2-text-primary">
        {new Intl.NumberFormat("pt-PT").format(value)}
      </span>
    </div>
  );
}

const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

const pageLink =
  "inline-flex h-9 items-center rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const filters = parseFilters(sp);

  // Three reads, one round trip each, in parallel. They are independent: the
  // stats describe the viewer's whole scope and do not narrow with the search
  // box, so a receptionist can see "42 in the recovery window" while looking at
  // one of them.
  const [page, stats, locations] = await Promise.all([
    listPatientsPage(filters, ctx),
    getPatientListStats(filters.locationId, ctx),
    listFilterLocations(ctx),
  ]);

  const rows: PatientRowView[] = page.rows.map((r) => ({
    id: r.id,
    number: r.patientNumber ? formatPatientNumber(r.patientNumber) : "—",
    fullName: r.fullName,
    nif: r.nif ?? "—",
    phone: r.phone ?? "—",
    location: r.locationName ?? "—",
    lastVisit: day(r.lastVisitAt, s["patients.neverSeen"]),
    nextAppointment: day(r.nextAppointmentAt, s["patients.noneScheduled"]),
    hasUpcoming: r.nextAppointmentAt !== null,
  }));

  const filtered = Boolean(filters.q || filters.locationId || filters.upcomingOnly);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (filters.q) u.set("q", filters.q);
    if (filters.locationId) u.set("location", filters.locationId);
    if (filters.upcomingOnly) u.set("upcoming", "1");
    if (filters.sort !== "name") u.set("sort", filters.sort);
    if (filters.dir !== "asc") u.set("dir", filters.dir);
    if (p > 1) u.set("page", String(p));
    return u.size ? `/patients?${u}` : "/patients";
  };

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-v2-text-primary">{s["patients.title"]}</h1>
          <p className="mt-1 text-sm text-v2-text-secondary">{s["patients.subtitle"]}</p>
        </div>
        <Link href="/patients/new" className={primaryLink}>
          <Plus aria-hidden="true" className="size-4" />
          {s["patients.new"]}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={s["patients.statTotal"]} value={stats.total} />
        <Stat label={s["patients.statSeenThisMonth"]} value={stats.seenThisMonth} />
        <Stat label={s["patients.statWithUpcoming"]} value={stats.withUpcoming} />
        <Stat label={s["patients.statInRecovery"]} value={stats.inRecoveryWindow} />
      </div>

      <PatientsFilterBar initialQuery={filters.q} locations={locations} />

      <GlassPanel>
        <PatientsTable rows={rows} sort={filters.sort} dir={filters.dir} filtered={filtered} />
      </GlassPanel>

      <div className="flex items-center justify-between gap-3 text-sm text-v2-text-secondary">
        <span className="tabular-nums">
          {new Intl.NumberFormat("pt-PT").format(page.total)} {s["patients.resultsCount"]}
        </span>
        {page.pageCount > 1 ? (
          <div className="flex items-center gap-2">
            {page.page > 1 ? (
              <Link href={qs(page.page - 1)} className={pageLink} rel="prev">
                {s["patients.pagePrev"]}
              </Link>
            ) : null}
            <span className="tabular-nums">
              {page.page} {s["patients.pageOf"]} {page.pageCount}
            </span>
            {page.page < page.pageCount ? (
              <Link href={qs(page.page + 1)} className={pageLink} rel="next">
                {s["patients.pageNext"]}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
