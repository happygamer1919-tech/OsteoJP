import { can } from "@osteojp/auth";
import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { credentialsConfigured } from "@/lib/integrations/invoicexpress";
import { s } from "@/lib/i18n";
import { listInvoices, listActiveLocations, type InvoiceStatus } from "@/lib/invoices/queries";
import { InvoicingView, type InvoicingFilters } from "./invoicing-view";

// Never cache: live record_status / fiscal state may change between requests.
export const dynamic = "force-dynamic";

/** YYYY-MM-DD for the first day of the current UTC month. */
function monthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** YYYY-MM-DD for today in UTC. */
function todayUtc(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

const VALID_STATUSES = new Set<string>(["draft", "issued", "paid", "void"]);

export default async function InvoicingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  if (!can(ctx.role, "invoices:read")) {
    return (
      <main className="py-16 text-center">
        <p className="text-sm text-error">{s["errors.forbidden"]}</p>
      </main>
    );
  }

  const params = await searchParams;
  const fromParam = typeof params.from === "string" ? params.from : monthStart();
  const toParam = typeof params.to === "string" ? params.to : todayUtc();
  const statusParam =
    typeof params.status === "string" && VALID_STATUSES.has(params.status)
      ? (params.status as InvoiceStatus)
      : null;
  const locationParam = typeof params.location === "string" ? params.location : null;

  const filters: InvoicingFilters = {
    from: fromParam,
    to: toParam,
    status: statusParam,
    locationId: locationParam,
  };

  // Build date range: toParam is inclusive, so advance by one day for the exclusive upper bound.
  const fromDate = new Date(`${fromParam}T00:00:00Z`);
  const toDateExclusive = new Date(`${toParam}T00:00:00Z`);
  toDateExclusive.setUTCDate(toDateExclusive.getUTCDate() + 1);

  const [invoiceRows, locationRows] = await Promise.all([
    listInvoices(ctx, {
      from: fromDate,
      to: toDateExclusive,
      status: statusParam ?? undefined,
      locationId: locationParam ?? undefined,
    }),
    listActiveLocations(ctx),
  ]);

  // "Nova fatura" button is only shown when InvoiceXpress credentials are configured.
  const issueEnabled = credentialsConfigured();

  return (
    <InvoicingView
      filters={filters}
      invoices={invoiceRows}
      locations={locationRows}
      issueEnabled={issueEnabled}
    />
  );
}
