import { describe, expect, it } from "vitest";

import { s } from "@/lib/i18n";
import {
  PACK_KIND_KEYS,
  PACK_METHOD_KEYS,
  PACK_PAYMENT_METHODS,
  filterPorReceber,
  formatCalendarDate,
  formatSignedEuros,
  lisbonDate,
  lisbonMonthBounds,
  packPaymentErrorKey,
  parseEurosToCents,
  parsePackPaymentForm,
  parsePorReceberFilter,
  parseSellPackForm,
  summarizePackPayments,
  withPorReceberFilter,
  type PackPaymentLineCore,
} from "./payments";

/**
 * Pack payments, the pure half: the derived numbers and words, and the forms.
 * The database half is packages/db/tests/pack-instance-payments.db.test.ts.
 */

const pay = (amountCents: number, receivedOn: string, stylusRef: string | null = "FR 1E/1"): PackPaymentLineCore => ({
  kind: "pagamento",
  amountCents,
  receivedOn,
  stylusRef,
});

describe("summarizePackPayments", () => {
  it("no stated price reads 'unpriced', never 'due' from the catalogue, whatever was received", () => {
    const sum = summarizePackPayments(null, null, [pay(20000, "2026-11-01")]);
    expect(sum.state).toBe("unpriced");
    expect(sum.dueCents).toBeNull();
    expect(sum.outstandingCents).toBeNull();
    expect(sum.receivedCents).toBe(20000);
    expect(sum.lastPaidOn).toBeNull();
  });

  it("a partial payment is 'due' with what is still owed (Recebido: 120 of 450)", () => {
    const sum = summarizePackPayments(45000, null, [pay(12000, "2026-11-01")]);
    expect(sum).toMatchObject({ state: "due", dueCents: 45000, receivedCents: 12000, outstandingCents: 33000, lastPaidOn: null });
  });

  it("fully paid is 'paid', and 'Pagou a' is the latest pagamento date", () => {
    const sum = summarizePackPayments(45000, null, [pay(20000, "2026-11-03"), pay(25000, "2026-10-20")]);
    expect(sum).toMatchObject({ state: "paid", outstandingCents: 0, lastPaidOn: "2026-11-03" });
  });

  it("the switch amount (0083) is part of what is due", () => {
    const sum = summarizePackPayments(45000, 5000, [pay(45000, "2026-11-01")]);
    expect(sum).toMatchObject({ dueCents: 50000, outstandingCents: 5000, state: "due" });
  });

  it("a refund brings a paid pacote back to 'due'; a correction counts; a price of 0 with nothing received is 'paid'", () => {
    const refunded = summarizePackPayments(45000, null, [
      pay(45000, "2026-11-01"),
      { kind: "reembolso", amountCents: -10000, receivedOn: "2026-11-02", stylusRef: "NC 1E/1" },
    ]);
    expect(refunded).toMatchObject({ state: "due", receivedCents: 35000, outstandingCents: 10000 });
    const corrected = summarizePackPayments(45000, null, [
      pay(40000, "2026-11-01"),
      { kind: "correcao", amountCents: 5000, receivedOn: "2026-11-02", stylusRef: null },
    ]);
    expect(corrected.state).toBe("paid");
    expect(summarizePackPayments(0, null, []).state).toBe("paid");
  });

  it("an overpaid pacote is 'paid' and says how much was received in excess; otherwise 0", () => {
    const over = summarizePackPayments(45000, null, [pay(50000, "2026-11-01")]);
    expect(over).toMatchObject({ state: "paid", outstandingCents: -5000, overpaidCents: 5000 });
    expect(summarizePackPayments(45000, null, [pay(45000, "2026-11-01")]).overpaidCents).toBe(0);
    expect(summarizePackPayments(null, null, [pay(45000, "2026-11-01")]).overpaidCents).toBe(0);
    expect(summarizePackPayments(45000, null, []).overpaidCents).toBe(0);
  });

  it("counts the lines with no Stylus document, corrections aside (P3)", () => {
    const sum = summarizePackPayments(45000, null, [
      pay(10000, "2026-11-01", null),
      pay(10000, "2026-11-02", "FR 1E/2"),
      { kind: "reembolso", amountCents: -1000, receivedOn: "2026-11-03", stylusRef: null },
      { kind: "correcao", amountCents: 1000, receivedOn: "2026-11-03", stylusRef: null },
    ]);
    expect(sum.linesWithoutStylusRef).toBe(2);
  });
});

describe("formatting", () => {
  it("calendar dates read dd/mm/aaaa with no zone involved", () => {
    expect(formatCalendarDate("2026-11-05")).toBe("05/11/2026");
  });
  it("signed euros", () => {
    expect(formatSignedEuros(12050)).toBe("120,50");
    expect(formatSignedEuros(-5000)).toBe("-50");
    expect(formatSignedEuros(0)).toBe("0");
  });
  it("the Lisbon date and month, across midnight UTC and a month end", () => {
    // 23:30 UTC on 31 Oct 2026 is 23:30 WET on 31 Oct (no DST that night).
    expect(lisbonDate(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    // 23:30 UTC on 30 Jun is 00:30 on 1 Jul in Lisbon (WEST, UTC+1).
    expect(lisbonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(lisbonMonthBounds(new Date("2026-06-30T23:30:00Z"))).toEqual({ first: "2026-07-01", last: "2026-07-31" });
    expect(lisbonMonthBounds(new Date("2028-02-10T12:00:00Z"))).toEqual({ first: "2028-02-01", last: "2028-02-29" });
  });
});

describe("parseEurosToCents", () => {
  it("accepts plain decimals with a comma or a dot", () => {
    expect(parseEurosToCents("120")).toBe(12000);
    expect(parseEurosToCents("120,5")).toBe(12050);
    expect(parseEurosToCents(" 0.99 ")).toBe(99);
    expect(parseEurosToCents("")).toBeNull();
  });
  it("refuses signs, exponents, three decimals and anything above the bound", () => {
    for (const bad of ["-1", "+1", "1e3", "1,234", "abc", "0x10", "100000,01"]) {
      expect(parseEurosToCents(bad), bad).toBe("invalid");
    }
    expect(parseEurosToCents("100000")).toBe(10_000_000);
  });
});

const INST = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-05T12:00:00Z");

const form = (over: Record<string, string>) => {
  const base: Record<string, string> = {
    instanceId: INST,
    kind: "pagamento",
    amount: "120",
    receivedOn: "2026-11-05",
    method: "mbway",
    locationId: LOC,
    stylusRef: "",
    reason: "",
    agreedPrice: "",
  };
  const all = { ...base, ...over };
  return { get: (k: string) => (k in all ? all[k]! : null) };
};

describe("parsePackPaymentForm", () => {
  it("a payment on a priced pacote", () => {
    const r = parsePackPaymentForm(form({ stylusRef: "  FR 1E/9 " }), { now: NOW, instanceHasPrice: true });
    expect(r).toEqual({
      ok: true,
      value: {
        instanceId: INST,
        kind: "pagamento",
        amountCents: 12000,
        receivedOn: "2026-11-05",
        method: "mbway",
        locationId: LOC,
        stylusRef: "FR 1E/9",
        reason: null,
        agreedPriceCents: null,
      },
    });
  });

  it("the first payment of an unpriced pacote REQUIRES the agreed price (P2), and a priced one ignores it", () => {
    expect(parsePackPaymentForm(form({}), { now: NOW, instanceHasPrice: false })).toEqual({ ok: false, error: "agreed_price_required" });
    expect(parsePackPaymentForm(form({ agreedPrice: "4x" }), { now: NOW, instanceHasPrice: false })).toEqual({ ok: false, error: "agreed_price" });
    const ok = parsePackPaymentForm(form({ agreedPrice: "450" }), { now: NOW, instanceHasPrice: false });
    expect(ok.ok && ok.value.agreedPriceCents).toBe(45000);
    const ignored = parsePackPaymentForm(form({ agreedPrice: "450" }), { now: NOW, instanceHasPrice: true });
    expect(ignored.ok && ignored.value.agreedPriceCents).toBeNull();
  });

  it("a refund is typed positive and stored negative, and needs a reason and a method", () => {
    expect(parsePackPaymentForm(form({ kind: "reembolso" }), { now: NOW, instanceHasPrice: true })).toEqual({ ok: false, error: "reason" });
    expect(parsePackPaymentForm(form({ kind: "reembolso", reason: "x", method: "" }), { now: NOW, instanceHasPrice: true })).toEqual({ ok: false, error: "method" });
    const r = parsePackPaymentForm(form({ kind: "reembolso", reason: " Desistência " }), { now: NOW, instanceHasPrice: false });
    expect(r.ok && r.value).toMatchObject({ amountCents: -12000, reason: "Desistência", agreedPriceCents: null });
  });

  it("a correction takes its sign from the direction, needs a reason, and may have no method", () => {
    const base = { kind: "correcao", method: "", reason: "Acerto com o Stylus" };
    expect(parsePackPaymentForm(form({ ...base }), { now: NOW, instanceHasPrice: true })).toEqual({ ok: false, error: "amount" });
    const minus = parsePackPaymentForm(form({ ...base, direction: "menos" }), { now: NOW, instanceHasPrice: true });
    expect(minus.ok && minus.value).toMatchObject({ amountCents: -12000, method: null });
    const plus = parsePackPaymentForm(form({ ...base, direction: "mais" }), { now: NOW, instanceHasPrice: true });
    expect(plus.ok && plus.value.amountCents).toBe(12000);
    expect(parsePackPaymentForm(form({ ...base, direction: "mais", reason: "  " }), { now: NOW, instanceHasPrice: true })).toEqual({ ok: false, error: "reason" });
  });

  it("refuses: zero, an unknown kind or method, a bad or future date, a bad clinic, a long Stylus reference", () => {
    const opts = { now: NOW, instanceHasPrice: true };
    expect(parsePackPaymentForm(form({ amount: "0" }), opts)).toEqual({ ok: false, error: "amount" });
    expect(parsePackPaymentForm(form({ kind: "sinal" }), opts)).toEqual({ ok: false, error: "kind" });
    expect(parsePackPaymentForm(form({ method: "cheque" }), opts)).toEqual({ ok: false, error: "method" });
    expect(parsePackPaymentForm(form({ receivedOn: "2026-02-30" }), opts)).toEqual({ ok: false, error: "date" });
    expect(parsePackPaymentForm(form({ receivedOn: "2026-11-06" }), opts)).toEqual({ ok: false, error: "date_future" });
    expect(parsePackPaymentForm(form({ locationId: "x" }), opts)).toEqual({ ok: false, error: "location" });
    expect(parsePackPaymentForm(form({ stylusRef: "x".repeat(41) }), opts)).toEqual({ ok: false, error: "stylus_ref" });
    expect(parsePackPaymentForm(form({ stylusRef: "x".repeat(40) }), opts).ok).toBe(true);
  });

  it("the date floor (2020-01-01, as the database) and the reason cap (500, as the database)", () => {
    const opts = { now: NOW, instanceHasPrice: true };
    expect(parsePackPaymentForm(form({ receivedOn: "2019-12-31" }), opts)).toEqual({ ok: false, error: "date" });
    expect(parsePackPaymentForm(form({ receivedOn: "2020-01-01" }), opts).ok).toBe(true);
    const refund = { kind: "reembolso" };
    expect(parsePackPaymentForm(form({ ...refund, reason: "x".repeat(501) }), opts)).toEqual({ ok: false, error: "reason_long" });
    expect(parsePackPaymentForm(form({ ...refund, reason: "x".repeat(500) }), opts).ok).toBe(true);
    // Trimmed first: surrounding spaces do not count against the cap.
    expect(parsePackPaymentForm(form({ ...refund, reason: ` ${"x".repeat(500)} ` }), opts).ok).toBe(true);
  });

  it("'today' is the Lisbon date: just after midnight in Lisbon in summer, today's date is accepted", () => {
    // 23:30 UTC on 30 Jun is already 1 Jul in Lisbon.
    const late = new Date("2026-06-30T23:30:00Z");
    expect(parsePackPaymentForm(form({ receivedOn: "2026-07-01" }), { now: late, instanceHasPrice: true }).ok).toBe(true);
  });
});

describe("parseSellPackForm", () => {
  const PAT = "33333333-3333-4333-8333-333333333333";
  const PACK = "44444444-4444-4444-8444-444444444444";
  const f = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("needs a patient, a pacote and a TYPED price; 0 is a real price", () => {
    expect(parseSellPackForm(f({ patientId: PAT, packId: PACK, agreedPrice: "450" }))).toEqual({
      ok: true,
      value: { patientId: PAT, packId: PACK, agreedPriceCents: 45000 },
    });
    expect(parseSellPackForm(f({ patientId: PAT, packId: PACK, agreedPrice: "0" }))).toMatchObject({ ok: true });
    expect(parseSellPackForm(f({ patientId: PAT, packId: PACK }))).toEqual({ ok: false, error: "agreed_price_required" });
    expect(parseSellPackForm(f({ packId: PACK, agreedPrice: "1" }))).toEqual({ ok: false, error: "patient" });
    expect(parseSellPackForm(f({ patientId: PAT, agreedPrice: "1" }))).toEqual({ ok: false, error: "pack" });
  });
});

describe("the '€ POR RECEBER' filter", () => {
  it("keeps only the pacotes with money to receive; unpriced and paid ones are out", () => {
    const rows = [{ instanceId: "a" }, { instanceId: "b" }, { instanceId: "c" }, { instanceId: "d" }];
    const map = new Map([
      ["a", summarizePackPayments(45000, null, [])],
      ["b", summarizePackPayments(45000, null, [pay(45000, "2026-11-01")])],
      ["c", summarizePackPayments(null, null, [])],
    ]);
    expect(filterPorReceber(rows, map).map((r) => r.instanceId)).toEqual(["a"]);
  });
  it("reads the query safely and builds the URL", () => {
    expect(parsePorReceberFilter("por-receber")).toBe(true);
    expect(parsePorReceberFilter("x")).toBe(false);
    expect(parsePorReceberFilter(undefined)).toBe(false);
    expect(withPorReceberFilter("/patients/packs", true)).toBe("/patients/packs?pagamento=por-receber");
    expect(withPorReceberFilter("/patients/packs?q=ana", true)).toBe("/patients/packs?q=ana&pagamento=por-receber");
    expect(withPorReceberFilter("/patients/packs?q=ana", false)).toBe("/patients/packs?q=ana");
  });
});

describe("the words", () => {
  it("an error code maps to its message; an unknown code to nothing", () => {
    expect(packPaymentErrorKey("price_already_set")).toBe("packsPay.errPriceAlreadySet");
    expect(packPaymentErrorKey("toString")).toBeNull();
    expect(packPaymentErrorKey(undefined)).toBeNull();
    expect(packPaymentErrorKey("nope")).toBeNull();
  });

  it("the P9 methods, in the owner's order, with their pt-PT names", () => {
    expect(PACK_PAYMENT_METHODS.map((m) => s[PACK_METHOD_KEYS[m]])).toEqual([
      "Numerário",
      "MB WAY",
      "Multibanco",
      "Cartão (TPA)",
      "Transferência",
      "Outro",
    ]);
    expect(s[PACK_KIND_KEYS.correcao]).toBe("Correção");
  });

  it("no pack payment word claims a fiscal document (no Fatura, Recibo, Faturado)", () => {
    const keys = Object.keys(s).filter((k) => k.startsWith("packsPay.") || k.startsWith("packsSell.") || /^packsInUse\.(pay|received|paid|outstanding|noStylus|filter|countPor|sell|footnotePayments)/.test(k));
    expect(keys.length).toBeGreaterThan(50);
    // The one sentence that names the Stylus documents in order to say they
    // are NOT this record is the exception, and is checked separately.
    for (const k of keys.filter((x) => x !== "packsPay.notFiscal")) {
      expect(s[k as keyof typeof s], k).not.toMatch(/(?<!\p{L})(fatura|faturad[oa]|recibo)(?!\p{L})/iu);
    }
    // Control: the screen NAME Faturação is allowed and does not trip the check.
    expect("Faturação").not.toMatch(/(?<!\p{L})(fatura|faturad[oa]|recibo)(?!\p{L})/iu);
    expect("uma fatura").toMatch(/(?<!\p{L})(fatura|faturad[oa]|recibo)(?!\p{L})/iu);
    expect(s["packsPay.notFiscal"]).toMatch(/não fiscal/);
    expect(s["packsInUse.receivedMonth"]).toMatch(/registo interno, não fiscal/);
  });
});
