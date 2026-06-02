import { describe, expect, it } from "vitest";
import {
  centsToDecimalString,
  decimalStringToCents,
  taxNameForRate,
  toInvoiceReceiptInput,
  fromInvoiceReceipt,
  normalizeState,
  todayLisbon,
} from "./mapper";
import { OSTEOJP_FISCAL_PROFILE, SAMPLE_ISSUE_INPUT } from "./fixtures";

describe("money conversion (integer cents ⇄ euro decimal string)", () => {
  it("formats cents as a 2-decimal euro string", () => {
    expect(centsToDecimalString(6000)).toBe("60.00");
    expect(centsToDecimalString(6050)).toBe("60.50");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(0)).toBe("0.00");
    expect(centsToDecimalString(123456)).toBe("1234.56");
  });

  it("handles negatives (credit/adjustment)", () => {
    expect(centsToDecimalString(-6050)).toBe("-60.50");
  });

  it("rejects non-integer cents (no float money)", () => {
    expect(() => centsToDecimalString(60.5)).toThrowError(/integer cents/);
  });

  it("parses the decimal forms InvoiceXpress returns back to cents", () => {
    expect(decimalStringToCents("60.00")).toBe(6000);
    expect(decimalStringToCents("60.5")).toBe(6050);
    expect(decimalStringToCents("60")).toBe(6000);
    expect(decimalStringToCents(60)).toBe(6000);
    expect(decimalStringToCents("-60.50")).toBe(-6050);
    expect(decimalStringToCents(undefined)).toBe(0);
    expect(decimalStringToCents("")).toBe(0);
  });

  it("round-trips", () => {
    for (const c of [0, 5, 99, 100, 6000, 123456]) {
      expect(decimalStringToCents(centsToDecimalString(c))).toBe(c);
    }
  });
});

describe("taxNameForRate (PT VAT → InvoiceXpress tax name)", () => {
  it("maps the standard rate to IVA23", () => {
    expect(taxNameForRate(23)).toBe("IVA23");
  });
  it("maps the reduced/intermediate rates", () => {
    expect(taxNameForRate(6)).toBe("IVA6");
    expect(taxNameForRate(13)).toBe("IVA13");
  });
  it("maps 0% to the PT exemption label", () => {
    expect(taxNameForRate(0)).toBe("ISENTA");
  });
  it("rejects out-of-range / non-integer rates", () => {
    expect(() => taxNameForRate(-1)).toThrow();
    expect(() => taxNameForRate(101)).toThrow();
    expect(() => taxNameForRate(12.5)).toThrow();
  });
});

describe("toInvoiceReceiptInput (fatura-recibo mapping)", () => {
  it("maps an OsteoJP consultation to the InvoiceXpress wire shape", () => {
    const wire = toInvoiceReceiptInput(OSTEOJP_FISCAL_PROFILE, SAMPLE_ISSUE_INPUT);

    expect(wire.date).toBe("2026-06-02");
    // fatura-recibo settles on issue → due_date defaults to the document date.
    expect(wire.due_date).toBe("2026-06-02");
    expect(wire.observations).toBe("Pagamento em numerário.");
    expect(wire.client).toEqual({
      name: "Maria Silva",
      fiscal_id: "123456789",
      email: "maria.silva@example.pt",
    });
    expect(wire.items).toEqual([
      {
        name: "Consulta de Osteopatia",
        description: "Sessão de osteopatia — Linda-a-Velha",
        unit_price: "60.00",
        quantity: "1",
        tax: { name: "IVA23" },
      },
    ]);
  });

  it("defaults due_date to the document date and omits empty client fields", () => {
    const wire = toInvoiceReceiptInput(OSTEOJP_FISCAL_PROFILE, {
      client: { name: "Cliente Sem NIF" },
      items: [{ name: "X", unitPriceCents: 100, quantity: 2, vatRate: 23 }],
      date: "2026-01-10",
    });
    expect(wire.due_date).toBe("2026-01-10");
    expect(wire.client).toEqual({ name: "Cliente Sem NIF" });
    expect(wire.items[0].quantity).toBe("2");
    expect("description" in wire.items[0]).toBe(false);
  });

  it("passes the series id through when the profile carries one", () => {
    const wire = toInvoiceReceiptInput(
      { ...OSTEOJP_FISCAL_PROFILE, invoiceSeriesId: 42 },
      SAMPLE_ISSUE_INPUT,
    );
    expect(wire.sequence_id).toBe(42);
  });

  it("rejects an invoice with no items", () => {
    expect(() =>
      toInvoiceReceiptInput(OSTEOJP_FISCAL_PROFILE, {
        client: { name: "X" },
        items: [],
      }),
    ).toThrowError(/at least one item/);
  });
});

describe("todayLisbon", () => {
  it("renders a Lisbon-local YYYY-MM-DD", () => {
    // 2026-06-02T23:30Z is still 2026-06-03 in Lisbon (WEST, +1).
    expect(todayLisbon(new Date("2026-06-02T23:30:00Z"))).toBe("2026-06-03");
    expect(todayLisbon(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01-15");
  });
});

describe("wire → domain", () => {
  it("normalizes InvoiceXpress states", () => {
    expect(normalizeState("draft")).toBe("draft");
    expect(normalizeState("sent")).toBe("issued");
    expect(normalizeState("finalized")).toBe("issued");
    expect(normalizeState("settled")).toBe("settled");
    expect(normalizeState("canceled")).toBe("canceled");
    expect(normalizeState("cancelled")).toBe("canceled");
    expect(normalizeState("second_copy")).toBe("second_copy");
    expect(normalizeState(undefined)).toBe("issued");
  });

  it("maps an invoice_receipt response to IssuedInvoice", () => {
    expect(
      fromInvoiceReceipt({
        id: 9001,
        status: "sent",
        sequence_number: "FR 2026/1",
        total: "60.00",
        currency: "EUR",
        date: "2026-06-02",
        permalink: "https://osteojp.app.invoicexpress.com/permalink/abc",
      }),
    ).toEqual({
      id: 9001,
      sequenceNumber: "FR 2026/1",
      state: "issued",
      totalCents: 6000,
      currency: "EUR",
      date: "2026-06-02",
      permalink: "https://osteojp.app.invoicexpress.com/permalink/abc",
    });
  });

  it("defaults missing optional fields", () => {
    const out = fromInvoiceReceipt({ id: 1 });
    expect(out).toEqual({
      id: 1,
      sequenceNumber: null,
      state: "issued",
      totalCents: 0,
      currency: "EUR",
      date: null,
      permalink: null,
    });
  });
});
