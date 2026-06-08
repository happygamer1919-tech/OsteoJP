import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_CONFIG,
  parseTenantConfig,
  validateConfigInput,
  type TenantConfigInput,
} from "./settings-config";

/** A fully-valid input baseline; tests override single fields off this. */
function baseInput(overrides: Partial<TenantConfigInput> = {}): TenantConfigInput {
  return {
    locale: "pt",
    reminderEmailEnabled: true,
    reminderSmsEnabled: false,
    reminderLeadTimeHours: [48, 24],
    billingCurrency: "EUR",
    billingVatRate: "23",
    billingInvoiceEmail: "",
    ...overrides,
  };
}

describe("parseTenantConfig (tolerant read)", () => {
  it("returns full defaults for an empty / non-object blob", () => {
    expect(parseTenantConfig({})).toEqual(DEFAULT_TENANT_CONFIG);
    expect(parseTenantConfig(undefined)).toEqual(DEFAULT_TENANT_CONFIG);
    expect(parseTenantConfig(null)).toEqual(DEFAULT_TENANT_CONFIG);
    expect(parseTenantConfig("nope")).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("honors a valid partial blob and defaults the rest", () => {
    const config = parseTenantConfig({ locale: "en" });
    expect(config.locale).toBe("en");
    expect(config.reminders).toEqual(DEFAULT_TENANT_CONFIG.reminders);
    expect(config.billing).toEqual(DEFAULT_TENANT_CONFIG.billing);
  });

  it("falls back to default locale on an unknown locale", () => {
    expect(parseTenantConfig({ locale: "fr" }).locale).toBe(DEFAULT_TENANT_CONFIG.locale);
  });

  it("drops invalid lead times, dedupes, and sorts earliest-first", () => {
    const config = parseTenantConfig({
      reminders: { leadTimeHours: [24, 12, 48, 24, 999] },
    });
    expect(config.reminders.leadTimeHours).toEqual([48, 24]);
  });

  it("keeps an empty lead-time list as-is (reminders disabled)", () => {
    const config = parseTenantConfig({ reminders: { leadTimeHours: [] } });
    expect(config.reminders.leadTimeHours).toEqual([]);
  });

  it("preserves explicit boolean channel toggles, including false", () => {
    const config = parseTenantConfig({
      reminders: { emailEnabled: false, smsEnabled: false },
    });
    expect(config.reminders.emailEnabled).toBe(false);
    expect(config.reminders.smsEnabled).toBe(false);
  });

  it("rejects out-of-range or non-integer VAT and falls back to default", () => {
    expect(parseTenantConfig({ billing: { vatRate: -1 } }).billing.vatRate).toBe(23);
    expect(parseTenantConfig({ billing: { vatRate: 101 } }).billing.vatRate).toBe(23);
    expect(parseTenantConfig({ billing: { vatRate: 12.5 } }).billing.vatRate).toBe(23);
    expect(parseTenantConfig({ billing: { vatRate: 6 } }).billing.vatRate).toBe(6);
  });

  it("falls back to EUR on an unknown currency", () => {
    expect(parseTenantConfig({ billing: { currency: "USD" } }).billing.currency).toBe("EUR");
  });
});

describe("validateConfigInput (strict write)", () => {
  it("accepts a valid input and normalizes lead times", () => {
    const result = validateConfigInput(baseInput({ reminderLeadTimeHours: [24, 48] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reminders.leadTimeHours).toEqual([48, 24]);
      expect(result.value.billing.vatRate).toBe(23);
    }
  });

  it("trims and accepts an empty invoice email", () => {
    const result = validateConfigInput(baseInput({ billingInvoiceEmail: "  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.billing.invoiceEmail).toBe("");
  });

  it("rejects an unknown locale", () => {
    const result = validateConfigInput(baseInput({ locale: "fr" }));
    expect(result).toEqual({ ok: false, field: "locale" });
  });

  it("rejects a lead time outside the allowed option set", () => {
    const result = validateConfigInput(baseInput({ reminderLeadTimeHours: [48, 12] }));
    expect(result).toEqual({ ok: false, field: "reminderLeadTimeHours" });
  });

  it("rejects an unknown currency", () => {
    const result = validateConfigInput(baseInput({ billingCurrency: "USD" }));
    expect(result).toEqual({ ok: false, field: "billingCurrency" });
  });

  it("rejects non-integer, out-of-range, or empty VAT", () => {
    for (const vat of ["12.5", "-1", "101", "", "abc"]) {
      const result = validateConfigInput(baseInput({ billingVatRate: vat }));
      expect(result).toEqual({ ok: false, field: "billingVatRate" });
    }
  });

  it("accepts boundary VAT values", () => {
    for (const vat of ["0", "100"]) {
      expect(validateConfigInput(baseInput({ billingVatRate: vat })).ok).toBe(true);
    }
  });

  it("rejects a malformed invoice email", () => {
    const result = validateConfigInput(baseInput({ billingInvoiceEmail: "not-an-email" }));
    expect(result).toEqual({ ok: false, field: "billingInvoiceEmail" });
  });
});
