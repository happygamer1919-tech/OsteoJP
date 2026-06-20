import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { appointments, invoices, locations, patients } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";

/**
 * Sum of amountCents for issued + paid invoices whose issuedAt falls inside
 * [monthStartUtc, monthEndUtc) for the caller's tenant. Returns 0 when there
 * are no matching invoices. Uses issuedAt (not createdAt) so draft invoices
 * that are later voided do not distort the monthly figure.
 */
export async function getMonthlyRevenue(
  ctx: RequestContext,
  monthStartUtc: Date,
  monthEndUtc: Date,
): Promise<number> {
  const rows = await runScoped(ctx, (tx) =>
    tx
      .select({ total: sql<number>`coalesce(sum(${invoices.amountCents}), 0)::int` })
      .from(invoices)
      .where(
        and(
          inArray(invoices.status, ["issued", "paid"]),
          isNotNull(invoices.issuedAt),
          gte(invoices.issuedAt, monthStartUtc),
          lt(invoices.issuedAt, monthEndUtc),
        ),
      ),
  );
  return rows[0]?.total ?? 0;
}

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

/** One display row for the invoicing list — local ledger, not the IX relay. */
export type InvoiceRow = {
  id: string;
  /** InvoiceXpress sequence number (e.g. "FR 2026/0001"); null until issued via IX. */
  externalId: string | null;
  patientId: string | null;
  patientName: string | null;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  issuedAt: Date | null;
  /** Populated from the linked appointment; null for invoices with no appointment. */
  locationId: string | null;
};

export type ListInvoicesParams = {
  /** Filter to invoices for a specific patient. */
  patientId?: string;
  /** Inclusive lower bound on issuedAt (UTC). */
  from?: Date;
  /** Exclusive upper bound on issuedAt (UTC). */
  to?: Date;
  status?: InvoiceStatus;
  /** Filter by appointment location; excludes invoices with no appointment. */
  locationId?: string;
};

/**
 * Display query for the local invoices ledger table (NOT the InvoiceXpress relay).
 * Tenant-scoped via RLS context. Joins patients for the name column and appointments
 * for the optional locationId filter.
 */
export async function listInvoices(
  ctx: RequestContext,
  params: ListInvoicesParams = {},
): Promise<InvoiceRow[]> {
  return runScoped(ctx, (tx) =>
    tx
      .select({
        id: invoices.id,
        externalId: invoices.externalInvoiceId,
        patientId: invoices.patientId,
        patientName: patients.fullName,
        amountCents: invoices.amountCents,
        currency: invoices.currency,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
        locationId: appointments.locationId,
      })
      .from(invoices)
      .leftJoin(patients, eq(invoices.patientId, patients.id))
      .leftJoin(appointments, eq(invoices.appointmentId, appointments.id))
      .where(
        and(
          params.patientId ? eq(invoices.patientId, params.patientId) : undefined,
          params.status ? eq(invoices.status, params.status) : undefined,
          params.from ? gte(invoices.issuedAt, params.from) : undefined,
          params.to ? lt(invoices.issuedAt, params.to) : undefined,
          params.locationId ? eq(appointments.locationId, params.locationId) : undefined,
        ),
      )
      .orderBy(desc(invoices.issuedAt), desc(invoices.createdAt)),
  );
}

/** Active locations for the current tenant — used to populate the location filter. */
export type LocationOption = {
  id: string;
  name: string;
};

export async function listActiveLocations(ctx: RequestContext): Promise<LocationOption[]> {
  return runScoped(ctx, (tx) =>
    tx
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.isActive, true))
      .orderBy(locations.name),
  );
}
