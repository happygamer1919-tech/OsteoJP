import { describe, expect, it, vi } from "vitest";

// errors.ts is server-only; neutralise it for the node runner.
vi.mock("server-only", () => ({}));

import { isAdminError } from "./errors";
import { MAX_PRICE_CENTS, parsePriceToCents } from "./price-input";

const code = (raw: string): string | null => {
  try {
    parsePriceToCents(raw);
    return null;
  } catch (e) {
    return isAdminError(e) ? e.code : "not-an-admin-error";
  }
};

describe("parsePriceToCents", () => {
  it("reads a plain decimal with a dot or a comma, in cents", () => {
    expect(parsePriceToCents("390")).toBe(39000);
    expect(parsePriceToCents("47.50")).toBe(4750);
    expect(parsePriceToCents("47,5")).toBe(4750);
    expect(parsePriceToCents("  12.34 ")).toBe(1234);
    expect(parsePriceToCents("0")).toBe(0);
  });

  it("blank is null, for the caller to decide", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("   ")).toBeNull();
  });

  it("refuses hex, scientific, signs, infinities and thousands separators as invalid", () => {
    for (const raw of ["0x10", "1e3", "1E2", "+5", "-5", "Infinity", "NaN", "1.000,50", "12.", ".5", "1 000"]) {
      expect(code(raw), raw).toBe("invalid");
    }
  });

  it("has an upper bound: the bound itself passes, one cent above is invalid", () => {
    expect(parsePriceToCents(String(MAX_PRICE_CENTS / 100))).toBe(MAX_PRICE_CENTS);
    expect(code((MAX_PRICE_CENTS / 100 + 0.01).toFixed(2))).toBe("invalid");
    expect(code("99999999999")).toBe("invalid");
  });
});
