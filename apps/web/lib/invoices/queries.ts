import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { assertCan, type Capability, type RequestContext } from "@osteojp/auth";
import { appointments, invoices, locations, patients } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { revenueLocations } from "./revenue-scope";

/**
 * DASH-THERAPIST-REVENUE: who may read the clinic's monthly revenue.
 *
 * `invoices:issue`, NOT `invoices:read`, and that is the whole fix. EVERY role
 * holds `invoices:read` (packages/auth/permissions.ts: owner by ALL, admin,
 * therapist and reception each list it), because a therapist keeps it for the
 * Faturacao tab on a patient's page. Gating the figure on it gates nothing.
 *
 * The owner ruled on 2026-07-21 that Faturacao is therapist no-access, and
 * W10-04 enforced that on `/invoicing` and its nav entry with `invoices:issue`,
 * held by owner, admin and reception and NOT by the therapist
 * (docs/design/DECISIONS.md, the W10-04 "Implemented" entry). This figure is the
 * sum of that page's invoices, so it answers to the same capability. One
 * constant, so the page's gate and this function's assertion cannot drift.
 */
export const MONTHLY_REVENUE_CAPABILITY = "invoices:issue" satisfies Capability;

/**
 * Sum of amountCents for issued + paid invoices whose issuedAt falls inside
 * [monthStartUtc, monthEndUtc) for the caller's tenant. Returns 0 when there
 * are no matching invoices. Uses issuedAt (not createdAt) so draft invoices
 * that are later voided do not distort the monthly figure.
 *
 * Throws ForbiddenError for a role without MONTHLY_REVENUE_CAPABILITY, BEFORE
 * any read. The invoices RLS is tenant-wide, so the database would hand a
 * therapist the whole clinic's total; this assertion is the only thing between
 * any caller and that figure, which is why it lives here and not only on the
 * dashboard page.
 *
 * T5b, REVENUE PER CLINIC, AND THE SCOPE IS DECIDED HERE, NOT BY THE CALLER.
 * The invoices RLS is tenant-wide, so a location scope a page forgot to pass
 * would be a whole-tenant figure. So this function resolves the caller's own
 * clinics itself (`viewerLocationScope`) and `revenueLocations` turns role,
 * scope and the owner's choice into the one location list the sum is held to.
 * `options.locationId` is the owner's toggle and nothing else: for an admin or
 * a receptionist it is ignored, never intersected, never honoured.
 *
 * AN INVOICE BELONGS TO THE CLINIC OF ITS MARCACAO. `invoices` has no
 * location column; the clinic is `appointments.location_id` through the
 * nullable `invoices.appointment_id`, the same link `/invoicing`'s location
 * filter (listInvoices below) and the owner's Estatisticas (`getStatistics`,
 * lib/statistics/queries.ts, whose PL-09 scope this mirrors) already use. So:
 *   - a whole-tenant figure (`null`) keeps every invoice, linked or not. The
 *     LEFT JOIN is on the appointment's primary key, so it neither drops nor
 *     repeats an invoice, and the owner's default figure is the one the tile
 *     showed before T5b;
 *   - a clinic figure holds only invoices whose marcacao is at one of those
 *     clinics. An invoice with no marcacao has no clinic and is in no clinic's
 *     figure, exactly as it is in no clinic on /invoicing.
 * The appointments RLS runs inside the join as well, as defense in depth: an
 * admin's join cannot reach a marcacao at a clinic they are not assigned to,
 * except one they created themselves, and the explicit `location_id` condition
 * below excludes that one too.
 */
export async function getMonthlyRevenue(
  ctx: RequestContext,
  monthStartUtc: Date,
  monthEndUtc: Date,
  options: { locationId?: string | null } = {},
): Promise<number> {
  assertCan(ctx.role, MONTHLY_REVENUE_CAPABILITY);
  const scope = revenueLocations(ctx.role, await viewerLocationScope(ctx), options.locationId ?? null);
  // No clinic at all: nothing to sum, and no read to make. `inArray` over an
  // empty list is never true anyway; this says so without a round trip.
  if (scope !== null && scope.length === 0) return 0;
  const rows = await runScoped(ctx, (tx) =>
    tx
      .select({ total: sql<number>`coalesce(sum(${invoices.amountCents}), 0)::int` })
      .from(invoices)
      .leftJoin(appointments, eq(appointments.id, invoices.appointmentId))
      .where(
        and(
          inArray(invoices.status, ["issued", "paid"]),
          isNotNull(invoices.issuedAt),
          gte(invoices.issuedAt, monthStartUtc),
          lt(invoices.issuedAt, monthEndUtc),
          scope ? inArray(appointments.locationId, [...scope]) : undefined,
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
