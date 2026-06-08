// InvoiceXpress integration — fatura-recibo mapping (domain ⇄ wire).
//
// The ONLY place that converts between our domain types (integer cents, our
// naming) and the InvoiceXpress JSON wire shapes (euro decimal strings,
// snake_case). Pure + side-effect-free → fully unit-testable without a network.
//
// PT fiscal specifics baked in here:
//   - Money is integer cents in the domain; InvoiceXpress wants euro decimal
//     strings ("60.00"). Conversion is integer-based — never float arithmetic
//     on money (CLAUDE.md money rule).
//   - VAT is referenced by a TAX NAME configured in the InvoiceXpress account
//     (e.g. "IVA23"), not a raw percent. taxNameForRate() maps the tenant's
//     whole-percent rate to that name. The account must have the matching tax
//     configured (owner setup) — see the module README.
//   - fatura-recibo (invoice_receipts) is issued AND settled in one document, so
//     due_date defaults to the document date.

import type {
  IssueInvoiceInput,
  IssuedInvoice,
  InvoiceLineItem,
  InvoiceState,
  IxClient,
  IxInvoiceReceipt,
  IxInvoiceReceiptInput,
  IxItem,
  TenantFiscalProfile,
} from "./types";

/* ================================================================== */
/* Money                                                               */
/* ================================================================== */

/** 6000 → "60.00". Integer-only; no float math on money. */
export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("invoicexpress/mapper: amount must be integer cents");
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100);
  const rem = abs % 100;
  return `${sign}${euros}.${rem.toString().padStart(2, "0")}`;
}

/** "60.00" / "60" / 60 → 6000 cents. Tolerant of the forms InvoiceXpress returns. */
export function decimalStringToCents(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const s = String(value).trim();
  if (s === "") return 0;
  const neg = s.startsWith("-");
  const [intPart, fracPart = ""] = s.replace(/^-/, "").split(".");
  const cents =
    Number(intPart) * 100 + Number((fracPart + "00").slice(0, 2));
  if (!Number.isFinite(cents)) {
    throw new Error("invoicexpress/mapper: unparseable money value");
  }
  return neg ? -cents : cents;
}

/* ================================================================== */
/* VAT                                                                 */
/* ================================================================== */

/**
 * Map a whole-percent VAT rate to the InvoiceXpress account tax NAME. 0% →
 * "ISENTA" (PT exemption label); otherwise "IVA<rate>". The named tax must exist
 * in the account. The default rate (23%) is OWNER-GATED before real issuance
 * (#107) — this function only builds the reference; it does not authorize it.
 */
export function taxNameForRate(vatRate: number): string {
  if (!Number.isInteger(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error("invoicexpress/mapper: vatRate must be an integer 0–100");
  }
  return vatRate === 0 ? "ISENTA" : `IVA${vatRate}`;
}

/* ================================================================== */
/* Domain → wire                                                       */
/* ================================================================== */

function mapItem(item: InvoiceLineItem): IxItem {
  const wire: IxItem = {
    name: item.name,
    unit_price: centsToDecimalString(item.unitPriceCents),
    quantity: String(item.quantity),
    tax: { name: taxNameForRate(item.vatRate) },
  };
  if (item.description) wire.description = item.description;
  return wire;
}

function mapClient(input: IssueInvoiceInput["client"]): IxClient {
  const client: IxClient = { name: input.name };
  if (input.nif) client.fiscal_id = input.nif;
  if (input.email) client.email = input.email;
  if (input.addressLine) client.address = input.addressLine;
  if (input.postalCode) client.postal_code = input.postalCode;
  if (input.city) client.city = input.city;
  return client;
}

/**
 * Build the InvoiceXpress `invoice_receipt` body from domain input + the
 * tenant's fiscal profile. The profile contributes the SERIES and is the source
 * of truth for which tenant is issuing; per-line VAT comes from the items.
 */
export function toInvoiceReceiptInput(
  profile: TenantFiscalProfile,
  input: IssueInvoiceInput,
): IxInvoiceReceiptInput {
  if (input.items.length === 0) {
    throw new Error("invoicexpress/mapper: an invoice needs at least one item");
  }
  const date = input.date ?? todayLisbon();
  const body: IxInvoiceReceiptInput = {
    date,
    // fatura-recibo is settled on issue → due_date == date unless overridden.
    due_date: input.dueDate ?? date,
    client: mapClient(input.client),
    items: input.items.map(mapItem),
  };
  if (input.observations) body.observations = input.observations;
  if (profile.invoiceSeriesId !== undefined) {
    body.sequence_id = profile.invoiceSeriesId;
  }
  return body;
}

/** Document date in Europe/Lisbon as YYYY-MM-DD (PT invoices are local-dated). */
export function todayLisbon(now: Date = new Date()): string {
  // en-CA yields ISO-ordered YYYY-MM-DD; timeZone shifts to Lisbon wall-clock.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/* ================================================================== */
/* Wire → domain                                                       */
/* ================================================================== */

/** Normalize InvoiceXpress document `status` strings to our InvoiceState. */
export function normalizeState(raw: string | undefined): InvoiceState {
  switch ((raw ?? "").toLowerCase()) {
    case "draft":
      return "draft";
    case "sent":
    case "final":
    case "finalized":
      return "issued";
    case "settled":
    case "paid":
      return "settled";
    case "canceled":
    case "cancelled":
    case "deleted":
      return "canceled";
    case "second_copy":
      return "second_copy";
    default:
      return "issued";
  }
}

/** Map an InvoiceXpress invoice_receipt object to our IssuedInvoice. */
export function fromInvoiceReceipt(ix: IxInvoiceReceipt): IssuedInvoice {
  return {
    id: ix.id,
    sequenceNumber: ix.sequence_number ?? null,
    state: normalizeState(ix.status),
    totalCents: decimalStringToCents(ix.total),
    currency: ix.currency ?? "EUR",
    date: ix.date ?? null,
    permalink: ix.permalink ?? null,
  };
}
