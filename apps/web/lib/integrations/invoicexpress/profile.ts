// InvoiceXpress integration — build the issuing fiscal profile from tenant data
// + the #4 BillingConfig.
//
// This is the explicit seam onto #4 (PR #107): the tenant's billing defaults
// (currency, VAT rate) come straight from BillingConfig; the fiscal identity
// (name, NIF) comes from the tenant record.
//
// GAP, flagged deliberately: #4's BillingConfig does NOT yet carry the clinic's
// fiscal ADDRESS or the InvoiceXpress SERIES id. Those are required for a
// complete PT fatura-recibo but are owner-gated (fiscal address is part of the
// invoicing-legal-compliance surface CLAUDE.md marks owner-confirmable). Until
// they are added to tenant config, callers pass them via `fiscalExtras`. The
// profile is intentionally complete-by-type so the gap is visible, not silently
// defaulted to wrong values.

import type { BillingConfig } from "@/lib/admin/settings-config";
import type { TenantFiscalProfile } from "./types";

/** The subset of the tenant record the fiscal profile needs. */
export type TenantFiscalIdentity = {
  id: string;
  /** tenants.name — used as the clinic fiscal name. */
  name: string;
  /** tenants.nif — required to issue a fatura-recibo. May be null on a tenant. */
  nif: string | null;
};

/** Owner-gated fiscal inputs not yet carried by #4's BillingConfig. */
export type FiscalExtras = {
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  /** InvoiceXpress series/sequence id; omitted → account default series. */
  invoiceSeriesId?: number;
};

/**
 * Assemble a TenantFiscalProfile from the tenant record + #4 BillingConfig.
 * `nif` is carried through as-is (possibly ""); issueInvoice() is the gate that
 * rejects issuing without one, so this builder stays a pure projection.
 */
export function buildTenantFiscalProfile(
  tenant: TenantFiscalIdentity,
  billing: BillingConfig,
  fiscalExtras: FiscalExtras = {},
): TenantFiscalProfile {
  return {
    tenantId: tenant.id,
    fiscalName: tenant.name,
    nif: tenant.nif ?? "",
    addressLine: fiscalExtras.addressLine,
    postalCode: fiscalExtras.postalCode,
    city: fiscalExtras.city,
    country: fiscalExtras.country ?? "Portugal",
    currency: billing.currency, // #4 BillingConfig — EUR in V1
    vatRate: billing.vatRate, // #4 BillingConfig — 23% default, owner-gated (#107)
    invoiceSeriesId: fiscalExtras.invoiceSeriesId,
  };
}
