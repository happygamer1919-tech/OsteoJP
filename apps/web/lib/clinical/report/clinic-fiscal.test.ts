import { describe, expect, it } from "vitest";
import {
  resolveClinicFiscal,
  FISCAL_NAME_PLACEHOLDER,
  FISCAL_NIF_PLACEHOLDER,
} from "./clinic-fiscal";

describe("resolveClinicFiscal", () => {
  it("uses the tenant fiscal name + NIF when present", () => {
    expect(resolveClinicFiscal({ tenantName: "OsteoJP, Lda.", tenantNif: "515123456" })).toEqual({
      fiscalName: "OsteoJP, Lda.",
      nif: "515123456",
    });
  });

  it("falls back to placeholders when missing (owner-gated)", () => {
    expect(resolveClinicFiscal({ tenantName: null, tenantNif: null })).toEqual({
      fiscalName: FISCAL_NAME_PLACEHOLDER,
      nif: FISCAL_NIF_PLACEHOLDER,
    });
  });

  it("treats whitespace-only values as missing", () => {
    const r = resolveClinicFiscal({ tenantName: "   ", tenantNif: "  " });
    expect(r.fiscalName).toBe(FISCAL_NAME_PLACEHOLDER);
    expect(r.nif).toBe(FISCAL_NIF_PLACEHOLDER);
  });
});
