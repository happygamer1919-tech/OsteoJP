# Stripe integration

Typed client + card `PaymentIntent` operations (create / confirm / retrieve) + a
refund operation + a **signed and verified** webhook handler that records
payment status to the internal `invoices` ledger + Inngest retry wiring.

**No live calls by default.** This module is built and fully unit-tested with
mocked HTTP. The secret key is owner-gated and **unset** — see _Owner gates_.

Built to match the InvoiceXpress module convention (thin `fetch` client, no SDK
dependency, injectable for tests, error taxonomy with a `retryable` flag, own
Inngest app).

## Layout

| File | Responsibility |
|---|---|
| `config.ts` | Env credentials (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) + the gate that refuses to resolve them when unset. |
| `errors.ts` | Error taxonomy with a `retryable` flag; HTTP-status → retryability; signature-rejection type. |
| `client.ts` | Typed `fetch` client. Secret key in the **Authorization header** (never the URL); form-encoded bodies; `Idempotency-Key` support. |
| `mapper.ts` | Wire ⇄ domain. Stripe minor units == our cents (1:1); status normalization; metadata reference. |
| `operations.ts` | `createPaymentIntent` / `confirmPaymentIntent` / `retrievePaymentIntent` / `refundPayment`. Tenant-scoped via metadata. |
| `webhook.ts` | `constructEvent()` — Stripe `Stripe-Signature` (`t`,`v1`) HMAC-SHA256 verification over the raw body, with a tolerance window. |
| `ledger.ts` | Pure projection: authoritative payment/refund → `invoices` ledger update intent (`paid` / `void` / no-op). |
| `types.ts` | Domain + wire models. No field can carry a PAN. |
| `inngest/` | Own Inngest app (`osteojp-stripe`) + the durable, event-idempotent record-payment-with-retries function. |
| `fixtures.ts` | OsteoJP-grounded test fixtures (test-only). |

Served at `app/api/inngest/stripe/route.ts`. The inbound webhook receiver is
`app/api/v1/integrations/stripe/webhook/route.ts`.

## Flow

```
Stripe ──POST──▶ /api/v1/integrations/stripe/webhook
                   1. read RAW body
                   2. constructEvent()  ── verify signature + timestamp  (400 on fail)
                   3. resolve tenant_id + invoice_id from VERIFIED metadata
                   4. enqueue  stripe/webhook.received  (IDS ONLY)
                                  │
                                  ▼
              Inngest  record-stripe-payment  (retries=4, idempotency=event id)
                   5. retrievePaymentIntent()  ── authoritative status (not the body)
                   6. paymentIntentToLedgerUpdate() → UPDATE invoices (tenant-scoped)
```

Step 5–6 (`runRecordPaymentJob`) are the **unwired seam** — owner-gated, see
below.

## Constraints honoured

- **Tenant-scoped.** The tenant + invoice id ride in `PaymentIntent.metadata`;
  the webhook resolves them from the **verified** payload and the job re-fetches
  authoritative state — no cross-tenant write, no trusting an unverified amount.
- **Never store card PAN.** The only card reference accepted is a Stripe
  PaymentMethod token (`pm_…`). No type in this module can hold a PAN.
- **Payment data never in logs or URLs.** Secret key in the Authorization
  header, not the URL; errors carry HTTP status + Stripe's machine code only
  (never amounts, emails, the `client_secret`); Inngest events carry ids only.
- **EUR**, internal ledger only, **no self-issued fiscal document** (PT
  certified-billing law — fiscal docs are issued by the AT-certified provider,
  relayed via InvoiceXpress; this module only records ledger payment state).

## Owner gates (do not bypass)

1. **Secret key.** `STRIPE_SECRET_KEY` (and `STRIPE_WEBHOOK_SECRET` for inbound
   verification) are owner-provisioned and **unset** in this repo. Until set,
   every operation throws `StripeConfigError` before any network call. The one
   test that would hit live/test Stripe is `describe.skip`-marked in
   `inngest/functions.test.ts` — **do not un-skip without the key**.
2. **VAT-23% sign-off (#107).** A payment settles an invoice whose VAT rate is
   **not** authorized to drive real billing until the owner signs off
   (CLAUDE.md: invoicing legal compliance is owner-confirmable).

The Stripe entity is the clinic's PT entity; provisioning the key is the owner's
call.

## Wiring the record job (follow-up)

`inngest/functions.ts → runRecordPaymentJob` is the seam. Once the gates clear it
should: build a `StripeClient`, `retrievePaymentIntent(client, paymentIntentId)`
for authoritative status, project via `paymentIntentToLedgerUpdate()` (or
`refundToLedgerUpdate()` for refund events), and apply the tenant-scoped UPDATE
to `invoices` (tenant_id set explicitly). The event carries **ids only** —
payment data is re-fetched at run time, never stored in Inngest's event store
(CLAUDE.md #7).
