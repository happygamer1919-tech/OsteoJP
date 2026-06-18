import "server-only";
import { and, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { RequestContext } from "@osteojp/auth";
import { invoices } from "@osteojp/db";
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
