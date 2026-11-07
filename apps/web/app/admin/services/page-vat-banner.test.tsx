/**
 * Tipos de Marcacao: the banner the page draws after a refused IVA/Motivo save.
 * The REAL page renders, with its reads, its actions and its two big sections
 * stubbed, so what is left on the page is the banner.
 *
 * Q5 (0% with no Motivo) and B10 (strategy 2026-11-05: a Motivo on 6, 13 or
 * 23%) each have their own message, from the table (`mt`) and from the
 * new-type row (`mn`). From the table, the banner names the types at fault by
 * the ids the action put in `vr`. Deleting any of the four branches leaves the
 * page on the generic error text, which these tests refuse.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({ tenantId: "t-1", role: "admin", userId: "u-1" }),
}));
vi.mock("@/lib/admin/services", () => ({
  listServices: async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Fisioterapia", isActive: true },
    { id: "22222222-2222-4222-8222-222222222222", name: "Reavaliação", isActive: true },
    { id: "33333333-3333-4333-8333-333333333333", name: "Pilates", isActive: true },
  ],
  listServiceLocationPrices: async () => [],
  getServiceDeleteBlockers: async () => new Map(),
  listServiceOfferings: async () => [],
}));
vi.mock("@/lib/admin/packs", () => ({
  listPacks: async () => [],
  getReferencedPackIds: async () => new Set(),
  listPackLocationPrices: async () => [],
  listPackOfferings: async () => [],
}));
vi.mock("@/lib/admin/locations", () => ({ listLocations: async () => [] }));
vi.mock("./ServiceTypesTable", () => ({ ServiceTypesTable: () => null }));
vi.mock("./packs-section", () => ({ PacksSection: () => null }));

import ServicesPage from "./page";

const pt = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "..", "..", "packages/i18n/src/strings.pt.json"), "utf-8"),
) as Record<string, string>;

/** The page's banner text, entities turned back. */
async function banner(params: Record<string, string>): Promise<string> {
  const html = renderToStaticMarkup(await ServicesPage({ searchParams: Promise.resolve(params) }));
  const m = html.match(/<p class="[^"]*" role="status">([\s\S]*?)<\/p>/);
  return (m?.[1] ?? "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

const rows = pt["admin.serviceTypes.vatReasonRows"];

describe("the IVA/Motivo banners on Admin > Servicos", () => {
  it("B10 from the table: its own message, naming every type at fault", async () => {
    expect(await banner({ mt: "err:vat_reason_not_exempt", vr: `${A},${C}` })).toBe(
      `${pt["admin.serviceTypes.vatReasonNotExempt"]} ${rows} Fisioterapia, Pilates.`,
    );
  });

  it("B10 from the table with no known ids: the message alone, never the generic error", async () => {
    const text = await banner({ mt: "err:vat_reason_not_exempt" });
    expect(text).toBe(pt["admin.serviceTypes.vatReasonNotExempt"]);
    expect(text).not.toBe(pt["admin.serviceTypes.tableError"]);
  });

  it("B10 from the new-type row: its own message", async () => {
    expect(await banner({ mn: "err:vat_reason_not_exempt" })).toBe(pt["admin.serviceTypes.newVatReasonNotExempt"]);
  });

  it("Q5 is unchanged, from the table and from the new-type row", async () => {
    expect(await banner({ mt: "err:vat_reason", vr: B })).toBe(
      `${pt["admin.serviceTypes.vatReasonRequired"]} ${rows} Reavaliação.`,
    );
    expect(await banner({ mn: "err:vat_reason" })).toBe(pt["admin.serviceTypes.newVatReasonRequired"]);
  });

  it("the four messages are distinct, so a swapped branch cannot pass", () => {
    const keys = ["vatReasonRequired", "newVatReasonRequired", "vatReasonNotExempt", "newVatReasonNotExempt"];
    const texts = keys.map((k) => pt[`admin.serviceTypes.${k}`]);
    expect(texts.every(Boolean)).toBe(true);
    expect(new Set(texts).size).toBe(keys.length);
  });
});
