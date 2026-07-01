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
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode } from "react";

import type { Capability } from "@osteojp/auth";

import { getRequestContext, runScoped } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { s } from "@/lib/i18n";
import { activePatientsOnly } from "@/lib/patients/filters";
import { listAppointments } from "@/lib/scheduling/data";
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
import { getMonthlyRevenue } from "@/lib/invoices/queries";
import { getQuickNotes } from "@/lib/dashboard/notes";

import { DateJump } from "./date-jump";
import { NotasRapidas } from "./notas-rapidas";

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

const iconNav =
  "inline-flex size-10 items-center justify-center rounded-v2 border border-v2-border bg-v2-surface text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const ghostNav =
  "inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

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

  // Fire all widget queries in parallel; a failure in one degrades only that
  // widget rather than error-boundarying the entire dashboard.
  const [countResult, upcomingResult, recResult, revenueResult, weekResult, notesResult] =
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
      // 4. Monthly revenue
      getMonthlyRevenue(
        ctx,
        lisbonMidnightUtc(mStart),
        lisbonMidnightUtc(addMonths(mStart, 1)),
      ),
      // 5. Weekly appointments (Resumo semanal chart)
      canAppointments
        ? listAppointments(ctx, {
            startUtc: weekStartUtc,
            endUtc: lisbonMidnightUtc(addDays(weekStartDate, 7)),
          })
        : Promise.resolve([] as AgendaAppointment[]),
      // 6. Quick notes
      getQuickNotes(ctx),
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

  // KPI 4 — Receita (mês)
  const monthRevenueCents = revenueResult.status === "fulfilled" ? revenueResult.value : null;
  const revenueDisplay =
    monthRevenueCents !== null ? formatEur(monthRevenueCents) : s["dashboard.kpiNoData"];

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
  const initialNotes = notesResult.status === "fulfilled" ? notesResult.value : "";

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
  ];
  const visibleTiles = tiles.filter((t) => can(ctx.role, t.capability));

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
        <div className="flex items-center gap-2">
          <Link href={`/dashboard?date=${addDays(date, -1)}`} aria-label={s["dashboard.prevDay"]} className={iconNav}>
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <DateJump date={date} label={s["dashboard.pickDate"]} />
          <Link href={`/dashboard?date=${today}`} className={ghostNav}>
            {s["agenda.today"]}
          </Link>
          <Link href={`/dashboard?date=${addDays(date, 1)}`} aria-label={s["dashboard.nextDay"]} className={iconNav}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassKpiCard accent="green" icon={<Users size={20} strokeWidth={1.75} />} label={s["dashboard.kpiActivePatients"]} value={countResult.status === "rejected" ? s["dashboard.kpiNoData"] : patientCount} caption={patientsCaption} />
        {canAppointments && (
          <GlassKpiCard accent="blue" icon={<Calendar size={20} strokeWidth={1.75} />} label={s["dashboard.kpiTodayAppointments"]} value={upcomingResult.status === "rejected" ? s["dashboard.kpiNoData"] : todayCount} caption={nextCaption} />
        )}
        {canClinical && (
          <GlassKpiCard accent="lavender" icon={<ClipboardList size={20} strokeWidth={1.75} />} label={s["dashboard.kpiNewRecords"]} value={recResult.status === "rejected" ? s["dashboard.kpiNoData"] : newRecords} caption={s["dashboard.kpiThisWeek"]} />
        )}
        {/* Receita (mês) — sum of issued + paid invoices for the current month. */}
        <GlassKpiCard accent="gold" icon={<TrendingUp size={20} strokeWidth={1.75} />} label={s["dashboard.kpiRevenue"]} value={revenueDisplay} />
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Resumo semanal — Mon–Sun appointment counts for the current week. */}
        <GlassPanel title={s["dashboard.weeklySummary"]}>
          <ResumoChart
            data={weeklyData}
            labels={weekLabels}
            emptyLabel={s["dashboard.notEnoughData"]}
            ariaLabel={s["dashboard.weeklyChartLabel"]}
          />
        </GlassPanel>
      </div>

      {/* Notas rápidas — persisted to tenants.settings.notes. */}
      <GlassCard title={s["dashboard.notes"]}>
        <NotasRapidas initialNotes={initialNotes} />
      </GlassCard>
    </main>
  );
}
