// W6-05 - Estatisticas KPI aggregates. OWNER-ONLY: every function asserts the
// owner-only `statistics:read` capability (query-level enforcement, defense in
// depth with the route redirect). Read-only aggregates over EXISTING data
// (invoices + appointments); no schema, no new capture. Money is integer cents,
// gross = final (CIVA art. 9 exemption, DECISIONS 2026-07-02). Tenant-scoped by
// RLS via runScoped.

import "server-only";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { appointments, invoices, locations, services, users } from "@osteojp/db";
import { requireRequestContext, runScoped, type RequestContext } from "../auth/context";

export type StatisticsFilters = {
  /** Inclusive YYYY-MM-DD bounds (Europe/Lisbon civil day); optional. */
  from?: string | null;
  to?: string | null;
  therapistId?: string | null;
  locationId?: string | null;
  serviceId?: string | null;
};

export type NamedAmount = { id: string | null; name: string; valueCents: number; count: number };
export type PeriodAmount = { period: string; valueCents: number; count: number };

export type StatisticsResult = {
  revenueTotalCents: number;
  currency: string;
  appointmentCount: number;
  utilizationMinutes: number;
  revenueByTherapist: NamedAmount[];
  revenueByService: NamedAmount[];
  revenueByLocation: NamedAmount[];
  revenueByMonth: PeriodAmount[];
  appointmentsByStatus: { status: string; count: number }[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** [from 00:00, to+1 00:00) UTC-ish day bounds from YYYY-MM-DD (null when unset). */
function dayBounds(from?: string | null, to?: string | null): { start: Date | null; end: Date | null } {
  const start = from && DATE_RE.test(from) ? new Date(`${from}T00:00:00.000Z`) : null;
  let end: Date | null = null;
  if (to && DATE_RE.test(to)) {
    end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return { start, end };
}

const REVENUE_STATUSES = ["issued", "paid"] as const;

/**
 * The whole KPI payload in one owner-scoped read. Revenue comes from invoices
 * (status issued/paid); per-therapist/service/location revenue is derived by the
 * nullable invoices.appointment_id link to appointments (invoices without a
 * marcacao fall in a "Sem marcacao" bucket). Volume + utilization come from
 * appointments (cancelled excluded).
 */
export async function getStatistics(
  actorInput?: RequestContext,
  filters: StatisticsFilters = {},
): Promise<StatisticsResult> {
  const ctx = actorInput ?? (await requireRequestContext());
  assertCan(ctx.role, "statistics:read");

  const { start, end } = dayBounds(filters.from, filters.to);

  return runScoped(ctx, async (tx) => {
    // Revenue side: invoices (issued/paid) LEFT JOIN their appointment for the
    // therapist/service/location dimension. Date filter on issued_at.
    const revWhere = and(
      inArray(invoices.status, REVENUE_STATUSES),
      start ? gte(invoices.issuedAt, start) : undefined,
      end ? lt(invoices.issuedAt, end) : undefined,
      filters.therapistId ? eq(appointments.practitionerId, filters.therapistId) : undefined,
      filters.serviceId ? eq(appointments.serviceId, filters.serviceId) : undefined,
      filters.locationId ? eq(appointments.locationId, filters.locationId) : undefined,
    );

    const centsExpr = sql<number>`coalesce(sum(${invoices.amountCents}), 0)`;

    const [totalRow] = await tx
      .select({ cents: centsExpr })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .where(revWhere);

    const byTherapist = await tx
      .select({
        id: appointments.practitionerId,
        name: sql<string>`coalesce(${users.fullName}, '')`,
        valueCents: centsExpr,
        count: count(),
      })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .leftJoin(users, eq(users.id, appointments.practitionerId))
      .where(revWhere)
      .groupBy(appointments.practitionerId, users.fullName)
      .orderBy(desc(centsExpr));

    const byService = await tx
      .select({
        id: appointments.serviceId,
        name: sql<string>`coalesce(${services.name}, '')`,
        valueCents: centsExpr,
        count: count(),
      })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .where(revWhere)
      .groupBy(appointments.serviceId, services.name)
      .orderBy(desc(centsExpr));

    const byLocation = await tx
      .select({
        id: appointments.locationId,
        name: sql<string>`coalesce(${locations.name}, '')`,
        valueCents: centsExpr,
        count: count(),
      })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .leftJoin(locations, eq(locations.id, appointments.locationId))
      .where(revWhere)
      .groupBy(appointments.locationId, locations.name)
      .orderBy(desc(centsExpr));

    const monthExpr = sql<string>`to_char(date_trunc('month', ${invoices.issuedAt}), 'YYYY-MM')`;
    const byMonth = await tx
      .select({ period: monthExpr, valueCents: centsExpr, count: count() })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .where(revWhere)
      .groupBy(monthExpr)
      .orderBy(monthExpr);

    // Volume side: appointments in range (cancelled excluded), matching filters.
    const apptWhere = and(
      start ? gte(appointments.startsAt, start) : undefined,
      end ? lt(appointments.startsAt, end) : undefined,
      filters.therapistId ? eq(appointments.practitionerId, filters.therapistId) : undefined,
      filters.serviceId ? eq(appointments.serviceId, filters.serviceId) : undefined,
      filters.locationId ? eq(appointments.locationId, filters.locationId) : undefined,
    );

    const [volumeRow] = await tx
      .select({
        appointmentCount: count(),
        // Booked minutes over non-cancelled appointments (utilization proxy).
        minutes: sql<number>`coalesce(sum(
          case when ${appointments.status} <> 'cancelled'
          then extract(epoch from (${appointments.endsAt} - ${appointments.startsAt})) / 60
          else 0 end), 0)`,
      })
      .from(appointments)
      .where(apptWhere);

    const byStatus = await tx
      .select({ status: appointments.status, count: count() })
      .from(appointments)
      .where(apptWhere)
      .groupBy(appointments.status)
      .orderBy(desc(count()));

    const toNamed = (rows: { id: string | null; name: string; valueCents: unknown; count: number }[]) =>
      rows.map((r) => ({
        id: r.id,
        name: r.name && r.name.length > 0 ? r.name : "",
        valueCents: Number(r.valueCents ?? 0),
        count: Number(r.count ?? 0),
      }));

    return {
      revenueTotalCents: Number(totalRow?.cents ?? 0),
      currency: "EUR",
      appointmentCount: Number(volumeRow?.appointmentCount ?? 0),
      utilizationMinutes: Math.round(Number(volumeRow?.minutes ?? 0)),
      revenueByTherapist: toNamed(byTherapist),
      revenueByService: toNamed(byService),
      revenueByLocation: toNamed(byLocation),
      revenueByMonth: byMonth.map((r) => ({
        period: r.period,
        valueCents: Number(r.valueCents ?? 0),
        count: Number(r.count ?? 0),
      })),
      appointmentsByStatus: byStatus.map((r) => ({
        status: r.status as string,
        count: Number(r.count ?? 0),
      })),
    };
  });
}
