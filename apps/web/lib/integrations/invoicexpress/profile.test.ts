import { describe, expect, it } from "vitest";
import { buildTenantFiscalProfile } from "./profile";
import { DEFAULT_TENANT_CONFIG } from "@/lib/admin/settings-config";

// Proves the seam onto #4 (PR #107): the billing defaults (currency, VAT rate)
// flow straight from BillingConfig into the issuing fiscal profile.

const TENANT = {
  id: "00000000-0000-0000-0000-0000000000a1",
  name: "OsteoJP",
  nif: "500000000", // placeholder; real NIF owner-gated
};

describe("buildTenantFiscalProfile (from tenant record + #4 BillingConfig)", () => {
  it("pulls currency + VAT rate from BillingConfig and identity from the tenant", () => {
    const profile = buildTenantFiscalProfile(TENANT, DEFAULT_TENANT_CONFIG.billing);
    expect(profile).toMatchObject({
      tenantId: TENANT.id,
      fiscalName: "OsteoJP",
      nif: "500000000",
      currency: "EUR",
      vatRate: 23, // #4 default — owner sign-off gated (#107)
      country: "Portugal",
    });
  });

  it("carries a null tenant NIF through as empty (issue-time guard rejects it)", () => {
    const profile = buildTenantFiscalProfile(
      { ...TENANT, nif: null },
      DEFAULT_TENANT_CONFIG.billing,
    );
    expect(profile.nif).toBe("");
  });

  it("accepts the owner-gated fiscal extras not yet in #4 config", () => {
    const profile = buildTenantFiscalProfile(TENANT, DEFAULT_TENANT_CONFIG.billing, {
      addressLine: "Rua Example 1",
      postalCode: "2795-000",
      city: "Linda-a-Velha",
      invoiceSeriesId: 7,
    });
    expect(profile).toMatchObject({
      addressLine: "Rua Example 1",
      postalCode: "2795-000",
      city: "Linda-a-Velha",
      invoiceSeriesId: 7,
    });
  });
});
