"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { s } from "@/lib/i18n";
import type { KpiFilters, KpiReports } from "@/lib/statistics/kpi-queries";

import { DonutReport, HBarReport, LineReport, MultiLineReport, VBarReport } from "./kpi-charts";

const eurFmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const money = (cents: number) => eurFmt.format(cents / 100);
const num = (n: number) => new Intl.NumberFormat("pt-PT").format(n);

type ReportKey =
  | "bookingTypes"
  | "topTherapists"
  | "revenueByMonth"
  | "revenueByTherapist"
  | "ageDistribution"
  | "dailyByTherapist"
  | "topPatientsByPayments"
  | "topPatientsByAppointments"
  | "referralSources"
  | "topLocalities";

const REPORTS: { key: ReportKey; titleKey: keyof typeof s }[] = [
  { key: "bookingTypes", titleKey: "statistics.kpiBookingTypes" },
  { key: "topTherapists", titleKey: "statistics.kpiTopTherapists" },
  { key: "revenueByMonth", titleKey: "statistics.kpiRevenueEvolution" },
  { key: "revenueByTherapist", titleKey: "statistics.kpiRevenueByTherapist" },
  { key: "ageDistribution", titleKey: "statistics.kpiAgeDistribution" },
  { key: "dailyByTherapist", titleKey: "statistics.kpiDailyByTherapist" },
  { key: "topPatientsByPayments", titleKey: "statistics.kpiTopPatientsPayments" },
  { key: "topPatientsByAppointments", titleKey: "statistics.kpiTopPatientsAppointments" },
  { key: "referralSources", titleKey: "statistics.kpiReferralSources" },
  { key: "topLocalities", titleKey: "statistics.kpiTopLocalities" },
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type PresetKey = "thisMonth" | "last3" | "thisYear" | "last12" | "all";
const PRESETS: { key: PresetKey; labelKey: keyof typeof s }[] = [
  { key: "thisMonth", labelKey: "statistics.periodThisMonth" },
  { key: "last3", labelKey: "statistics.periodLast3" },
  { key: "thisYear", labelKey: "statistics.periodThisYear" },
  { key: "last12", labelKey: "statistics.periodLast12" },
  { key: "all", labelKey: "statistics.periodAll" },
];

function presetRange(key: PresetKey, today: Date): { from: string | null; to: string | null } {
  const to = ymd(today);
  if (key === "all") return { from: null, to: null };
  if (key === "thisMonth") return { from: ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to };
  if (key === "thisYear") return { from: ymd(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), to };
  const months = key === "last3" ? 3 : 12;
  return { from: ymd(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate()))), to };
}

export function IndicadoresView({ reports, filters }: { reports: KpiReports; filters: KpiFilters }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<ReportKey>("bookingTypes");
  const [customFrom, setCustomFrom] = useState(filters.from ?? "");
  const [customTo, setCustomTo] = useState(filters.to ?? "");

  function applyPeriod(from: string | null, to: string | null) {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/estatisticas/indicadores?${qs}` : "/estatisticas/indicadores"));
  }

  const emptyLabel = s["statistics.empty"];
  const cLabel = s["statistics.kpiValueCount"];
  const eLabel = s["statistics.kpiValueRevenue"];

  const chart = useMemo(() => {
    switch (selected) {
      case "bookingTypes":
        return (
          <DonutReport
            data={reports.bookingTypes.map((r) => ({ label: r.name || s["statistics.noService"], value: r.count }))}
            formatValue={num}
            emptyLabel={emptyLabel}
            valueHead={cLabel}
          />
        );
      case "topTherapists":
        return (
          <HBarReport
            data={reports.topTherapists.map((r) => ({ label: r.name || s["statistics.noTherapist"], value: r.count }))}
            formatValue={num}
            emptyLabel={emptyLabel}
            valueHead={cLabel}
          />
        );
      case "revenueByMonth":
        return (
          <LineReport
            data={reports.revenueByMonth.map((r) => ({ period: r.period, value: r.valueCents }))}
            formatValue={money}
            emptyLabel={emptyLabel}
            valueHead={eLabel}
          />
        );
      case "revenueByTherapist":
        return (
          <MultiLineReport
            rows={reports.revenueByMonthByTherapist.rows}
            series={reports.revenueByMonthByTherapist.series}
            formatValue={money}
            emptyLabel={emptyLabel}
          />
        );
      case "ageDistribution":
        return (
          <VBarReport
            data={reports.ageDistribution.map((r) => ({ label: r.bucket, value: r.count }))}
            formatValue={num}
            emptyLabel={emptyLabel}
            valueHead={cLabel}
          />
        );
      case "dailyByTherapist":
        return (
          <MultiLineReport
            rows={reports.dailyByTherapist.rows}
            series={reports.dailyByTherapist.series}
            formatValue={num}
            emptyLabel={emptyLabel}
          />
        );
      case "topPatientsByPayments":
        return (
          <HBarReport
            data={reports.topPatientsByPayments.map((r) => ({ label: r.name || s["statistics.noPatient"], value: r.valueCents }))}
            formatValue={money}
            emptyLabel={emptyLabel}
            valueHead={eLabel}
          />
        );
      case "topPatientsByAppointments":
        return (
          <HBarReport
            data={reports.topPatientsByAppointments.map((r) => ({ label: r.name || s["statistics.noPatient"], value: r.count }))}
            formatValue={num}
            emptyLabel={emptyLabel}
            valueHead={cLabel}
          />
        );
      case "referralSources":
        return (
          <DonutReport
            data={reports.referralSources.map((r) => ({ label: r.label, value: r.count }))}
            formatValue={num}
            emptyLabel={emptyLabel}
            valueHead={cLabel}
          />
        );
      case "topLocalities":
        return (
          <HBarReport
            data={reports.topLocalities.map((r) => ({ label: r.label, value: r.count }))}
            formatValue={num}
            emptyLabel={emptyLabel}
            valueHead={cLabel}
          />
        );
    }
  }, [selected, reports, emptyLabel, cLabel, eLabel]);

  const selectedTitle = s[REPORTS.find((r) => r.key === selected)!.titleKey];
  const today = useMemo(() => new Date(), []);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/estatisticas"
          className="inline-flex w-fit items-center gap-1 rounded-md px-1 text-sm text-v2-text-secondary hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" /> {s["statistics.title"]}
        </Link>
        <h1 className="text-2xl text-v2-text-primary">{s["statistics.cardKpi"]}</h1>
      </div>

      {/* Escolher período — presets + custom range. Scopes every report. */}
      <div className="glass-nav flex flex-wrap items-end gap-3 rounded-v2 px-4 py-3 shadow-v2-float">
        <span className="w-full text-xs font-medium text-v2-text-secondary">{s["statistics.periodTitle"]}</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                const r = presetRange(p.key, today);
                setCustomFrom(r.from ?? "");
                setCustomTo(r.to ?? "");
                applyPeriod(r.from, r.to);
              }}
              className="rounded-full border border-border-strong px-3 py-1 text-sm text-v2-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {s[p.labelKey]}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["statistics.dateFrom"]}
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded border border-border-strong px-3 py-1.5 text-sm text-v2-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["statistics.dateTo"]}
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded border border-border-strong px-3 py-1.5 text-sm text-v2-text-primary"
          />
        </label>
        <button
          type="button"
          onClick={() => applyPeriod(customFrom || null, customTo || null)}
          className="rounded border border-accent-1-700 px-3 py-1.5 text-sm font-medium text-accent-1-700 hover:bg-accent-1-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {s["statistics.periodApply"]}
        </button>
      </div>

      {/* Report menu. */}
      <nav aria-label={s["statistics.kpiReportMenu"]} className="flex flex-wrap gap-2">
        {REPORTS.map((r) => {
          const active = r.key === selected;
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(r.key)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                active
                  ? "bg-accent-1-700 text-text-inverse"
                  : "border border-border-strong text-v2-text-primary hover:bg-surface-muted"
              }`}
            >
              {s[r.titleKey]}
            </button>
          );
        })}
      </nav>

      {/* Selected report — full visual page. */}
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg text-v2-text-primary">{selectedTitle}</h2>
        {chart}
      </section>
    </main>
  );
}
