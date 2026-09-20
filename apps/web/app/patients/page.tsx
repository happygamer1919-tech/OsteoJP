import { GlassPanel } from "@osteojp/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestContext } from "../../lib/auth/context";
import { s } from "../../lib/i18n";
import { formatPatientNumber } from "../../lib/patients/format";
import {
  getCachedPatientListStats,
  listFilterLocations,
  listPatientsPage,
  type PatientListFilters,
  type PatientSort,
  type SortDirection,
} from "../../lib/patients/list-queries";
import { Pager } from "../../components/pager.client";
import { PatientsFilterBar } from "./_components/patients-filter-bar";
import { PatientsTable, type PatientRowView } from "./_components/patients-table";
import { TimingPanel } from "../_components/timing-panel";
import { collectFor } from "../../lib/perf/request-timing";
import { shouldMeasure } from "../../lib/perf/audience";

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
  //
  // PERF-timing-admin-stats: the three reads are UNCHANGED and still run in one
  // `Promise.all`. `collectFor` opens a span store around them and nothing else,
  // and ONLY for a principal who may read the result - for anybody else it is
  // `await fn()` and no store exists, so `timed` awaits and returns and this is
  // the same code it was. The measurement must not become the thing measured.
  // ON REQUEST ONLY since 2026-09-19 (owner ruling): `shouldMeasure` is the role
  // AND `?medicao=1`. Without the parameter this is `await fn()` for everybody.
  const measured = await collectFor(shouldMeasure(ctx, sp), async () =>
    Promise.all([
      listPatientsPage(filters, ctx),
      getCachedPatientListStats(filters.locationId, ctx),
      listFilterLocations(ctx),
    ]),
  );
  const [page, stats, locations] = measured.value;

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
  // U1: the canonical query shape for this route, MINUS `page` — the pager adds
  // that itself (and omits it on page 1, so the first page has one spelling).
  // This replaces the old `qs(p)` helper: same params, same omit-when-default
  // rules, expressed once as data rather than once per link.
  const pagerParams: Record<string, string> = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.locationId ? { location: filters.locationId } : {}),
    ...(filters.upcomingOnly ? { upcoming: "1" } : {}),
    ...(filters.sort !== "name" ? { sort: filters.sort } : {}),
    ...(filters.dir !== "asc" ? { dir: filters.dir } : {}),
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

      {/* PLACED FIRST, DIRECTLY UNDER THE TITLE, AND THE REASON IS MEASURED.
          It used to sit at the bottom of the page. On /patients that is below
          8,413 rows of table, and on 2026-09-05 the owner went looking for it
          and did not find it. An instrument nobody can reach is the defect
          AI-02 moved the drift banner onto the reviewer's screen for. It is one
          collapsed line, admin and owner only AND ONLY ON REQUEST since 2026-09-19
          (`?medicao=1`), and it carries id="medicao" so the URL
          /patients?medicao=1#medicao reaches it directly.

          The audience check is already inside `measured`: `spans` exists only
          on the measured arm, so this element cannot be created for a principal
          who was not measured, and for them nothing is serialised into the RSC
          payload at all. Not a hidden panel: an absent one. */}
      {measured.measured ? (
        <TimingPanel spans={measured.spans} serverMs={measured.totalMs} route="/patients" />
      ) : null}

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

      {/* U1: the shared pager replaces the two-link Anterior/Seguinte strip that
          made page 100 ninety-nine clicks away. `pagerParams` is the SAME query
          shape `qs()` builds, minus `page` — the component adds that itself, so
          there is still exactly one definition of this route's canonical URL. */}
      <Pager
        basePath="/patients"
        params={pagerParams}
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
      />
    </main>
  );
}
