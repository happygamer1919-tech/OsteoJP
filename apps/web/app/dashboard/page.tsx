import { can } from "@osteojp/auth";
import { clinicalRecords, patients } from "@osteojp/db";
import {
  GlassCard,
  GlassKpiCard,
  GlassPanel,
  QuickActionTile,
  ResumoChart,
  type V2Accent,
} from "@osteojp/ui";
import { gte, sql } from "drizzle-orm";
import {
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Settings,
  Stethoscope,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode } from "react";

import type { Capability, RequestContext } from "@osteojp/auth";

import { getRequestContext, runScoped } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { s } from "@/lib/i18n";
import { activePatientsOnly } from "@/lib/patients/filters";
import { listAppointments } from "@/lib/scheduling/data";
import { patientLabel } from "@/lib/scheduling/patient-label";
import {
  addDays,
  addMonths,
  formatTimeOfDay,
  lisbonMidnightUtc,
  lisbonParts,
  startOfWeekMonday,
  todayInLisbon,
} from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";
import {
  getMonthlyRevenue,
  listActiveLocations,
  MONTHLY_REVENUE_CAPABILITY,
  type LocationOption,
} from "@/lib/invoices/queries";
import { canChooseRevenueLocation } from "@/lib/invoices/revenue-scope";

import { DateJump } from "./date-jump";
import { NotasRapidas } from "./notas-rapidas";
import { RevenueLocationToggle } from "./revenue-location";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function greetingKey(
  hour: number,
): "dashboard.greeting.morning" | "dashboard.greeting.afternoon" | "dashboard.greeting.evening" {
  if (hour < 12) return "dashboard.greeting.morning";
  if (hour < 19) return "dashboard.greeting.afternoon";
  return "dashboard.greeting.evening";
}

function firstNameFromEmail(email: string | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]+/).filter(Boolean)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

/** Format integer cents as a PT locale EUR string, e.g. 124500 → "1.245,00 €". */
function formatEur(cents: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

/** "2026-06-01" for any date in the same calendar month. */
function monthStart(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

type Kpi = {
  key: string;
  accent: V2Accent;
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  action?: ReactNode;
};

/**
 * T5b: the revenue tile's figure, and the owner's clinic toggle when there is
 * one to offer.
 */
type RevenueTile = {
  cents: number;
  /** The owner's toggle: the clinics it lists and the one chosen (null = all). */
  toggle: { locations: LocationOption[]; value: string | null } | null;
};

/**
 * T5b: read the revenue tile. The clinic scope itself is decided inside
 * getMonthlyRevenue, for every role; this only turns the owner's `?location=`
 * into a clinic the owner can actually choose.
 *
 * OWNER: the requested id is honoured only when it is one of the tenant's
 * ACTIVE clinics, the list the toggle offers (the same list, and the same
 * "active only" rule, as the Faturacao location filter). Anything else (a
 * stale link to a closed clinic, a typo, a non-uuid) falls back to every
 * clinic, so the control and the figure always name the same thing and a bad
 * URL never becomes a database error. The toggle is offered only when there is
 * MORE THAN ONE clinic to choose between: PL-14's rule for every location
 * control on the platform (lib/auth/location-choice.ts).
 *
 * EVERY OTHER ROLE: no toggle and no requested id. getMonthlyRevenue holds an
 * admin or a receptionist to their own clinics whatever the URL says.
 */
async function loadRevenueTile(
  ctx: RequestContext,
  requested: string | null,
  monthStartUtc: Date,
  monthEndUtc: Date,
): Promise<RevenueTile> {
  if (!canChooseRevenueLocation(ctx.role)) {
    return { cents: await getMonthlyRevenue(ctx, monthStartUtc, monthEndUtc), toggle: null };
  }
  const locations = await listActiveLocations(ctx);
  // One clinic or none: nothing to choose, so no toggle, and no hand-typed
  // `?location=` narrows a figure the page offers no control for.
  if (locations.length < 2) {
    return { cents: await getMonthlyRevenue(ctx, monthStartUtc, monthEndUtc), toggle: null };
  }
  const value = requested && locations.some((l) => l.id === requested) ? requested : null;
  const cents = await getMonthlyRevenue(ctx, monthStartUtc, monthEndUtc, { locationId: value });
  return { cents, toggle: { locations, value } };
}

/**
 * DASH-THERAPIST-REVENUE: the KPI row as it was before the revenue gate. Every
 * role that is shown the revenue tile (owner and admin, four tiles; reception,
 * three) keeps this exact class, and no tile of theirs gets a column span: the
 * card's acceptance says those three roles see exactly what they saw.
 * Reception's row therefore still ends in an empty quarter at xl and a lone
 * tile on a half row at md and lg, as it always has; changing that is a
 * separate owner call.
 */
const KPI_GRID_WITH_REVENUE = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4";

/**
 * The row for a role NOT shown the revenue tile (today, only the therapist),
 * by tile count, so taking the tile away leaves no empty column. Such a role
 * has at most three tiles (Pacientes ativos, Marcacoes hoje, Novas fichas).
 * Literal strings, one per count, so Tailwind finds every class in the source.
 */
const KPI_GRID_WITHOUT_REVENUE: Record<number, string> = {
  1: "grid grid-cols-1 gap-4",
  2: "grid grid-cols-1 gap-4 md:grid-cols-2",
  3: "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3",
};

// `max-sm:shrink-0`: below `sm` the date row may shrink to the screen and only
// the date field gives way (see the row below). Without it the previous and
// next buttons were squeezed to about 28px at 360 to make that room.
const iconNav =
  "inline-flex size-10 items-center justify-center rounded-v2 border border-v2-border bg-v2-surface text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 max-sm:shrink-0";
const ghostNav =
  "inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 max-sm:shrink-0";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const raw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const today = todayInLisbon();
  const date = raw && DATE_RE.test(raw) ? raw : today;
  // T5b: the owner's clinic choice for the revenue tile. Read for every role
  // and honoured only for the owner (loadRevenueTile, then getMonthlyRevenue).
  const rawLocation = Array.isArray(sp.location) ? sp.location[0] : sp.location;
  const requestedLocation = rawLocation ? rawLocation : null;

  const now = new Date();
  const greeting = s[greetingKey(lisbonParts(now).hour)];

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const email =
    typeof claims?.claims?.email === "string" ? claims.claims.email : undefined;
  const firstName = firstNameFromEmail(email);

  const weekStartDate = startOfWeekMonday(today);
  const weekStartUtc = lisbonMidnightUtc(weekStartDate);
  const mStart = monthStart(today);

  const canAppointments = can(ctx.role, "appointments:read");
  const canClinical = can(ctx.role, "clinical_records:read");
  // DASH-THERAPIST-REVENUE: the clinic's monthly revenue is for the roles that
  // work Faturacao (owner, admin, reception). A therapist's Inicio showed the
  // whole clinic's figure, because the invoices RLS is tenant-wide and nothing
  // here asked. The query is not even made for them; getMonthlyRevenue asserts
  // the same capability, so a missed gate here would throw, not leak. Why it is
  // not `invoices:read`: MONTHLY_REVENUE_CAPABILITY's comment.
  const canRevenue = can(ctx.role, MONTHLY_REVENUE_CAPABILITY);

  // Fire all widget queries in parallel; a failure in one degrades only that
  // widget rather than error-boundarying the entire dashboard.
  const [countResult, upcomingResult, recResult, revenueResult, weekResult] =
    await Promise.allSettled([
      // 1. Active patients + this-week delta
      runScoped(ctx, (tx) =>
        tx
          .select({
            total: sql<number>`count(*)::int`,
            week: sql<number>`count(*) filter (where ${patients.createdAt} >= ${weekStartUtc.toISOString()}::timestamptz)::int`,
          })
          .from(patients)
          .where(activePatientsOnly),
      ),
      // 2. Upcoming appointments (KPI 2)
      canAppointments
        ? listAppointments(ctx, {
            startUtc: lisbonMidnightUtc(today),
            endUtc: lisbonMidnightUtc(addDays(today, 7)),
          })
        : Promise.resolve([] as AgendaAppointment[]),
      // 3. Clinical records count
      canClinical
        ? runScoped(ctx, (tx) =>
            tx
              .select({ count: sql<number>`count(*)::int` })
              .from(clinicalRecords)
              .where(gte(clinicalRecords.createdAt, weekStartUtc)),
          )
        : Promise.resolve([] as Array<{ count: number }>),
      // 4. Monthly revenue (DASH-THERAPIST-REVENUE: never read without the
      //    capability; T5b: held to the viewer's clinics inside getMonthlyRevenue)
      canRevenue
        ? loadRevenueTile(
            ctx,
            requestedLocation,
            lisbonMidnightUtc(mStart),
            lisbonMidnightUtc(addMonths(mStart, 1)),
          )
        : Promise.resolve(null),
      // 5. Weekly appointments (Resumo semanal chart)
      canAppointments
        ? listAppointments(ctx, {
            startUtc: weekStartUtc,
            endUtc: lisbonMidnightUtc(addDays(weekStartDate, 7)),
          })
        : Promise.resolve([] as AgendaAppointment[]),
    ]);

  // KPI 1 — active patients
  const patientRows = countResult.status === "fulfilled" ? countResult.value : null;
  const patientCount = patientRows?.[0]?.total ?? 0;
  const newPatientsThisWeek = patientRows?.[0]?.week ?? 0;
  const patientsCaption =
    countResult.status === "fulfilled" && newPatientsThisWeek > 0
      ? `+${newPatientsThisWeek} ${s["dashboard.thisWeekLower"]}`
      : undefined;

  // KPI 2 — rolling 7-day window from today.
  const upcomingAppointments =
    upcomingResult.status === "fulfilled" ? upcomingResult.value : [];
  const active = upcomingAppointments
    .filter((a) => a.status !== "cancelled")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const todayCount = active.filter(
    (a) => lisbonParts(new Date(a.startsAt)).date === date,
  ).length;
  const next =
    date === today
      ? active.find((a) => new Date(a.startsAt).getTime() >= now.getTime())
      : undefined;
  const nextCaption = next
    ? `${s["dashboard.kpiNext"]}: ${formatTimeOfDay(new Date(next.startsAt))}`
    : undefined;

  // KPI 3 — new clinical records this week
  const recRows = recResult.status === "fulfilled" ? recResult.value : null;
  const newRecords = recRows?.[0]?.count ?? 0;

  // KPI 4: Receita (mês), sum of issued + paid invoices for the current month.
  // Only built for a role holding the capability; for any other role there is
  // no figure, no tile and no "Sem dados" either.
  const revenueTile = revenueResult.status === "fulfilled" ? revenueResult.value : null;
  const revenueDisplay =
    revenueTile !== null ? formatEur(revenueTile.cents) : s["dashboard.kpiNoData"];
  // T5b: the owner's clinic toggle, under the figure. Only loadRevenueTile
  // builds one, and only for the owner.
  const revenueToggle = revenueTile?.toggle ? (
    <RevenueLocationToggle
      locations={revenueTile.toggle.locations}
      value={revenueTile.toggle.value}
      date={raw && DATE_RE.test(raw) ? raw : null}
    />
  ) : undefined;
  // The chosen clinic rides along on the day navigation, so moving the day
  // does not quietly put the owner's figure back on every clinic.
  const chosenLocation = revenueTile?.toggle?.value ?? null;
  const dayHref = (d: string) =>
    chosenLocation
      ? `/dashboard?date=${d}&location=${encodeURIComponent(chosenLocation)}`
      : `/dashboard?date=${d}`;

  const kpis: Kpi[] = [
    { key: "patients", accent: "green", icon: <Users size={20} strokeWidth={1.75} />, label: s["dashboard.kpiActivePatients"], value: countResult.status === "rejected" ? s["dashboard.kpiNoData"] : patientCount, caption: patientsCaption },
    ...(canAppointments
      ? [{ key: "today", accent: "blue", icon: <Calendar size={20} strokeWidth={1.75} />, label: s["dashboard.kpiTodayAppointments"], value: upcomingResult.status === "rejected" ? s["dashboard.kpiNoData"] : todayCount, caption: nextCaption } satisfies Kpi]
      : []),
    ...(canClinical
      ? [{ key: "records", accent: "lavender", icon: <ClipboardList size={20} strokeWidth={1.75} />, label: s["dashboard.kpiNewRecords"], value: recResult.status === "rejected" ? s["dashboard.kpiNoData"] : newRecords, caption: s["dashboard.kpiThisWeek"] } satisfies Kpi]
      : []),
    ...(canRevenue
      ? [{ key: "revenue", accent: "gold", icon: <TrendingUp size={20} strokeWidth={1.75} />, label: s["dashboard.kpiRevenue"], value: revenueDisplay, action: revenueToggle } satisfies Kpi]
      : []),
  ];
  // Roles shown the revenue tile keep the row they had (KPI_GRID_WITH_REVENUE).
  // For the others the grid follows the tile count, and three tiles in two
  // columns (md and lg) would leave the third alone on a half row, so it takes
  // the whole row there, and one column again at xl.
  const kpiGrid = canRevenue
    ? KPI_GRID_WITH_REVENUE
    : (KPI_GRID_WITHOUT_REVENUE[kpis.length] ?? KPI_GRID_WITH_REVENUE);
  const lastKpiSpan = !canRevenue && kpis.length === 3 ? "md:col-span-2 xl:col-span-1" : undefined;

  // Resumo semanal — appointment counts grouped by calendar day (Mon–Sun).
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  let weeklyData: number[] | undefined;
  if (canAppointments && weekResult.status === "fulfilled") {
    const weekAppointments = weekResult.value;
    weeklyData = weekDates.map(
      (d) =>
        weekAppointments.filter(
          (a) => a.status !== "cancelled" && lisbonParts(new Date(a.startsAt)).date === d,
        ).length,
    );
  }

  // Weekday labels for the chart x-axis: "Seg"–"Dom" derived from the actual
  // date strings so the order is always correct regardless of locale.
  const weekLabels = weekDates.map((d) =>
    new Date(lisbonMidnightUtc(d))
      .toLocaleDateString("pt-PT", { weekday: "short", timeZone: "Europe/Lisbon" })
      .replace(".", "")
      .replace(/^(.)/, (c) => c.toUpperCase()),
  );

  // Notas rápidas — empty string fallback when the quick_notes table is unavailable.

  // Acessos rápidos — role-gated.
  const tiles: Array<{
    label: ReactNode;
    icon: LucideIcon;
    href: string;
    accent: V2Accent;
    capability: Capability;
  }> = [
    { label: s["dashboard.tile.newAppointment"], icon: CalendarPlus, href: `/agenda?view=day&date=${today}`, accent: "green", capability: "appointments:write" },
    { label: s["dashboard.tile.newPatient"], icon: UserPlus, href: "/patients/new", accent: "blue", capability: "patients:write" },
    { label: s["dashboard.tile.clinicalRecord"], icon: FileText, href: "/clinical/new", accent: "lavender", capability: "clinical_records:author" },
    { label: s["dashboard.tile.viewAgenda"], icon: Calendar, href: "/agenda", accent: "blue", capability: "appointments:read" },
    { label: s["dashboard.tile.admin"], icon: Settings, href: "/admin", accent: "gold", capability: "settings:read" },
    // W4-20 — sixth tile: Iniciar consulta, linking to the start-consultation
    // recording screen (/consultation), which had NO nav entry (owner QA). Gated
    // on the same capability that page enforces (clinical_records:author → owner +
    // therapist), so the tile never leads to a redirect. Replaces the W4-18
    // Revisão Consulta tile, which stays reachable via its left-nav entry.
    { label: s["dashboard.tile.startConsultation"], icon: Stethoscope, href: "/consultation", accent: "lavender", capability: "clinical_records:author" },
  ];
  const visibleTiles = tiles.filter((t) => can(ctx.role, t.capability));

  // W4-18 — Próximas marcações: the viewed day's upcoming appointments (time,
  // patient, therapist), reusing the already-fetched `active` list (role-scoped
  // via listAppointments). No new query, no schema. When viewing today, only
  // appointments still ahead of now; a past/future viewed date shows that day's
  // appointments that fall inside the fetched today→+7 window.
  const upcomingToday = active
    .filter((a) => {
      if (lisbonParts(new Date(a.startsAt)).date !== date) return false;
      return date === today ? new Date(a.startsAt).getTime() >= now.getTime() : true;
    })
    .slice(0, 6);

  return (
    <main className="flex flex-col gap-8">
      {/* Greeting + date navigation */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-v2-greeting text-v2-text-primary">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-v2-text-secondary">{s["dashboard.subheading"]}</p>
        </div>
        {/* AGENDA-MOBILE-WEEK, Q-B6-11 (answered: no staff page scrolls
            sideways at 390 or 360). This row did not wrap, and the date
            field is as wide as its text input's default width, so on a phone
            the row ran past the screen: CI measured it ending at 448px at 390.
            Below `sm` the row may shrink to the line (`min-w-0`) and only the
            date field gives way (DateJump's `min-w-0`); the three buttons
            keep their size. Measured in local Chromium on the page, CSS and
            Inter files CI captured: the field's text box is 129px at 390 and
            99px at 360 for a date about 80px wide. At 640 and up nothing
            changes. */}
        <div data-testid="dashboard-date-nav" className="flex items-center gap-2 max-sm:min-w-0">
          <Link href={dayHref(addDays(date, -1))} aria-label={s["dashboard.prevDay"]} className={iconNav}>
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <DateJump date={date} label={s["dashboard.pickDate"]} location={chosenLocation} />
          <Link href={dayHref(today)} className={ghostNav}>
            {s["agenda.today"]}
          </Link>
          <Link href={dayHref(addDays(date, 1))} aria-label={s["dashboard.nextDay"]} className={iconNav}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* KPI row. Unchanged for every role shown the revenue tile; for a role
          without it the columns follow the number of tiles (kpiGrid above). */}
      <div data-testid="dashboard-kpis" className={kpiGrid}>
        {kpis.map((k, i) => (
          <GlassKpiCard
            key={k.key}
            accent={k.accent}
            icon={k.icon}
            label={k.label}
            value={k.value}
            caption={k.caption}
            action={k.action}
            className={i === kpis.length - 1 ? lastKpiSpan : undefined}
          />
        ))}
      </div>

      {/* Acessos rápidos */}
      {visibleTiles.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl text-v2-text-primary">{s["dashboard.acessosRapidos"]}</h2>
          <div className="flex flex-wrap gap-4">
            {visibleTiles.map((t) => (
              <QuickActionTile key={t.href + String(t.label)} icon={<t.icon size={28} strokeWidth={1.75} />} label={t.label} href={t.href} accent={t.accent} />
            ))}
          </div>
        </section>
      )}

      {/* Resumo semanal — full-width Mon–Sun appointment counts (W4-18). */}
      <GlassPanel title={s["dashboard.weeklySummary"]}>
        <ResumoChart
          data={weeklyData}
          labels={weekLabels}
          emptyLabel={s["dashboard.notEnoughData"]}
          ariaLabel={s["dashboard.weeklyChartLabel"]}
        />
      </GlassPanel>

      {/* Lower row (W4-18): Próximas marcações fills the former dead zone beside
          the untouched Notas rápidas card. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassPanel title={s["dashboard.upcomingTitle"]}>
          {!canAppointments || upcomingToday.length === 0 ? (
            <p className="text-sm text-v2-text-secondary">{s["dashboard.upcomingEmpty"]}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-v2-border">
              {upcomingToday.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="font-medium tabular-nums text-v2-text-primary">
                    {formatTimeOfDay(new Date(a.startsAt))}
                  </span>
                  {/* SEC-appointment-vanishes-with-patient-scope: this list and
                      the KPI above it are the surfaces where the inner join
                      actually bit. The dashboard passes no practitioner and no
                      location, and a therapist has no location scope, so an
                      appointment they CREATED for a patient they have not
                      treated was dropped and the count read low. */}
                  <span className="text-sm text-v2-text-primary">
                    {patientLabel(a.patientName)}
                  </span>
                  <span className="text-sm text-v2-text-secondary">· {a.practitionerName}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        {/* Notas rápidas (W12-13) — appends to the unified appointment_notes store,
            in two modes: a patient-level note, or a note on one specific
            appointment (chosen via the appointment selector). */}
        <GlassCard title={s["dashboard.notes"]}>
          <NotasRapidas />
        </GlassCard>
      </div>
    </main>
  );
}
