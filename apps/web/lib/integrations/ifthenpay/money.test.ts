import { describe, expect, it } from "vitest";
import { centsToDecimalString, decimalStringToCents } from "./money";

describe("centsToDecimalString", () => {
  it("formats integer cents as a euro decimal string", () => {
    expect(centsToDecimalString(6000)).toBe("60.00");
    expect(centsToDecimalString(6050)).toBe("60.50");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(centsToDecimalString(0)).toBe("0.00");
  });

  it("rejects non-integer or negative amounts (no float money, no refunds here)", () => {
    expect(() => centsToDecimalString(60.5)).toThrow();
    expect(() => centsToDecimalString(-100)).toThrow();
  });
});

describe("decimalStringToCents", () => {
  it("parses the forms IfThenPay returns", () => {
    expect(decimalStringToCents("60.00")).toBe(6000);
    expect(decimalStringToCents("60")).toBe(6000);
    expect(decimalStringToCents("60.5")).toBe(6050);
    expect(decimalStringToCents(60)).toBe(6000);
    expect(decimalStringToCents("60,00")).toBe(6000); // tolerant of a comma
  });

  it("treats empty/undefined as zero", () => {
    expect(decimalStringToCents(undefined)).toBe(0);
    expect(decimalStringToCents("")).toBe(0);
  });

  it("round-trips with centsToDecimalString", () => {
    for (const c of [0, 5, 99, 6000, 12345]) {
      expect(decimalStringToCents(centsToDecimalString(c))).toBe(c);
    }
  });
});
