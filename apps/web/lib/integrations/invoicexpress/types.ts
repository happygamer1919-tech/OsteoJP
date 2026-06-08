// InvoiceXpress integration — request/response models.
//
// Two layers, deliberately separated:
//   1. DOMAIN types (our side) — money in integer CENTS (CLAUDE.md rule), our
//      naming, tenant-scoped. This is what app code passes to the operations.
//   2. WIRE types (`Ix*`) — the exact JSON shapes InvoiceXpress accepts/returns.
//      Money is euro DECIMAL STRINGS ("10.00"), keys are snake_case. The mapper
//      (mapper.ts) is the only place that converts between the two.
//
// fatura-recibo == InvoiceXpress `invoice_receipts` resource: the PT
// invoice-receipt issued + settled in one document, which is OsteoJP's format
// for a paid consultation.

/* ================================================================== */
/* Domain — fiscal identity                                            */
/* ================================================================== */

/**
 * The fiscal identity an invoice is issued UNDER (the clinic/tenant), assembled
 * per-tenant. Sourced from the tenant record (name, NIF) + the #4 BillingConfig
 * (currency, vatRate). `addressLine`/`postalCode`/`city` and `invoiceSeriesId`
 * are NOT yet carried by #4's BillingConfig — see mapper.ts / the module README:
 * they are owner-gated inputs that must be added to tenant config before real
 * issuance. Modeled here so the contract is complete and type-checked.
 */
export type TenantFiscalProfile = {
  tenantId: string;
  /** Clinic legal/fiscal name (tenants.name). */
  fiscalName: string;
  /** Clinic NIF (tenants.nif). Required to issue a PT fiscal document. */
  nif: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  /** ISO-4217. EUR-only in V1 (#4 BillingConfig.currency). */
  currency: "EUR";
  /** Whole-percent VAT (#4 BillingConfig.vatRate). Owner sign-off gated (#107). */
  vatRate: number;
  /**
   * InvoiceXpress sequence/series id the document is filed under. Optional:
   * when omitted, the account's default series is used. Not in #4 config yet.
   */
  invoiceSeriesId?: number;
};

/* ================================================================== */
/* Domain — invoice inputs/outputs                                     */
/* ================================================================== */

/** The patient/customer the fatura-recibo is made out to. */
export type InvoiceClient = {
  /** Patient full name. */
  name: string;
  /** Patient NIF. Optional — a PT consumer invoice may be issued without one. */
  nif?: string;
  email?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
};

/** One billable line. Money in integer cents; VAT as whole percent. */
export type InvoiceLineItem = {
  name: string;
  description?: string;
  /** Unit price in integer cents (e.g. 6000 = €60.00). */
  unitPriceCents: number;
  quantity: number;
  /** Whole-percent VAT for this line (usually the tenant's rate). */
  vatRate: number;
};

export type InvoiceObservationsInput = {
  /** Free-text note printed on the document (e.g. payment ref). No PII required. */
  observations?: string;
};

/** Everything needed to issue one fatura-recibo. */
export type IssueInvoiceInput = InvoiceObservationsInput & {
  client: InvoiceClient;
  items: InvoiceLineItem[];
  /** Document date (YYYY-MM-DD, Europe/Lisbon). Defaults to today if omitted. */
  date?: string;
  /** Due date (YYYY-MM-DD). For a fatura-recibo, defaults to the document date. */
  dueDate?: string;
};

/** Lifecycle states we surface, normalized from InvoiceXpress document states. */
export type InvoiceState = "draft" | "issued" | "settled" | "canceled" | "second_copy";

/** The result of issuing/retrieving a fatura-recibo. */
export type IssuedInvoice = {
  /** InvoiceXpress document id — stored on invoices.external_invoice_id. */
  id: number;
  /** Human-facing sequence number, e.g. "FR 2026/1". */
  sequenceNumber: string | null;
  state: InvoiceState;
  /** Total in integer cents, converted back from the wire decimal. */
  totalCents: number;
  currency: string;
  date: string | null;
  /** Signed/public document link, when InvoiceXpress returns one. */
  permalink: string | null;
};

export type ListInvoicesInput = {
  /** 1-based page. */
  page?: number;
  /** Filter by normalized state. */
  state?: InvoiceState;
  /** Non-PII text filter passed through to InvoiceXpress (e.g. our reference). */
  query?: string;
};

export type ListInvoicesResult = {
  invoices: IssuedInvoice[];
  page: number;
  totalPages: number;
  totalEntries: number;
};

/* ================================================================== */
/* Wire — InvoiceXpress JSON shapes                                    */
/* ================================================================== */

export type IxClient = {
  name: string;
  code?: string;
  email?: string;
  fiscal_id?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
};

export type IxItem = {
  name: string;
  description?: string;
  /** Euro decimal string, e.g. "60.00". */
  unit_price: string;
  quantity: string;
  /** Tax referenced by the name configured in the InvoiceXpress account. */
  tax?: { name: string };
};

export type IxInvoiceReceiptInput = {
  date: string;
  due_date: string;
  client: IxClient;
  items: IxItem[];
  observations?: string;
  /** Series/sequence id; omitted → account default. */
  sequence_id?: number;
};

/** Request envelope. InvoiceXpress wraps the document under its resource key. */
export type IxInvoiceReceiptRequestBody = {
  invoice_receipt: IxInvoiceReceiptInput;
};

export type IxInvoiceReceipt = {
  id: number;
  status?: string;
  sequence_number?: string;
  total?: string;
  currency?: string;
  date?: string;
  permalink?: string;
};

export type IxInvoiceReceiptResponse = {
  invoice_receipt: IxInvoiceReceipt;
};

export type IxListResponse = {
  invoice_receipts?: IxInvoiceReceipt[];
  /** InvoiceXpress pagination block. */
  pagination?: {
    total_pages?: number | string;
    total_entries?: number | string;
    current_page?: number | string;
  };
};
