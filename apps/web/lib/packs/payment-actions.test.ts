import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two server actions: each answers with a redirect carrying a code, a
 * correction from reception and every role without the capability are refused
 * BEFORE any write is called, and nothing about the money goes in the URL.
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
  requireRequestContext: async () => ({ tenantId: "t-1", role, userId: "u-1" }),
}));

const recordPackPayment = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ ok: true, lineId: "l-1" }));
vi.mock("./payments-write", () => ({ recordPackPayment: (...a: unknown[]) => recordPackPayment(...a) }));
const sellPack = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ ok: true, instanceId: INST2 }));
vi.mock("./sell", () => ({ sellPack: (...a: unknown[]) => sellPack(...a) }));

const INST = "11111111-1111-4111-8111-111111111111";
const INST2 = "55555555-5555-4555-8555-555555555555";
const LOC = "22222222-2222-4222-8222-222222222222";
const PAT = "33333333-3333-4333-8333-333333333333";
const PACK = "44444444-4444-4444-8444-444444444444";

const { recordPackPaymentAction, sellPackAction } = await import("./payment-actions");

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
const payment = (o: Record<string, string> = {}) =>
  fd({
    instanceId: INST,
    instanceHasPrice: "1",
    kind: "pagamento",
    amount: "120",
    receivedOn: today,
    method: "numerario",
    locationId: LOC,
    ...o,
  });

const where = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error("no redirect");
};

beforeEach(() => {
  role = "reception";
  recordPackPayment.mockClear();
  sellPack.mockClear();
});

describe("recordPackPaymentAction", () => {
  it("records and returns to the pacote's page with ok", async () => {
    expect(await where(recordPackPaymentAction(payment()))).toBe(`/patients/packs/${INST}/pagamentos?ok=registado`);
    expect(recordPackPayment).toHaveBeenCalledTimes(1);
    expect(recordPackPayment.mock.calls[0]![1]).toMatchObject({ amountCents: 12000, kind: "pagamento" });
  });

  it("a form error returns its code and writes nothing; the amount is not in the URL", async () => {
    const url = await where(recordPackPaymentAction(payment({ method: "" })));
    expect(url).toBe(`/patients/packs/${INST}/pagamentos?erro=method`);
    expect(recordPackPayment).not.toHaveBeenCalled();
  });

  it("a correction from reception is refused before any write", async () => {
    const url = await where(recordPackPaymentAction(payment({ kind: "correcao", direction: "mais", reason: "x" })));
    expect(url).toBe(`/patients/packs/${INST}/pagamentos?erro=forbidden`);
    expect(recordPackPayment).not.toHaveBeenCalled();
    role = "admin";
    await where(recordPackPaymentAction(payment({ kind: "correcao", direction: "mais", reason: "x" })));
    expect(recordPackPayment).toHaveBeenCalledTimes(1);
  });

  it("a therapist is refused before any write (P4)", async () => {
    role = "therapist";
    expect(await where(recordPackPaymentAction(payment()))).toBe(`/patients/packs/${INST}/pagamentos?erro=forbidden`);
    expect(recordPackPayment).not.toHaveBeenCalled();
  });

  it("a refusal from the write is passed on as its code", async () => {
    recordPackPayment.mockResolvedValueOnce({ ok: false, reason: "price_already_set" });
    expect(await where(recordPackPaymentAction(payment()))).toBe(`/patients/packs/${INST}/pagamentos?erro=price_already_set`);
  });

  it("a bad instance id goes back to the list", async () => {
    expect(await where(recordPackPaymentAction(payment({ instanceId: "x" })))).toBe("/patients/packs");
  });
});

describe("sellPackAction", () => {
  it("sells and opens the new pacote's payment page", async () => {
    expect(await where(sellPackAction(fd({ patientId: PAT, packId: PACK, agreedPrice: "450" })))).toBe(
      `/patients/packs/${INST2}/pagamentos?ok=vendido`,
    );
    expect(sellPack.mock.calls[0]![1]).toEqual({ patientId: PAT, packId: PACK, agreedPriceCents: 45000 });
  });

  it("no typed price is refused (P2) and keeps the chosen patient", async () => {
    expect(await where(sellPackAction(fd({ patientId: PAT, packId: PACK })))).toBe(
      `/patients/packs/vender?erro=agreed_price_required&patient=${PAT}`,
    );
    expect(sellPack).not.toHaveBeenCalled();
  });

  it("a therapist cannot sell", async () => {
    role = "therapist";
    expect(await where(sellPackAction(fd({ patientId: PAT, packId: PACK, agreedPrice: "450" })))).toBe(
      "/patients/packs/vender?erro=forbidden",
    );
    expect(sellPack).not.toHaveBeenCalled();
  });
});
