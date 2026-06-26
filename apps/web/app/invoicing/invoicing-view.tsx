"use client";

import {
  DatePicker,
  EmptyState,
  GlassPanel,
  Select,
  StatusChip,
  type StatusTone,
} from "@osteojp/ui";
import { Receipt, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { s } from "@/lib/i18n";
import type { InvoiceRow, InvoiceStatus, LocationOption } from "@/lib/invoices/queries";

export type InvoicingFilters = {
  from: string;
  to: string;
  status: InvoiceStatus | null;
  locationId: string | null;
};

const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  draft: "neutral",
  issued: "warning",
  paid: "success",
  void: "error",
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, keyof typeof s> = {
  draft: "invoicing.statusDraft",
  issued: "invoicing.statusIssued",
  paid: "invoicing.statusPaid",
  void: "invoicing.statusVoid",
};

const STATUS_OPTIONS: InvoiceStatus[] = ["draft", "issued", "paid", "void"];

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const eurFmt = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
});

function formatMoney(cents: number): string {
  return eurFmt.format(cents / 100);
}

function InvoiceDetailPanel({
  invoice,
  onClose,
}: {
  invoice: InvoiceRow;
  onClose: () => void;
}) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const focusable = e.currentTarget.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-text-primary/40"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={s["invoicing.detailTitle"]}
        onKeyDown={handleKeyDown}
        className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col bg-surface shadow-lg sm:w-[30rem]"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="text-2xl text-text-primary">{s["invoicing.detailTitle"]}</h2>
          <button
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="button"
            aria-label={s["invoicing.closeDetail"]}
            onClick={onClose}
            className="rounded p-1 text-text-secondary transition-transform motion-safe:active:scale-[0.97] hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <dl className="flex flex-col gap-4">
            <DetailRow label={s["invoicing.columnNumber"]} value={invoice.externalId ?? "—"} />
            <DetailRow label={s["invoicing.columnPatient"]} value={invoice.patientName ?? "—"} />
            <DetailRow
              label={s["invoicing.columnDate"]}
              value={invoice.issuedAt ? dateFmt.format(new Date(invoice.issuedAt)) : "—"}
            />
            <DetailRow
              label={s["invoicing.columnAmount"]}
              value={formatMoney(invoice.amountCents)}
            />
            <div className="flex items-start justify-between gap-4">
              <dt className="text-sm text-text-secondary">{s["invoicing.columnStatus"]}</dt>
              <dd>
                <StatusChip tone={INVOICE_STATUS_TONE[invoice.status]} dot>
                  {s[INVOICE_STATUS_LABEL[invoice.status]]}
                </StatusChip>
              </dd>
            </div>
          </dl>
        </div>

        <footer className="shrink-0 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded border border-border-strong bg-surface px-4 text-sm font-medium text-text-primary transition motion-safe:active:scale-[0.97] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {s["invoicing.closeDetail"]}
          </button>
        </footer>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

export function InvoicingView({
  filters,
  invoices,
  locations,
  issueEnabled,
}: {
  filters: InvoicingFilters;
  invoices: InvoiceRow[];
  locations: LocationOption[];
  issueEnabled: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  function openDetail(inv: InvoiceRow) {
    setSelected(inv);
  }

  function closeDetail() {
    const id = selected?.id;
    setSelected(null);
    if (id) {
      requestAnimationFrame(() => {
        triggerRefs.current.get(id)?.focus();
      });
    }
  }

  function navigate(next: Partial<InvoicingFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    params.set("from", merged.from);
    params.set("to", merged.to);
    if (merged.status) params.set("status", merged.status);
    if (merged.locationId) params.set("location", merged.locationId);
    startTransition(() => router.push(`/invoicing?${params.toString()}`));
  }

  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amountCents, 0);
  const totalPending = invoices
    .filter((i) => i.status === "issued")
    .reduce((sum, i) => sum + i.amountCents, 0);

  const primaryBtn =
    "inline-flex h-10 items-center justify-center rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition motion-safe:active:scale-[0.97] hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl text-text-primary">{s["nav.invoicing"]}</h1>
        </div>
        {issueEnabled && (
          <button type="button" className={primaryBtn}>
            {s["invoicing.newInvoice"]}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="glass-nav flex flex-wrap items-end gap-3 rounded-v2 px-4 py-3 shadow-v2-float">
        <div className="flex items-center gap-2">
          <div className="w-40">
            <DatePicker
              value={filters.from}
              max={filters.to}
              onChange={(d) => navigate({ from: d })}
              triggerLabel={s["invoicing.filterDateFrom"]}
            />
          </div>
          <span className="text-sm text-text-secondary" aria-hidden="true">—</span>
          <div className="w-40">
            <DatePicker
              value={filters.to}
              min={filters.from}
              onChange={(d) => navigate({ to: d })}
              triggerLabel={s["invoicing.filterDateTo"]}
            />
          </div>
        </div>

        <div className="w-48">
          <Select
            aria-label={s["invoicing.filterStatus"]}
            value={filters.status ?? ""}
            onChange={(e) =>
              navigate({ status: (e.target.value as InvoiceStatus) || null })
            }
          >
            <option value="">{s["invoicing.allStatuses"]}</option>
            {STATUS_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {s[INVOICE_STATUS_LABEL[v]]}
              </option>
            ))}
          </Select>
        </div>

        {locations.length > 0 && (
          <div className="w-56">
            <Select
              aria-label={s["header.location"]}
              value={filters.locationId ?? ""}
              onChange={(e) => navigate({ locationId: e.target.value || null })}
            >
              <option value="">{s["invoicing.allLocations"]}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Invoice table */}
      {invoices.length === 0 ? (
        <GlassPanel>
          <EmptyState
            icon={Receipt}
            title={s["invoicing.emptyTitle"]}
            description={s["invoicing.emptyHelp"]}
          />
        </GlassPanel>
      ) : (
        <GlassPanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label={s["invoicing.tableCaption"]}>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="pb-3 pr-4 text-xs font-medium text-text-secondary">
                    {s["invoicing.columnNumber"]}
                  </th>
                  <th scope="col" className="pb-3 pr-4 text-xs font-medium text-text-secondary">
                    {s["invoicing.columnPatient"]}
                  </th>
                  <th scope="col" className="pb-3 pr-4 text-xs font-medium text-text-secondary">
                    {s["invoicing.columnDate"]}
                  </th>
                  <th scope="col" className="pb-3 pr-4 text-right text-xs font-medium text-text-secondary">
                    {s["invoicing.columnAmount"]}
                  </th>
                  <th scope="col" className="pb-3 pr-4 text-xs font-medium text-text-secondary">
                    {s["invoicing.columnStatus"]}
                  </th>
                  <th scope="col" className="pb-3 text-xs font-medium text-text-secondary">
                    <span className="sr-only">{s["invoicing.columnActions"]}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-muted/40">
                    <td className="py-3 pr-4 font-mono text-text-primary">
                      {inv.externalId ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-text-primary">
                      {inv.patientName ?? "—"}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-text-secondary">
                      {inv.issuedAt ? dateFmt.format(new Date(inv.issuedAt)) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-text-primary">
                      {formatMoney(inv.amountCents)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusChip tone={INVOICE_STATUS_TONE[inv.status]} dot>
                        {s[INVOICE_STATUS_LABEL[inv.status]]}
                      </StatusChip>
                    </td>
                    <td className="py-3">
                      <button
                        ref={(el) => { triggerRefs.current.set(inv.id, el); }}
                        type="button"
                        aria-label={`${s["invoicing.viewInvoice"]} ${inv.externalId ?? inv.id.slice(-6)}`}
                        onClick={() => openDetail(inv)}
                        className="text-xs text-text-secondary underline transition-transform motion-safe:active:scale-[0.97] hover:text-text-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
                      >
                        {s["invoicing.viewAction"]}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals row */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm text-text-secondary">
            <span>
              {s["invoicing.totalPaid"]}{" "}
              <strong className="text-text-primary">{formatMoney(totalPaid)}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {s["invoicing.totalPending"]}{" "}
              <strong className="text-text-primary">{formatMoney(totalPending)}</strong>
            </span>
          </div>
        </GlassPanel>
      )}

      {/* Integration note */}
      <p className="text-xs text-text-secondary">{s["invoicing.integrationNote"]}</p>

      {/* Detail panel */}
      {selected && (
        <InvoiceDetailPanel invoice={selected} onClose={closeDetail} />
      )}
    </main>
  );
}
