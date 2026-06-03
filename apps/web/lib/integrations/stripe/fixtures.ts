// Test fixtures grounded in OsteoJP's seed data. NOT shipped in runtime code —
// at run time the tenant + invoice references come from the invoices ledger,
// never hardcoded.
//
// The Stripe ids here are PLACEHOLDERS in Stripe's id formats. No real key, no
// real PaymentIntent — the live happy path is owner-gated (see README / the
// describe.skip test).

import type { PaymentReference, SxPaymentIntent, SxRefund } from "./types";
import { META_INVOICE_ID, META_TENANT_ID } from "./mapper";

/** Internal reference for a seeded tenant A invoice. */
export const OSTEOJP_PAYMENT_REFERENCE: PaymentReference = {
  tenantId: "00000000-0000-0000-0000-0000000000a1",
  invoiceId: "00000000-0000-0000-0000-00000000d001",
};

/** A succeeded €60.00 PaymentIntent as Stripe would return it. */
export const SAMPLE_PAYMENT_INTENT: SxPaymentIntent = {
  id: "pi_3OsteoJPplaceholder",
  object: "payment_intent",
  status: "succeeded",
  amount: 6000, // €60.00 — Stripe minor units == our cents.
  currency: "eur",
  client_secret: "pi_3OsteoJPplaceholder_secret_placeholder",
  metadata: {
    [META_TENANT_ID]: OSTEOJP_PAYMENT_REFERENCE.tenantId,
    [META_INVOICE_ID]: OSTEOJP_PAYMENT_REFERENCE.invoiceId,
  },
};

/** A succeeded full refund of the sample payment. */
export const SAMPLE_REFUND: SxRefund = {
  id: "re_3OsteoJPplaceholder",
  object: "refund",
  status: "succeeded",
  amount: 6000,
  currency: "eur",
  payment_intent: SAMPLE_PAYMENT_INTENT.id,
};
