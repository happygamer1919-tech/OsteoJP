import { can } from "@osteojp/auth";
import { EmptyState, Table, type TableColumn } from "@osteojp/ui";
import { Receipt } from "lucide-react";
import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";

// Live record_status / fiscal state may change; never cache.
export const dynamic = "force-dynamic";

type InvoiceRow = { id: string };

/**
 * Invoicing view (SPEC-staff-screens §8). Greenfield, gated by `invoices:read`.
 *
 * Per rule #1 the screen renders only data the app already exposes — and there is
 * none to display: the platform never self-issues fiscal documents (the local
 * `invoices` table is an internal ledger only), and the InvoiceXpress relay is
 * Phase 4 / not live, so `listInvoices` is the gated integration call, not a
 * display query. The screen therefore shows the table structure + the empty/
 * not-yet-active state, ready for the data layer.
 *
 * Deferred until the Phase-4 data layer / integration is live (documented):
 * the filters row (date range + Estado + location), populated rows, the detail
 * Drawer, the "Nova fatura" primary action, and the nav-bar link (adding it now
 * would break the exact-match nav unit test — a small follow-up).
 */
export default async function InvoicingPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  if (!can(ctx.role, "invoices:read")) {
    return (
      <main className="py-16 text-center">
        <p className="text-sm text-error">{s["errors.forbidden"]}</p>
      </main>
    );
  }

  const columns: TableColumn<InvoiceRow>[] = [
    { key: "number", header: s["invoicing.colNumber"], cell: () => "—" },
    { key: "date", header: s["invoicing.colDate"], cell: () => "—" },
    { key: "patient", header: s["invoicing.colPatient"], cell: () => "—" },
    { key: "amount", header: s["invoicing.colAmount"], align: "right", cell: () => "—" },
    { key: "status", header: s["invoicing.colStatus"], align: "right", cell: () => "—" },
  ];

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl text-text-primary">{s["nav.invoicing"]}</h1>
        <p className="mt-1 text-sm text-text-secondary">{s["invoicing.notLive"]}</p>
      </div>

      <Table
        caption={s["invoicing.tableCaption"]}
        columns={columns}
        data={[]}
        rowKey={(r) => r.id}
        state="empty"
        empty={
          <EmptyState
            icon={Receipt}
            title={s["invoicing.emptyTitle"]}
            description={s["invoicing.emptyHelp"]}
          />
        }
      />
    </main>
  );
}
