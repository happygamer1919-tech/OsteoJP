import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * "Gestão de Packs", Fisiozero's layout: LISTA DE PACKS, one row per pack
 * (name, "N sessões", the price inline with "€", a red cross "Apagar Pack"),
 * then "Novo PACK" with "Nome Pack...", "Número sessões...", "Preço...",
 * OsteoJP's base service and location after the price, and "Inserir".
 */

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ title, children }: { title?: ReactNode; children?: ReactNode }) =>
    createElement("section", null, createElement("h2", null, title as ReactNode), children as ReactNode),
  Button: ({ children, ...rest }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement(
      "button",
      { type: rest.type as string, disabled: rest.disabled as boolean },
      children as ReactNode,
    ),
  StatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children as ReactNode),
}));
// Server actions are never called by a render; stand-ins keep next/cache out.
vi.mock("./actions", () => ({
  createPackAction: async () => {},
  deletePackAction: async () => {},
  setPackActiveAction: async () => {},
  setPackLocationPricesAction: async () => {},
  updatePackAction: async () => {},
  updatePackPriceAction: async () => {},
}));

const { PacksSection } = await import("./packs-section");
const { s } = await import("@/lib/i18n");

const pack = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  name: "Osteopatia",
  baseServiceId: "svc-1",
  locationId: null,
  sessionCount: 10,
  priceCents: 59500,
  currency: "EUR",
  isActive: true,
  ...over,
});

const render = (packs = [pack()], referenced: string[] = []) =>
  renderToStaticMarkup(
    createElement(PacksSection, {
      packs,
      activeServices: [
        {
          id: "svc-1",
          name: "Osteopatia (servico)",
        } as never,
      ],
      activeLocations: [],
      referencedPackIds: new Set(referenced),
      packFilter: "all",
      serviceNameById: new Map([["svc-1", "Osteopatia (servico)"]]),
      locationNameById: new Map(),
      overrideByPackLocation: new Map<string, number>(),
      offeredPackLocation: new Set<string>(),
    }),
  );

describe("PacksSection, Fisiozero layout", () => {
  it("titles the panel 'Gestão de Packs' and the list 'LISTA DE PACKS'", () => {
    const html = render();
    expect(html).toContain(s["admin.packs.manageTitle"]);
    expect(s["admin.packs.manageTitle"]).toBe("Gestão de Packs");
    expect(html).toContain(s["admin.packs.listTitle"]);
    expect(s["admin.packs.listTitle"]).toBe("LISTA DE PACKS");
  });

  it("a row reads name, 'N sessões', an inline price box with €, in that order", () => {
    const html = render();
    const name = html.indexOf(">Osteopatia<");
    const sessions = html.indexOf(">10 sessões<");
    const price = html.indexOf('value="595.00"');
    const euro = html.indexOf(">€<", price);
    expect([name, sessions, price, euro].every((i) => i >= 0)).toBe(true);
    expect(name < sessions && sessions < price && price < euro).toBe(true);
  });

  it("an unheld pack has an enabled red cross with the tooltip 'Apagar Pack'", () => {
    const html = render();
    expect(s["admin.packs.deleteIcon"]).toBe("Apagar Pack");
    expect(html).toMatch(/<button type="submit" title="Apagar Pack" aria-label="Apagar Pack"[^>]*text-error-700/);
  });

  it("a pack a patient holds keeps the cross, disabled, and the tooltip says why", () => {
    const html = render([pack()], ["p-1"]);
    expect(html).toContain(`title="Apagar Pack: ${s["admin.packs.deleteBlockedTooltip"]}"`);
    expect(html).toMatch(/<button type="button" disabled=""/);
    expect(html).not.toMatch(/<button type="submit" title="Apagar Pack"/);
  });

  it("'Novo PACK': Nome Pack..., Número sessões..., Preço..., then base service and location, then Inserir", () => {
    const html = render();
    const form = html.slice(html.indexOf('data-testid="new-pack-form"'));
    const at = [
      form.indexOf(`placeholder="${s["admin.packs.namePlaceholder"]}"`),
      form.indexOf(`placeholder="${s["admin.packs.sessionsPlaceholder"]}"`),
      form.indexOf(`placeholder="${s["admin.packs.pricePlaceholder"]}"`),
      form.indexOf('name="baseServiceId"'),
      form.indexOf('name="locationId"'),
      form.indexOf(`>${s["admin.packs.insert"]}<`),
    ];
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain(s["admin.packs.newTitle"]);
    expect(s["admin.packs.newTitle"]).toBe("Novo PACK");
    expect(s["admin.packs.namePlaceholder"]).toBe("Nome Pack...");
    expect(s["admin.packs.sessionsPlaceholder"]).toBe("Número sessões...");
    expect(s["admin.packs.pricePlaceholder"]).toBe("Preço...");
    expect(s["admin.packs.insert"]).toBe("Inserir");
  });

  it("says the price is the pack total", () => {
    expect(render()).toContain(s["admin.packs.priceIsTotal"]);
  });

  it("an archived pack is marked inactive in its row", () => {
    const badge = `>${s["admin.staff.inactive"]}<`;
    expect(render([pack({ isActive: false })])).toContain(badge);
    // Negative control: an active pack carries no such badge.
    expect(render([pack({ isActive: true })])).not.toContain(badge);
  });

  it("has no feature switch: OsteoJP has no packs flag", () => {
    expect(render()).not.toContain("Activa ou desactiva");
  });
});
