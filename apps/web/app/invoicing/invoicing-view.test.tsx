/* eslint-disable react/display-name -- lightweight inline @osteojp/ui stand-ins for a render test */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InvoiceRow } from "@/lib/invoices/queries";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@osteojp/ui", () => {
  const withClass =
    (tag: string) =>
    ({ children, className }: { children?: ReactNode; className?: string }) =>
      createElement(tag, { className }, children as ReactNode);
  return {
    DatePicker: () => createElement("div", null, "date"),
    EmptyState: ({ title }: { title?: string }) => createElement("div", null, title),
    GlassPanel: withClass("div"),
    Select: ({ children, ...rest }: { children?: ReactNode }) =>
      createElement("select", rest, children as ReactNode),
    StatusChip: withClass("span"),
  };
});

import { InvoicingView } from "./invoicing-view";

/**
 * T5 F2 (guide finding, #1462): Faturação showed a "Nova fatura" button with no
 * click handler whenever InvoiceXpress credentials were configured. Issuing is
 * fiscal (Tier D) and is not wired to any screen, so the button is gone.
 *
 * The view takes no issue flag any more, so no environment can bring the button
 * back; these tests pin that the page offers no issue control at all, with and
 * without rows.
 */
const FILTERS = { from: "2026-09-01", to: "2026-09-27", status: null, locationId: null };

const ROW: InvoiceRow = {
  id: "inv-000001",
  externalId: "FT 2026/1",
  patientId: "p-1",
  patientName: "Paciente Ficticio",
  amountCents: 4500,
  currency: "EUR",
  status: "issued",
  issuedAt: new Date("2026-09-10T10:00:00Z"),
  locationId: null,
};

const render = (invoices: InvoiceRow[]) =>
  renderToStaticMarkup(
    createElement(InvoicingView, { filters: FILTERS, invoices, locations: [] }),
  );

const buttonsOf = (html: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);

describe("Faturação offers no invoice-issuing control (T5 F2)", () => {
  it("an empty period renders the heading and no button at all", () => {
    const html = render([]);
    expect(html).toContain("Faturação");
    expect(html).not.toContain("Nova fatura");
    expect(buttonsOf(html)).toEqual([]);
  });

  it("with rows, the only buttons are each row's Abrir", () => {
    const html = render([ROW]);
    expect(html).not.toContain("Nova fatura");
    expect(buttonsOf(html)).toEqual(["Abrir"]);
  });

  it("the dead label is gone from both locales, so it cannot be wired back without a handler in review", () => {
    const root = join(__dirname, "..", "..", "..", "..", "packages", "i18n", "src");
    for (const f of ["strings.pt.json", "strings.en.json"]) {
      const dict = JSON.parse(readFileSync(join(root, f), "utf8")) as Record<string, string>;
      expect(dict["invoicing.newInvoice"], f).toBeUndefined();
    }
  });
});
