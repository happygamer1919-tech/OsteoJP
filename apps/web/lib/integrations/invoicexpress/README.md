# InvoiceXpress integration (Phase 4)

Typed client + fatura-recibo mapping + the four operations (issue / retrieve /
void / list) + Inngest retry wiring for issuing PT fiscal documents through
[InvoiceXpress](https://invoicexpress.com).

**No live calls by default.** This module is built and fully unit-tested with
mocked HTTP. Two owner dependencies gate any real request — see _Owner gates_.

## Layout

| File | Responsibility |
|---|---|
| `config.ts` | Env credentials (`INVOICEXPRESS_API_KEY`, `INVOICEXPRESS_ACCOUNT_NAME`) + the gate that refuses to resolve them when unset. |
| `errors.ts` | Error taxonomy with a `retryable` flag; HTTP-status → retryability. |
| `client.ts` | Typed `fetch` client. `api_key` in the query (redacted from logs/errors); **all fiscal data in the body, never the URL**. |
| `mapper.ts` | Domain ⇄ wire. Integer cents ⇄ euro decimal strings; VAT % → account tax name (`IVA23`); state normalization. |
| `operations.ts` | `issueInvoice` / `retrieveInvoice` / `voidInvoice` / `listInvoices`. Tenant-scoped via the fiscal profile. |
| `profile.ts` | `buildTenantFiscalProfile()` — assembles the issuing profile from the tenant record + the #4 `BillingConfig`. |
| `types.ts` | Domain + wire models. |
| `inngest/` | Own Inngest app (`osteojp-invoicexpress`) + the durable, idempotent issue-with-retries function. |
| `fixtures.ts` | OsteoJP-grounded test fixtures (test-only; runtime data comes from the tenant). |

Served at `app/api/inngest/invoicexpress/route.ts`.

## Owner gates (do not bypass)

1. **API key.** `INVOICEXPRESS_API_KEY` + `INVOICEXPRESS_ACCOUNT_NAME` are
   owner-provisioned and **unset** in this repo. Until set, every operation
   throws `InvoiceXpressConfigError` before any network call. The one test that
   would hit the live sandbox is `describe.skip`-marked in
   `inngest/functions.test.ts` — **do not un-skip without the key**.
2. **VAT-23% sign-off (#107).** #4 stores the tenant VAT rate but it is **not**
   authorized to drive real invoices until the owner signs off
   (CLAUDE.md: invoicing legal compliance is owner-confirmable). The mapper
   builds the VAT reference; it does not authorize issuance.

## Gap onto #4 (`lib/admin/settings-config.ts`)

#4's `BillingConfig` carries **currency** and **vatRate** — both consumed by
`buildTenantFiscalProfile()`. It does **not** yet carry the clinic **fiscal
address** or the **InvoiceXpress series id**, both required for a complete PT
fatura-recibo. Those are owner-gated and currently passed via `FiscalExtras`.
Before real issuance they should be added to tenant config (a follow-up that
touches the owner-gated settings surface, intentionally out of scope here).

## Wiring the issue job (follow-up)

`inngest/functions.ts → runIssueInvoiceJob` is the seam. Once the gates clear it
should: load the tenant-scoped invoice + `buildTenantFiscalProfile()` from the
data layer, then call `issueInvoice(new InvoiceXpressClient(), profile, input)`.
The event (`invoice/issue.requested`) carries **ids only** — fiscal data is
loaded at run time, never stored in Inngest's event store (CLAUDE.md #7).
