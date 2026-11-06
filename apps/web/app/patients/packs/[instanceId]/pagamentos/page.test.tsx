import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Pagamentos do pack": who opens it, what it says before the sitting, the
 * agreed price typed with the catalogue price BESIDE it and never in it (P2),
 * the correction offered to owner and admin only (P4), and the not-fiscal line.
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

vi.mock("@/lib/packs/payment-actions", () => ({ recordPackPaymentAction: async () => {} }));

type Detail = import("@/lib/packs/payments-read").PackPaymentDetail;
let detail: Detail | null | "unavailable" = null;
const getPackPaymentDetail = vi.fn(async () => detail);
vi.mock("@/lib/packs/payments-read", () => ({
  getPackPaymentDetail: (...a: unknown[]) => (getPackPaymentDetail as (...x: unknown[]) => unknown)(...a),
  listPaymentLocations: async () => [{ id: "loc-1", name: "Linda-a-Velha" }],
}));

vi.mock("@osteojp/ui", () => ({
  GlassPanel: ({ children }: { children?: ReactNode }) => createElement("section", null, children as ReactNode),
  EmptyState: ({ title }: { title?: ReactNode }) => createElement("div", { "data-empty": "1" }, title as ReactNode),
  StatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children as ReactNode),
}));

const { default: Page } = await import("./page");
const { s } = await import("@/lib/i18n");
const { summarizePackPayments } = await import("@/lib/packs/payments");

const ID = "11111111-1111-4111-8111-111111111111";
const render = async (sp: Record<string, string> = {}, id = ID) =>
  renderToStaticMarkup(
    (await Page({ params: Promise.resolve({ instanceId: id }), searchParams: Promise.resolve(sp) })) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );

const make = (agreed: number | null): Detail => ({
  instanceId: ID,
  patientId: "p-1",
  patientName: "Ana Silva",
  packName: "Fisioterapia 10",
  catalogPriceCents: 45000,
  sessionsTotal: 10,
  purchasedAt: new Date("2026-10-01T10:00:00Z"),
  summary: summarizePackPayments(agreed, null, [
    { kind: "pagamento", amountCents: 12000, receivedOn: "2026-10-02", stylusRef: null },
  ]),
  lines: [
    {
      id: "l-1",
      kind: "pagamento",
      amountCents: 12000,
      receivedOn: "2026-10-02",
      method: "mbway",
      stylusRef: null,
      reason: null,
      locationName: "Linda-a-Velha",
      createdAt: new Date("2026-10-02T10:00:00Z"),
    },
  ],
});

beforeEach(() => {
  role = "reception";
  detail = null;
  getPackPaymentDetail.mockClear();
});

describe("Pagamentos do pack", () => {
  it("a therapist is sent back to Packs em uso and nothing is read (P4)", async () => {
    role = "therapist";
    await expect(render()).rejects.toMatchObject({ url: "/patients/packs" });
    expect(getPackPaymentDetail).not.toHaveBeenCalled();
  });

  it("before the sitting it says the feature is not available yet", async () => {
    detail = "unavailable";
    const html = await render();
    expect(html).toContain(s["packsPay.unavailableTitle"]);
    expect(html).not.toContain("pack-pay-form");
  });

  it("an id that is not a uuid is never read and reads as not found", async () => {
    const html = await render({}, "nope");
    expect(getPackPaymentDetail).not.toHaveBeenCalled();
    expect(html).toContain(s["packsPay.notFoundTitle"]);
  });

  it("an unpriced pacote: the agreed price field is EMPTY, the catalogue price is printed beside it (P2)", async () => {
    detail = make(null);
    const html = await render();
    expect(html).toContain(s["packsInUse.payStateUnpriced"]);
    const input = html.match(/<input[^>]*name="agreedPrice"[^>]*>/)![0];
    expect(input).not.toContain("value=");
    expect(html).toContain(s["packsPay.catalogBeside"].replace("{amount}", "450"));
    expect(html).toContain('name="instanceHasPrice" value="0"');
  });

  it("a priced pacote: no agreed price field; received, the line, and the missing Stylus document flagged (P3)", async () => {
    detail = make(45000);
    const html = await render();
    expect(html).not.toContain('name="agreedPrice"');
    expect(html).toContain('name="instanceHasPrice" value="1"');
    expect(html).toContain("02/10/2026");
    expect(html).toContain("120€");
    expect(html).toContain(s["packsPay.noStylus"]);
    expect(html).toContain(s["packsPay.methodMbway"]);
  });

  it("the correction is offered to owner and admin, never to reception", async () => {
    detail = make(45000);
    expect(await render()).not.toContain('value="correcao"');
    role = "admin";
    expect(await render()).toContain('value="correcao"');
    role = "owner";
    expect(await render()).toContain('value="correcao"');
  });

  it("says it is not a fiscal record, and prints the message for an error code", async () => {
    detail = make(45000);
    const html = await render({ erro: "price_already_set" });
    expect(html).toContain(s["packsPay.notFiscal"]);
    expect(html).toContain(s["packsPay.errPriceAlreadySet"]);
    const unknown = await render({ erro: "<script>" });
    expect(unknown).not.toContain("pack-pay-error");
  });
});
