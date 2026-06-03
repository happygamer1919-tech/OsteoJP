# IfThenPay integration

Typed client + Multibanco reference generation + MB Way payment requests + an
anti-spoofed payment callback handler + reconciliation onto the **internal
invoices ledger** + Inngest retry wiring, for collecting payments through
[IfThenPay](https://www.ifthenpay.com).

**No live calls by default.** This module is built and fully unit-tested with
mocked HTTP. The IfThenPay keys are owner-gated (clinic PT entity) and unset —
see _Owner gate_.

**Payments only — never fiscal.** IfThenPay records *payment status* to the
internal ledger; it **never self-issues a fiscal document**. PT certified-billing
law means the fatura/recibo is issued by the AT-certified provider via the
**InvoiceXpress relay** (`lib/integrations/invoicexpress`). The two modules are
independent: this one collects money and marks the invoice paid; that one issues
the legal document.

## Layout

| File | Responsibility |
|---|---|
| `config.ts` | Env keys (`IFTHENPAY_MB_KEY`, `IFTHENPAY_MBWAY_KEY`, `IFTHENPAY_ANTIPHISHING_KEY`, `IFTHENPAY_BASE_URL`) + the gates that refuse to resolve them when unset. |
| `errors.ts` | Error taxonomy with a `retryable` flag; HTTP-status → retryability; the callback-auth error. |
| `client.ts` | Typed `fetch` client. **All keys + payment data in the body, never the URL**; response bodies dropped from errors. |
| `money.ts` | Integer cents ⇄ euro decimal strings. No float money. |
| `multibanco.ts` | `generateMultibancoReference()` — entity + reference for an unpaid invoice. |
| `mbway.ts` | `requestMbWayPayment()` — push a payment request to the payer's MB Way app. |
| `callback.ts` | **Anti-spoof gate.** Constant-time anti-phishing key check, then normalize. |
| `reconciliation.ts` | Match a validated callback to its invoice (by orderId), guard the amount, idempotently mark paid — via the ledger port. |
| `ledger.ts` / `ledger-drizzle.ts` | The `PaymentLedgerPort` seam + its `server-only` Drizzle adapter (tenant-scoped, audited, idempotent). |
| `types.ts` | Domain + wire models. |
| `inngest/` | Own Inngest app (`osteojp-ifthenpay`) + the durable, idempotent reconcile-with-retries function. |
| `fixtures.ts` | OsteoJP-grounded test fixtures (test-only; runtime amounts come from the invoice). |

Served at `app/api/inngest/ifthenpay/route.ts`. Public callback webhook at
`app/api/webhooks/ifthenpay/route.ts`.

## Flow

1. **Collect** — `generateMultibancoReference()` / `requestMbWayPayment()` create a
   payment request against the invoice (`orderId == invoices.id`, tenant-owned).
2. **Callback** — IfThenPay calls `GET /api/webhooks/ifthenpay` with the
   anti-phishing key. The route authenticates it (constant-time), emits a PII-free
   Inngest event, and acks `200` fast.
3. **Reconcile** — the Inngest function loads the invoice (tenant-scoped via the
   Drizzle port), matches the amount, and marks it `paid` + writes an audit row,
   idempotently. A re-delivered callback never settles twice.

## Anti-spoof + payment secrecy

- The callback anti-phishing key is compared in **constant time**
  (`crypto.timingSafeEqual`) and then **discarded** — it never enters a
  normalized callback, an Inngest event, or a log.
- Keys (MB / MB Way / anti-phishing) and payer contact (phone, email) live in
  request **bodies only** — never a URL, never a log, never an error message.
- The reconcile event carries **ids + the settled amount only**; the tenant is
  resolved from the invoice row at run time.

## Owner gate (do not bypass)

`IFTHENPAY_MB_KEY` / `IFTHENPAY_MBWAY_KEY` / `IFTHENPAY_ANTIPHISHING_KEY` are
owner-provisioned (the sandbox keys are tied to the clinic's PT entity) and
**unset** in this repo. Until set:

- every outbound operation throws `IfThenPayConfigError` **before any fetch**;
- every inbound callback is **rejected fail-closed** (no key → no settlement).

The one test that would hit the live sandbox is `describe.skip`-marked in
`inngest/functions.test.ts` — **do not un-skip it without the keys**.

## Follow-ups (out of scope here)

- **Session-proxy exclusion.** The public webhook path
  `/api/webhooks/ifthenpay` must be added to the `apps/web/proxy.ts` matcher
  (alongside `api/inngest` and `api/v1/ingestion`) or it is redirected to
  `/login` in deployed envs. `proxy.ts` is owned by the hardening lane — left as
  a flagged TODO, not edited from this stream.
- **Request emission wiring.** The staff/invoicing UI that triggers
  `generateMultibancoReference` / `requestMbWayPayment` for a given invoice is a
  separate surface; this module ships the client + operations it will call.
