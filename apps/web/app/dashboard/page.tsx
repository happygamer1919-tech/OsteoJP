import { can } from "@osteojp/auth";
import { clinicalRecords, patients } from "@osteojp/db";
import {
  GlassCard,
  GlassKpiCard,
  GlassPanel,
  QuickActionTile,
  ResumoChart,
  StatusBadge,
  type AppointmentTone,
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
  Plus,
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
  formatTimeOfDay,
  lisbonMidnightUtc,
  lisbonParts,
  startOfWeekMonday,
  todayInLisbon,
} from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { DateJump } from "./date-jump";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Appointment status → StatusBadge tone (SPEC-v2-dashboard §4.1: green Confirmada,
// orange Pendente). completed reads as done (green); cancelled/no_show neutral —
// the restrained tones per SPEC-v2-foundation §10 (no red flood).
const STATUS_TONE: Record<AgendaAppointment["status"], AppointmentTone> = {
  scheduled: "pending",
  confirmed: "confirmed",
  completed: "confirmed",
  cancelled: "cancelled",
  no_show: "cancelled",
};
const STATUS_KEY = {
  scheduled: "appointment.status.scheduled",
  confirmed: "appointment.status.confirmed",
  completed: "appointment.status.completed",
  cancelled: "appointment.status.cancelled",
  no_show: "appointment.status.no_show",
} as const;

// Greeting time-of-day (Lisbon hour). No exclamation, per brand-voice.
function greetingKey(
  hour: number,
): "dashboard.greeting.morning" | "dashboard.greeting.afternoon" | "dashboard.greeting.evening" {
  if (hour < 12) return "dashboard.greeting.morning";
  if (hour < 19) return "dashboard.greeting.afternoon";
  return "dashboard.greeting.evening";
}

// First name from the session email (the only identity in the JWT — no name
// claim, no profile fetch; same derivation as the AppShell cluster).
function firstNameFromEmail(email: string | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]+/).filter(Boolean)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

const iconNav =
  "inline-flex size-10 items-center justify-center rounded-v2 border border-v2-border bg-v2-surface text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const ghostNav =
  "inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
// Primary action fills with Wellness Green (SPEC §3.2); green-700 + white text
// clears AA (≈4.75:1).
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/**
 * Dashboard (Início) — SPEC-v2-dashboard. v2 glass system on /dashboard.
 * Presentation only: consumes the existing patient / appointment / clinical-
 * record queries (tenant + role scoped via runScoped + RLS). Receita, Resumo
 * semanal and Notas rápidas are honest placeholders (V1.1 backend tickets).
 */
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

  const weekStartUtc = lisbonMidnightUtc(startOfWeekMonday(today));

  // KPI 1 — active patients + the "+N esta semana" delta (active patients
  // created this week). Both existing-table scoped counts.
  const countRows = await runScoped(ctx, (tx) =>
    tx
      .select({
        total: sql<number>`count(*)::int`,
        week: sql<number>`count(*) filter (where ${patients.createdAt} >= ${weekStartUtc})::int`,
      })
      .from(patients)
      .where(activePatientsOnly),
  );
  const patientCount = countRows[0]?.total ?? 0;
  const newPatientsThisWeek = countRows[0]?.week ?? 0;
  const patientsCaption =
    newPatientsThisWeek > 0
      ? `+${newPatientsThisWeek} ${s["dashboard.thisWeekLower"]}`
      : undefined;

  // KPI 2 + Próximas marcações — appointments on the selected day (existing,
  // RLS + role scoped). Every staff role has appointments:read.
  const canAppointments = can(ctx.role, "appointments:read");
  const appointments = canAppointments
    ? await listAppointments(ctx, {
        startUtc: lisbonMidnightUtc(date),
        endUtc: lisbonMidnightUtc(addDays(date, 1)),
      })
    : [];
  const active = appointments
    .filter((a) => a.status !== "cancelled")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const todayCount = active.length;
  // "Próxima: HH:MM" only when viewing today (relative to now).
  const next =
    date === today
      ? active.find((a) => new Date(a.startsAt).getTime() >= now.getTime())
      : undefined;
  const nextCaption = next
    ? `${s["dashboard.kpiNext"]}: ${formatTimeOfDay(new Date(next.startsAt))}`
    : undefined;

  // KPI 3 — new clinical records this week (gated; hidden for reception, which
  // has no clinical_records access — RLS denies it too).
  const canClinical = can(ctx.role, "clinical_records:read");
  let newRecords = 0;
  if (canClinical) {
    const recRows = await runScoped(ctx, (tx) =>
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(clinicalRecords)
        .where(gte(clinicalRecords.createdAt, weekStartUtc)),
    );
    newRecords = recRows[0]?.count ?? 0;
  }

  // Acessos rápidos — five tiles, role-gated; the grid reflows to the visible set.
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
        <GlassKpiCard accent="green" icon={<Users size={20} strokeWidth={1.75} />} label={s["dashboard.kpiActivePatients"]} value={patientCount} caption={patientsCaption} />
        {canAppointments && (
          <GlassKpiCard accent="blue" icon={<Calendar size={20} strokeWidth={1.75} />} label={s["dashboard.kpiTodayAppointments"]} value={todayCount} caption={nextCaption} />
        )}
        {canClinical && (
          <GlassKpiCard accent="lavender" icon={<ClipboardList size={20} strokeWidth={1.75} />} label={s["dashboard.kpiNewRecords"]} value={newRecords} caption={s["dashboard.kpiThisWeek"]} />
        )}
        {/* Receita — placeholder until revenue aggregation lands (V1.1). */}
        <GlassKpiCard accent="gold" icon={<TrendingUp size={20} strokeWidth={1.75} />} label={s["dashboard.kpiRevenue"]} value="—" error={s["dashboard.kpiNoData"]} />
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

      {/* Two panels: Próximas marcações + Resumo semanal */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canAppointments && (
          <GlassPanel title={s["dashboard.panelUpcoming"]} footerHref="/agenda" footerLabel={s["dashboard.seeFullAgenda"]}>
            {active.length === 0 ? (
              <div className="flex flex-col items-start gap-4 py-6">
                <p className="text-sm text-v2-text-secondary">{s["dashboard.noAppointmentsToday"]}</p>
                <Link href={`/agenda?view=day&date=${today}`} className={primaryBtn}>
                  <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                  {s["dashboard.tile.newAppointment"]}
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-v2-border">
                {active.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-sm font-medium text-v2-text-primary">{formatTimeOfDay(new Date(a.startsAt))}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-v2-text-primary">{a.patientName}</span>
                        <span className="truncate text-xs text-v2-text-secondary">{a.serviceName ?? "—"}</span>
                      </span>
                    </div>
                    <StatusBadge tone={STATUS_TONE[a.status]}>{s[STATUS_KEY[a.status]]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>
        )}

        {/* Resumo semanal — placeholder until weekly counts are fetched (V1.1). */}
        <GlassPanel title={s["dashboard.weeklySummary"]}>
          <ResumoChart emptyLabel={s["dashboard.notEnoughData"]} ariaLabel={s["dashboard.weeklyChartLabel"]} />
        </GlassPanel>
      </div>

      {/* Notas rápidas — placeholder until notes persistence lands (V1.1). */}
      <GlassCard title={s["dashboard.notes"]}>
        <p className="text-sm text-v2-text-secondary">{s["dashboard.noNotes"]}</p>
      </GlassCard>
    </main>
  );
}
