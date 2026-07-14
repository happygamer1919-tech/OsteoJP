"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { AgendaOptions } from "@/lib/scheduling/types";
import type { StatisticsFilters, StatisticsResult, NamedAmount } from "@/lib/statistics/queries";

import { BarChart } from "./bar-chart";

const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const money = (cents: number) => eurFmt.format(cents / 100);

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const STATUS_KEY: Record<string, keyof typeof s> = {
  scheduled: "appointment.statusPending",
  confirmed: "appointment.statusConfirmed",
  completed: "appointment.statusCompleted",
  cancelled: "appointment.statusCancelled",
  no_show: "appointment.statusNoShow",
};

export function EstatisticasView({
  stats,
  options,
  filters,
}: {
  stats: StatisticsResult;
  options: AgendaOptions;
  filters: StatisticsFilters;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function navigate(next: Partial<StatisticsFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.therapistId) params.set("therapist", merged.therapistId);
    if (merged.locationId) params.set("location", merged.locationId);
    if (merged.serviceId) params.set("service", merged.serviceId);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/estatisticas?${qs}` : "/estatisticas"));
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl text-v2-text-primary">{s["statistics.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["statistics.subtitle"]}</p>
      </div>

      {/* Filters: date range, therapist, location, service. */}
      <div className="glass-nav flex flex-wrap items-end gap-3 rounded-v2 px-4 py-3 shadow-v2-float">
        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["statistics.dateFrom"]}
          <input
            type="date"
            value={filters.from ?? ""}
            max={filters.to ?? undefined}
            onChange={(e) => navigate({ from: e.target.value || null })}
            className="rounded border border-border-strong px-3 py-1.5 text-sm text-v2-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["statistics.dateTo"]}
          <input
            type="date"
            value={filters.to ?? ""}
            min={filters.from ?? undefined}
            onChange={(e) => navigate({ to: e.target.value || null })}
            className="rounded border border-border-strong px-3 py-1.5 text-sm text-v2-text-primary"
          />
        </label>
        <div className="w-48">
          <Select
            aria-label={s["agenda.filterTherapists"]}
            value={filters.therapistId ?? ""}
            onChange={(e) => navigate({ therapistId: e.target.value || null })}
          >
            <option value="">{s["agenda.allTherapists"]}</option>
            {options.therapists.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label={s["header.location"]}
            value={filters.locationId ?? ""}
            onChange={(e) => navigate({ locationId: e.target.value || null })}
          >
            <option value="">{s["agenda.allLocations"]}</option>
            {options.locations.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label={s["marcacoes.filterService"]}
            value={filters.serviceId ?? ""}
            onChange={(e) => navigate({ serviceId: e.target.value || null })}
          >
            <option value="">{s["marcacoes.allServices"]}</option>
            {options.services.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* KPI cards. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label={s["statistics.kpiRevenue"]} value={money(stats.revenueTotalCents)} />
        <KpiCard label={s["statistics.kpiAppointments"]} value={String(stats.appointmentCount)} />
        <KpiCard label={s["statistics.kpiUtilization"]} value={hoursLabel(stats.utilizationMinutes)} />
      </div>

      {/* Chart: revenue per month. */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg text-v2-text-primary">{s["statistics.revenueByMonth"]}</h2>
        <BarChart
          data={stats.revenueByMonth.map((r) => ({ label: r.period, value: r.valueCents }))}
          formatValue={money}
          emptyLabel={s["statistics.empty"]}
        />
      </section>

      {/* Breakdowns. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Breakdown title={s["statistics.revenueByTherapist"]} rows={stats.revenueByTherapist} fallback={s["statistics.noTherapist"]} />
        <Breakdown title={s["statistics.revenueByService"]} rows={stats.revenueByService} fallback={s["statistics.noService"]} />
        <Breakdown title={s["statistics.revenueByLocation"]} rows={stats.revenueByLocation} fallback={s["statistics.noLocation"]} />
      </div>

      {/* Appointment counts per status (volume breakdown). */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg text-v2-text-primary">{s["statistics.appointmentsByStatus"]}</h2>
        {stats.appointmentsByStatus.length === 0 ? (
          <p className="text-sm text-v2-text-secondary">{s["statistics.empty"]}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {stats.appointmentsByStatus.map((r) => (
              <li key={r.status} className="flex justify-between text-sm">
                <span className="text-v2-text-primary">{s[STATUS_KEY[r.status] ?? "appointment.statusPending"]}</span>
                <span className="tabular-nums text-v2-text-secondary">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-6">
      <span className="text-xs uppercase tracking-wide text-v2-text-secondary">{label}</span>
      <span className="text-2xl tabular-nums text-v2-text-primary">{value}</span>
    </div>
  );
}

function Breakdown({ title, rows, fallback }: { title: string; rows: NamedAmount[]; fallback: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg text-v2-text-primary">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-v2-text-secondary">{fallback}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <li key={`${r.id ?? "none"}-${i}`} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-v2-text-primary">{r.name || fallback}</span>
              <span className="shrink-0 tabular-nums text-v2-text-secondary">{money(r.valueCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
