"use server";
import "server-only";

import { can } from "@osteojp/auth";
import { credentialsConfigured } from "@/lib/integrations/invoicexpress";
import { getRequestContext } from "@/lib/auth/context";

// JP-GATED TODO (#107): IVA rate fixed at 0% per art. 9.º n.º 1 CIVA until the
// owner signs off on any rate change. Do NOT use billing.vatRate (its default
// is 23%, which is incorrect for osteopathy services under this VAT exemption).
// No discount line, no protocol/convenção label (JP-GATED TODO in invoice template).
export const ISSUANCE_VAT_RATE = 0 as const;

export type IssueInvoiceResult =
  | { ok: true; externalId: string }
  | {
      ok: false;
      error:
        | "not_configured"
        | "unauthenticated"
        | "forbidden"
        | "not_found"
        | "invalid_tenant"
        | "server_error";
    };

/**
 * Issue a fatura-recibo via the InvoiceXpress relay for the given local invoice.
 *
 * GATED OFF in production: both INVOICEXPRESS_API_KEY and INVOICEXPRESS_ACCOUNT_NAME
 * must be set in the environment for any call to proceed. In staging/prod these are
 * left unset — the function returns not_configured immediately and the "Nova fatura"
 * button is hidden on the client. Sandbox only.
 */
export async function issueInvoiceAction(invoiceId: string): Promise<IssueInvoiceResult> {
  // Gate 1: credentials must be present. Checked before any auth call so the
  // server never does work when the feature is disabled.
  if (!credentialsConfigured()) {
    return { ok: false, error: "not_configured" };
  }

  // Gate 2: authenticated session.
  const ctx = await getRequestContext();
  if (!ctx) return { ok: false, error: "unauthenticated" };

  // Gate 3: role must have invoices:issue (owner, admin, reception — NOT therapist).
  if (!can(ctx.role, "invoices:issue")) {
    return { ok: false, error: "forbidden" };
  }

  // Full IX issuance path — only reachable in sandbox with configured credentials.
  // The DB read, fiscal profile build, and InvoiceXpress API call live here.
  // Implementation deferred to the Phase-4 issuance PR; this shell ensures the
  // gating is in place and the action is wired before the button appears.
  void invoiceId;
  return { ok: false, error: "server_error" };
}
