// Clinic fiscal IDENTIFICATION for the clinical-report header.
//
// This is identification only — clinic fiscal name + NIF printed in the header.
// It is NOT a fiscal document (no fatura-recibo / ATCUD / QR / SAF-T).
//
// Source: the tenant record (tenants.name, tenants.nif). The #4 tenant
// BillingConfig (lib/admin/settings-config.ts) does NOT carry fiscal name/NIF
// yet, so those come from the tenant row; when absent they fall back to a clear
// PLACEHOLDER the owner replaces. Once BillingConfig gains structured fiscal
// fields, read them here in preference to the bare tenant columns.
//
// Pure module — no DB, no PII logging.

export type ClinicFiscalSource = {
  /** tenants.name */
  tenantName: string | null;
  /** tenants.nif */
  tenantNif: string | null;
};

export type ClinicFiscal = {
  fiscalName: string;
  nif: string;
};

// OWNER-GATED placeholders — replaced once the owner supplies the registered
// fiscal name + NIF. Deliberately obvious so a placeholder never reads as real.
export const FISCAL_NAME_PLACEHOLDER = "OsteoJP (nome fiscal por confirmar)";
export const FISCAL_NIF_PLACEHOLDER = "000000000";

/** Resolve the clinic fiscal identity, falling back to placeholders. */
export function resolveClinicFiscal(src: ClinicFiscalSource): ClinicFiscal {
  return {
    fiscalName: src.tenantName?.trim() || FISCAL_NAME_PLACEHOLDER,
    nif: src.tenantNif?.trim() || FISCAL_NIF_PLACEHOLDER,
  };
}
