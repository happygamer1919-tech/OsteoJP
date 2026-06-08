// Test fixtures grounded in OsteoJP's real services (osteojp.pt): an osteopathy
// consultation at the Linda-a-Velha clinic. NOT shipped in runtime code — the
// runtime amount comes from the invoice on the ledger, never hardcoded.
//
// The mobile number + order id here are PLACEHOLDERS for tests only.

import type {
  IftCallbackParams,
  MbWayRequestInput,
  MultibancoReferenceInput,
} from "./types";

/** Matches supabase/seed.sql tenant A's invoice convention (a uuid orderId). */
export const SAMPLE_ORDER_ID = "00000000-0000-0000-0000-0000000000f1";

/** €60.00 — OsteoJP "Consulta de Osteopatia" (osteojp.pt), as integer cents. */
export const CONSULTATION_AMOUNT_CENTS = 6000;

export const SAMPLE_MULTIBANCO_INPUT: MultibancoReferenceInput = {
  orderId: SAMPLE_ORDER_ID,
  amountCents: CONSULTATION_AMOUNT_CENTS,
  description: "Consulta de Osteopatia",
  expiryDays: 3,
};

export const SAMPLE_MBWAY_INPUT: MbWayRequestInput = {
  orderId: SAMPLE_ORDER_ID,
  amountCents: CONSULTATION_AMOUNT_CENTS,
  mobileNumber: "351#912345678", // PLACEHOLDER — payer PII, never committed for real.
  description: "Consulta de Osteopatia",
};

/** A well-formed callback for tests. `key` is filled in per-test against the
 * test's expected anti-phishing secret. */
export const SAMPLE_CALLBACK_PARAMS: IftCallbackParams = {
  orderId: SAMPLE_ORDER_ID,
  amount: "60.00",
  requestId: "req-test-1",
  entity: "12345",
  reference: "123456789",
  payment_datetime: "2026-06-02 10:30:00",
};
