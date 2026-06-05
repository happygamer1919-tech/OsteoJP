// Test fixtures grounded in OsteoJP's real details (osteojp.pt): the clinic
// name and its Linda-a-Velha location. NOT shipped in runtime code — the runtime
// fiscal profile comes from the tenant record + #4 BillingConfig (profile.ts),
// never hardcoded.
//
// The NIF here is a PLACEHOLDER. The real clinic NIF is owner-supplied and
// owner-gated (invoicing legal compliance, CLAUDE.md) — it is deliberately not
// committed.

import type {
  IssueInvoiceInput,
  TenantFiscalProfile,
} from "./types";

/** OsteoJP issuing profile. tenantId matches supabase/seed.sql tenant A. */
export const OSTEOJP_FISCAL_PROFILE: TenantFiscalProfile = {
  tenantId: "00000000-0000-0000-0000-0000000000a1",
  fiscalName: "OsteoJP",
  nif: "500000000", // PLACEHOLDER — real NIF is owner-gated, never committed.
  addressLine: "Linda-a-Velha",
  postalCode: "2795-000",
  city: "Linda-a-Velha",
  country: "Portugal",
  currency: "EUR",
  vatRate: 23, // PT standard rate — owner sign-off gated for real issuance (#107).
};

/** A consultation fatura-recibo for a seeded patient (Maria Silva). */
export const SAMPLE_ISSUE_INPUT: IssueInvoiceInput = {
  client: {
    name: "Maria Silva",
    nif: "123456789",
    email: "maria.silva@example.pt",
  },
  items: [
    {
      name: "Consulta de Osteopatia",
      description: "Sessão de osteopatia — Linda-a-Velha",
      unitPriceCents: 6000, // €60.00
      quantity: 1,
      vatRate: 23,
    },
  ],
  date: "2026-06-02",
  observations: "Pagamento em numerário.",
};
