import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Vender pack": who may open it, what it says before the sitting, the patient
 * search, and the sale form: the agreed price is TYPED (the field is empty and
 * required) with today's catalogue price beside each pacote (P2), Stylus first
 * (P3), and the refusal message for a patient who already holds the pacote.
 */

vi.mock("server-only", () => ({}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

let role: "owner" | "admin" | "therapist" | "reception" = "reception";
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => ({ tenantId: "t-1", role, userId: "u-1" }),
}));
vi.mock("@/lib/packs/payment-actions", () => ({ sellPackAction: async () => {} }));

const st = vi.hoisted(() => ({
  available: true,
  patient: null as { id: string; name: string } | null,
  found: [] as Array<{ id: string; fullName: string }>,
  searches: [] as string[],
  patientReads: 0,
}));
vi.mock("@/lib/packs/payments-read", () => ({
  packPaymentsAvailable: async () => st.available,
  getSellPatient: async () => {
    st.patientReads += 1;
    return st.patient;
  },
  listSellablePacks: async () => [
    { id: "pk-1", name: "Fisioterapia 10", sessionCount: 10, catalogPriceCents: 45000 },
    { id: "pk-2", name: "Osteopatia 5", sessionCount: 5, catalogPriceCents: 23750 },
  ],
}));
vi.mock("@/lib/patients/queries", () => ({
  searchPatients: async (q: string) => {
    st.searches.push(q);
    return st.found;
  },
}));
vi.mock("../../_components/search-box", () => ({ SearchBox: () => createElement("form", { role: "search" }) }));
vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ children }: { children?: ReactNode }) => createElement("section", null, children as ReactNode),
  EmptyState: ({ title }: { title?: ReactNode }) => createElement("div", { "data-empty": "1" }, title as ReactNode),
}));

const { default: Page } = await import("./page");
const { s } = await import("@/lib/i18n");

const PAT = "33333333-3333-4333-8333-333333333333";
const render = async (sp: Record<string, string> = {}) =>
  renderToStaticMarkup((await Page({ searchParams: Promise.resolve(sp) })) as Parameters<typeof renderToStaticMarkup>[0]);

beforeEach(() => {
  role = "reception";
  st.available = true;
  st.patient = null;
  st.found = [];
  st.searches = [];
  st.patientReads = 0;
});

describe("Vender pack", () => {
  it("a therapist is sent back to Packs em uso", async () => {
    role = "therapist";
    await expect(render()).rejects.toMatchObject({ url: "/patients/packs" });
  });

  it("before the sitting: not available yet, no search, no form", async () => {
    st.available = false;
    const html = await render({ q: "ana" });
    expect(html).toContain(s["packsPay.unavailableTitle"]);
    expect(st.searches).toEqual([]);
    expect(html).not.toContain("pack-sell-form");
  });

  it("step 1: the search lists patients, each with a link that chooses them; Stylus first is said", async () => {
    st.found = [{ id: PAT, fullName: "Ana Silva" }];
    const html = await render({ q: " ana " });
    expect(st.searches).toEqual(["ana"]);
    expect(html).toContain("Ana Silva");
    expect(html).toContain(`href="/patients/packs/vender?patient=${PAT}"`);
    expect(html).toContain(s["packsSell.intro"]);
    expect(html).not.toContain("pack-sell-form");
  });

  it("no match says so", async () => {
    expect(await render({ q: "zzz" })).toContain(s["packsSell.noResults"]);
  });

  it("a patient id that is not a uuid is never read", async () => {
    await render({ patient: "nope" });
    expect(st.patientReads).toBe(0);
  });

  it("step 2: the form names the patient, lists each pacote with its catalogue price BESIDE, and the price field is EMPTY and required (P2)", async () => {
    st.patient = { id: PAT, name: "Ana Silva" };
    const html = await render({ patient: PAT });
    expect(html).toContain("pack-sell-form");
    expect(html).toContain(s["packsSell.chosen"].replace("{name}", "Ana Silva"));
    expect(html).toContain(`name="patientId" value="${PAT}"`);
    expect(html).toContain("Fisioterapia 10 (10 sessões) • tabela hoje 450€");
    expect(html).toContain("Osteopatia 5 (5 sessões) • tabela hoje 237,50€");
    const input = html.match(/<input[^>]*name="agreedPrice"[^>]*>/)![0];
    expect(input).not.toContain("value=");
    expect(input).toContain("required");
  });

  it("the refusal for a pacote already held with free sessions is printed", async () => {
    st.patient = { id: PAT, name: "Ana Silva" };
    const html = await render({ patient: PAT, erro: "pack_has_free_sessions" });
    expect(html).toContain(s["packsSell.errHasFreeSessions"]);
    expect(s["packsSell.errHasFreeSessions"]).toBe("Este utente já tem este pack com sessões livres.");
  });
});
