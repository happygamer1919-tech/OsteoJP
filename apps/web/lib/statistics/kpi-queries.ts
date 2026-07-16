// W8-03 — Indicadores (KPI) report aggregates. OWNER-ONLY: asserts the
// owner-only `statistics:read` capability (query-level, defense-in-depth with
// the route redirect), identical gate to the W6-05 dashboard. Read-only over
// EXISTING data (appointments, invoices, patients); no schema, no new capture.
// Money is integer cents (gross = final, CIVA art. 9). Tenant-scoped by RLS.

import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { appointments, invoices, patients, services, users } from "@osteojp/db";
import { requireRequestContext, runScoped, type RequestContext } from "../auth/context";
import { ageDistribution, categoryCounts, pivotSeries } from "./kpi-transform";

export type KpiFilters = {
  /** Inclusive YYYY-MM-DD bounds (Europe/Lisbon civil day); null = unbounded. */
  from?: string | null;
  to?: string | null;
};

export type NamedCount = { id: string | null; name: string; count: number };
export type NamedAmount = { id: string | null; name: string; valueCents: number };
export type PeriodAmount = { period: string; valueCents: number };
export type PivotRow = { period: string; [k: string]: number | string };
export type CategoryCount = { label: string; count: number };

export type KpiReports = {
  currency: string;
  bookingTypes: NamedCount[]; // 1. Tipos de marcação (donut, top 10)
  topTherapists: NamedCount[]; // 2. Top terapeutas por marcações
  revenueByMonth: PeriodAmount[]; // 3. Evolução da faturação (multi-year line)
  revenueByMonthByTherapist: { rows: PivotRow[]; series: string[] }; // 4.
  ageDistribution: { bucket: string; count: number }[]; // 5. Distribuição etária
  dailyByTherapist: { rows: PivotRow[]; series: string[] }; // 6. Marcações diárias por terapeuta
  topPatientsByPayments: NamedAmount[]; // 7. Top 10 utentes por pagamentos
  topPatientsByAppointments: NamedCount[]; // 8. Top 10 utentes por marcações
  referralSources: CategoryCount[]; // 9. Origem dos utentes
  topLocalities: CategoryCount[]; // 10. Top localidades dos utentes
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REVENUE_STATUSES = ["issued", "paid"] as const;
const TOP_N = 10;

function dayBounds(from?: string | null, to?: string | null): { start: Date | null; end: Date | null } {
  const start = from && DATE_RE.test(from) ? new Date(`${from}T00:00:00.000Z`) : null;
  let end: Date | null = null;
  if (to && DATE_RE.test(to)) {
    end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return { start, end };
}

/**
 * All ten KPI reports in one owner-scoped read for the given period. Activity
 * reports (bookings, revenue) filter on the relevant date column; demographic
 * reports (age, origem, localidades) are scoped to non-deleted patients who had
 * a non-cancelled appointment in the period (all non-deleted patients when no
 * period is set), so the period picker scopes every report. The SMS-evolution
 * report is intentionally ABSENT — reminder sends are not persisted (QUESTIONS).
 */
export async function getKpiReports(
  actorInput?: RequestContext,
  filters: KpiFilters = {},
): Promise<KpiReports> {
  const ctx = actorInput ?? (await requireRequestContext());
  assertCan(ctx.role, "statistics:read");

  const { start, end } = dayBounds(filters.from, filters.to);
  const now = new Date();

  return runScoped(ctx, async (tx) => {
    // Non-cancelled appointments in period (the count-report base).
    const apptWhere = and(
      ne(appointments.status, "cancelled"),
      start ? gte(appointments.startsAt, start) : undefined,
      end ? lt(appointments.startsAt, end) : undefined,
    );
    // Issued/paid invoices in period (the revenue base).
    const invWhere = and(
      inArray(invoices.status, REVENUE_STATUSES),
      start ? gte(invoices.issuedAt, start) : undefined,
      end ? lt(invoices.issuedAt, end) : undefined,
    );
    const centsExpr = sql<number>`coalesce(sum(${invoices.amountCents}), 0)`;

    // 1. Tipos de marcação — appointments by service (top 10).
    const bookingTypesRows = await tx
      .select({
        id: appointments.serviceId,
        name: sql<string>`coalesce(${services.name}, '')`,
        count: count(),
      })
      .from(appointments)
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .where(apptWhere)
      .groupBy(appointments.serviceId, services.name)
      .orderBy(desc(count()))
      .limit(TOP_N);

    // 2. Top terapeutas por marcações.
    const topTherapistsRows = await tx
      .select({
        id: appointments.practitionerId,
        name: sql<string>`coalesce(${users.fullName}, '')`,
        count: count(),
      })
      .from(appointments)
      .leftJoin(users, eq(users.id, appointments.practitionerId))
      .where(apptWhere)
      .groupBy(appointments.practitionerId, users.fullName)
      .orderBy(desc(count()))
      .limit(TOP_N);

    // 3. Evolução da faturação — revenue by month (multi-year).
    const monthExpr = sql<string>`to_char(date_trunc('month', ${invoices.issuedAt}), 'YYYY-MM')`;
    const revByMonthRows = await tx
      .select({ period: monthExpr, valueCents: centsExpr })
      .from(invoices)
      .where(invWhere)
      .groupBy(monthExpr)
      .orderBy(monthExpr);

    // 4. Evolução da faturação por terapeuta (pivoted line).
    const revByMonthTherapistRows = await tx
      .select({
        period: monthExpr,
        therapist: sql<string>`coalesce(${users.fullName}, '')`,
        valueCents: centsExpr,
      })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .leftJoin(users, eq(users.id, appointments.practitionerId))
      .where(invWhere)
      .groupBy(monthExpr, users.fullName)
      .orderBy(monthExpr);

    // 6. Marcações diárias por terapeuta (pivoted).
    const dayExpr = sql<string>`to_char(${appointments.startsAt} AT TIME ZONE 'Europe/Lisbon', 'YYYY-MM-DD')`;
    const dailyRows = await tx
      .select({
        period: dayExpr,
        therapist: sql<string>`coalesce(${users.fullName}, '')`,
        count: count(),
      })
      .from(appointments)
      .leftJoin(users, eq(users.id, appointments.practitionerId))
      .where(apptWhere)
      .groupBy(dayExpr, users.fullName)
      .orderBy(dayExpr);

    // 7. Top 10 utentes por pagamentos.
    const topPayRows = await tx
      .select({
        id: invoices.patientId,
        name: sql<string>`coalesce(${patients.fullName}, '')`,
        valueCents: centsExpr,
      })
      .from(invoices)
      .leftJoin(patients, eq(patients.id, invoices.patientId))
      .where(invWhere)
      .groupBy(invoices.patientId, patients.fullName)
      .orderBy(desc(centsExpr))
      .limit(TOP_N);

    // 8. Top 10 utentes por marcações.
    const topApptRows = await tx
      .select({
        id: appointments.patientId,
        name: sql<string>`coalesce(${patients.fullName}, '')`,
        count: count(),
      })
      .from(appointments)
      .leftJoin(patients, eq(patients.id, appointments.patientId))
      .where(apptWhere)
      .groupBy(appointments.patientId, patients.fullName)
      .orderBy(desc(count()))
      .limit(TOP_N);

    // 5/9/10 — demographics over in-scope patients (seen in period, or all when
    // no period). One read of (dateOfBirth, referralSource, city); bucketed in JS.
    const inPeriodPatientIds =
      start || end
        ? inArray(
            patients.id,
            tx
              .select({ id: appointments.patientId })
              .from(appointments)
              .where(apptWhere),
          )
        : undefined;
    const demoRows = await tx
      .select({
        dateOfBirth: patients.dateOfBirth,
        referralSource: patients.referralSource,
        city: patients.city,
      })
      .from(patients)
      .where(and(isNull(patients.deletedAt), inPeriodPatientIds));

    const named = (rows: { id: string | null; name: string; count: number }[]): NamedCount[] =>
      rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count ?? 0) }));
    const namedAmount = (rows: { id: string | null; name: string; valueCents: unknown }[]): NamedAmount[] =>
      rows.map((r) => ({ id: r.id, name: r.name, valueCents: Number(r.valueCents ?? 0) }));

    return {
      currency: "EUR",
      bookingTypes: named(bookingTypesRows),
      topTherapists: named(topTherapistsRows),
      revenueByMonth: revByMonthRows.map((r) => ({ period: r.period, valueCents: Number(r.valueCents ?? 0) })),
      revenueByMonthByTherapist: pivotRevenue(revByMonthTherapistRows),
      ageDistribution: ageDistribution(demoRows.map((r) => r.dateOfBirth), now),
      dailyByTherapist: pivotCount(dailyRows),
      topPatientsByPayments: namedAmount(topPayRows),
      topPatientsByAppointments: named(topApptRows),
      referralSources: categoryCounts(demoRows.map((r) => r.referralSource), "Sem origem"),
      topLocalities: categoryCounts(demoRows.map((r) => r.city), "Sem localidade", TOP_N),
    };
  });
}

function pivotRevenue(
  rows: { period: string; therapist: string; valueCents: unknown }[],
): { rows: PivotRow[]; series: string[] } {
  const { periods, series } = pivotSeries(
    rows.map((r) => ({ period: r.period, series: r.therapist || "Sem terapeuta", value: Number(r.valueCents ?? 0) })),
  );
  return { rows: periods, series };
}

function pivotCount(
  rows: { period: string; therapist: string; count: number }[],
): { rows: PivotRow[]; series: string[] } {
  const { periods, series } = pivotSeries(
    rows.map((r) => ({ period: r.period, series: r.therapist || "Sem terapeuta", value: Number(r.count ?? 0) })),
  );
  return { rows: periods, series };
}
