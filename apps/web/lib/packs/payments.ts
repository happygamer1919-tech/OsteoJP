import { formatEurosShort } from "./in-use";

/**
 * PACK PAYMENTS, the pure half (owner answers of 2026-11-05 to the U4 b design
 * note; strategy B4: "Pack payments must reconcile with Stylus ruling S2 and
 * never touch an invoices table").
 *
 * Everything that decides a word or a number on the screen is here, so it is
 * tested without a database. The reads and the writes only move rows.
 *
 * ==========================================================================
 * WHAT THIS RECORDS, AND WHAT IT NEVER IS
 * ==========================================================================
 * An INTERNAL record of money received for a pacote: the price agreed with the
 * patient and the lines of money in (pagamento), back (reembolso) and the
 * adjustments that make the platform match Stylus (correcao). It is never a
 * fiscal document. Stylus stays the fiscal system (S1); a pacote sale and its
 * sessions are never posted to Stylus automatically (S2); the screens never
 * say "Fatura", "Recibo" or "Faturado". The Stylus reference is copied by hand
 * and never generated.
 *
 * ==========================================================================
 * THE NUMBERS, DERIVED AND NEVER STORED
 * ==========================================================================
 *   received = sum of every line's amount (refunds are negative);
 *   due      = agreed price + the switch amount (0083), when a price is stated;
 *   state    = "unpriced" when nobody stated the price ("Preço por indicar"),
 *              "due" when due - received > 0 ("Por receber"),
 *              "paid" otherwise ("Recebido").
 * A pacote with no stated price NEVER reads "Por receber" computed from today's
 * catalogue: the catalogue price can change after the sale and ignores
 * per-clinic prices (design note 1.6, "Packs already running today").
 */

export const PACK_PAYMENT_KINDS = ["pagamento", "reembolso", "correcao"] as const;
export type PackPaymentKind = (typeof PACK_PAYMENT_KINDS)[number];

/** P9, in the order the owner listed them. Codes are the database's values. */
export const PACK_PAYMENT_METHODS = [
  "numerario",
  "mbway",
  "multibanco",
  "cartao",
  "transferencia",
  "outro",
] as const;
export type PackPaymentMethod = (typeof PACK_PAYMENT_METHODS)[number];

/** The database's bounds, restated so a form refuses before the database does. */
export const STYLUS_REF_MAX = 40;
export const REASON_MAX = 500;
/** No payment line is dated before this (the database's received_on floor). */
export const RECEIVED_ON_FLOOR = "2020-01-01";
export const MAX_PACK_AMOUNT_CENTS = 10_000_000;

/** One line as the read hands it over. */
export type PackPaymentLine = {
  id: string;
  kind: PackPaymentKind;
  amountCents: number;
  /** Lisbon calendar date, YYYY-MM-DD. */
  receivedOn: string;
  method: PackPaymentMethod | null;
  stylusRef: string | null;
  reason: string | null;
  locationName: string | null;
  createdAt: Date;
};

export type PackPaymentState = "unpriced" | "due" | "paid";

export type PackPaymentSummary = {
  agreedPriceCents: number | null;
  /** 0083's switch amount, part of what is due. */
  switchAmountCents: number | null;
  dueCents: number | null;
  receivedCents: number;
  /** due - received; null while the price is unstated. Can be negative (received more). */
  outstandingCents: number | null;
  state: PackPaymentState;
  /** "Pagou a dd/mm/aaaa": the latest pagamento date, shown only once paid. */
  lastPaidOn: string | null;
  /** Lines with no Stylus reference yet (P3: flagged when missing). */
  linesWithoutStylusRef: number;
  /** "Recebido a mais": what was received beyond what is due; 0 when not overpaid or unpriced. */
  overpaidCents: number;
};

/** The minimum each summary needs from a line. */
export type PackPaymentLineCore = Pick<PackPaymentLine, "kind" | "amountCents" | "receivedOn" | "stylusRef">;

export function summarizePackPayments(
  agreedPriceCents: number | null,
  switchAmountCents: number | null,
  lines: readonly PackPaymentLineCore[],
): PackPaymentSummary {
  const receivedCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
  const dueCents = agreedPriceCents === null ? null : agreedPriceCents + (switchAmountCents ?? 0);
  const outstandingCents = dueCents === null ? null : dueCents - receivedCents;
  const state: PackPaymentState =
    dueCents === null ? "unpriced" : outstandingCents! > 0 ? "due" : "paid";
  let lastPaidOn: string | null = null;
  if (state === "paid") {
    for (const l of lines) {
      if (l.kind !== "pagamento") continue;
      if (lastPaidOn === null || l.receivedOn > lastPaidOn) lastPaidOn = l.receivedOn;
    }
  }
  const linesWithoutStylusRef = lines.filter((l) => l.kind !== "correcao" && !l.stylusRef).length;
  return {
    agreedPriceCents,
    switchAmountCents,
    dueCents,
    receivedCents,
    outstandingCents,
    state,
    lastPaidOn,
    linesWithoutStylusRef,
    overpaidCents: outstandingCents !== null && outstandingCents < 0 ? -outstandingCents : 0,
  };
}

/** "dd/mm/aaaa" from a YYYY-MM-DD calendar date, with no time zone involved. */
export function formatCalendarDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}

/** Signed euros for a line: "-50" for a refund, "120,50" for a payment. */
export function formatSignedEuros(cents: number): string {
  return cents < 0 ? `-${formatEurosShort(-cents)}` : formatEurosShort(cents);
}

/** The Lisbon calendar date of an instant, YYYY-MM-DD. */
export function lisbonDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The first and the last calendar day of the Lisbon month that `now` falls in. */
export function lisbonMonthBounds(now: Date): { first: string; last: string } {
  const today = lisbonDate(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { first: `${y}-${mm}-01`, last: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/* ======================================================================== */
/* THE FORMS                                                                */
/* ======================================================================== */

export type PackPaymentFormError =
  | "kind"
  | "amount"
  | "date"
  | "date_future"
  | "method"
  | "location"
  | "stylus_ref"
  | "reason"
  | "agreed_price"
  | "agreed_price_required"
  | "reason_long";

const PLAIN_DECIMAL = /^\d+(?:[.,]\d{1,2})?$/;

/**
 * Euros typed into a form, to cents. Blank is null. Digits with at most one
 * "." or "," and two decimals; no sign (the kind carries the sign); refused
 * above the database's bound.
 */
export function parseEurosToCents(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (!t) return null;
  if (!PLAIN_DECIMAL.test(t)) return "invalid";
  const cents = Math.round(Number(t.replace(",", ".")) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > MAX_PACK_AMOUNT_CENTS) return "invalid";
  return cents;
}

export type PackPaymentInput = {
  instanceId: string;
  kind: PackPaymentKind;
  /** Signed as stored: pagamento > 0, reembolso < 0, correcao <> 0. */
  amountCents: number;
  receivedOn: string;
  method: PackPaymentMethod | null;
  locationId: string;
  stylusRef: string | null;
  reason: string | null;
  /** Typed with the first payment when the pacote has no price yet. */
  agreedPriceCents: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function validYmd(v: string): boolean {
  if (!YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * The payment form, read and checked. Pure; the server action calls it and the
 * database's CHECKs and policies say the same again.
 *
 * - pagamento: amount > 0, a method.
 * - reembolso: the amount is typed positive and STORED negative; a method and a
 *   reason (a refund answers a credit note in Stylus, S1).
 * - correcao: a sign is chosen ("mais" / "menos"), the amount is non-zero, a
 *   reason is required, the method is optional.
 * - the date is a real calendar day and not after today in Lisbon.
 * - the Stylus reference is optional (P3), trimmed, at most 40 characters.
 * - the agreed price is REQUIRED with a pagamento when the pacote has none yet
 *   (P2: typed, never taken from the catalogue), and ignored otherwise.
 */
export function parsePackPaymentForm(
  form: { get(name: string): FormDataEntryValue | null },
  ctx: { now: Date; instanceHasPrice: boolean },
): { ok: true; value: PackPaymentInput } | { ok: false; error: PackPaymentFormError } {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const instanceId = str("instanceId").trim();
  const kind = str("kind") as PackPaymentKind;
  if (!(PACK_PAYMENT_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "kind" };

  const amount = parseEurosToCents(str("amount"));
  if (amount === null || amount === "invalid" || amount === 0) return { ok: false, error: "amount" };
  let signed = amount;
  if (kind === "reembolso") signed = -amount;
  if (kind === "correcao") {
    const dir = str("direction");
    if (dir !== "mais" && dir !== "menos") return { ok: false, error: "amount" };
    signed = dir === "menos" ? -amount : amount;
  }

  const receivedOn = str("receivedOn").trim();
  if (!validYmd(receivedOn)) return { ok: false, error: "date" };
  if (receivedOn < RECEIVED_ON_FLOOR) return { ok: false, error: "date" };
  if (receivedOn > lisbonDate(ctx.now)) return { ok: false, error: "date_future" };

  const rawMethod = str("method").trim();
  let method: PackPaymentMethod | null = null;
  if (rawMethod) {
    if (!(PACK_PAYMENT_METHODS as readonly string[]).includes(rawMethod)) return { ok: false, error: "method" };
    method = rawMethod as PackPaymentMethod;
  }
  if (kind !== "correcao" && method === null) return { ok: false, error: "method" };

  const locationId = str("locationId").trim();
  if (!UUID.test(locationId)) return { ok: false, error: "location" };

  const ref = str("stylusRef").trim();
  if (ref.length > STYLUS_REF_MAX) return { ok: false, error: "stylus_ref" };

  const reason = str("reason").trim();
  if (reason.length > REASON_MAX) return { ok: false, error: "reason_long" };
  if (kind !== "pagamento" && !reason) return { ok: false, error: "reason" };

  let agreedPriceCents: number | null = null;
  if (!ctx.instanceHasPrice && kind === "pagamento") {
    const p = parseEurosToCents(str("agreedPrice"));
    if (p === "invalid") return { ok: false, error: "agreed_price" };
    if (p === null) return { ok: false, error: "agreed_price_required" };
    agreedPriceCents = p;
  }

  if (!UUID.test(instanceId)) return { ok: false, error: "kind" };

  return {
    ok: true,
    value: {
      instanceId,
      kind,
      amountCents: signed,
      receivedOn,
      method,
      locationId,
      stylusRef: ref || null,
      reason: reason || null,
      agreedPriceCents,
    },
  };
}

export type SellPackFormError = "patient" | "pack" | "agreed_price" | "agreed_price_required";

/**
 * The message for a `?erro=` code on the payment and sale pages. Unknown codes
 * read as null (nothing printed) rather than as some other message.
 */
const ERROR_KEYS = {
  kind: "packsPay.errKind",
  amount: "packsPay.errAmount",
  date: "packsPay.errDate",
  date_future: "packsPay.errDateFuture",
  method: "packsPay.errMethod",
  location: "packsPay.errLocation",
  stylus_ref: "packsPay.errStylusRef",
  reason: "packsPay.errReason",
  agreed_price: "packsPay.errAgreedPrice",
  agreed_price_required: "packsPay.errAgreedPriceRequired",
  price_required: "packsPay.errAgreedPriceRequired",
  price_already_set: "packsPay.errPriceAlreadySet",
  not_found: "packsPay.errNotFound",
  unavailable: "packsPay.errUnavailable",
  forbidden: "packsPay.errForbidden",
  patient: "packsPay.errPatient",
  pack: "packsPay.errPack",
  reason_long: "packsPay.errReasonLong",
  pack_has_free_sessions: "packsSell.errHasFreeSessions",
} as const;
export type PackPaymentMessageKey = (typeof ERROR_KEYS)[keyof typeof ERROR_KEYS];

export function packPaymentErrorKey(code: string | undefined): PackPaymentMessageKey | null {
  if (!code || !Object.prototype.hasOwnProperty.call(ERROR_KEYS, code)) return null;
  return ERROR_KEYS[code as keyof typeof ERROR_KEYS];
}

export const PACK_KIND_KEYS = {
  pagamento: "packsPay.kindPagamento",
  reembolso: "packsPay.kindReembolso",
  correcao: "packsPay.kindCorrecao",
} as const satisfies Record<PackPaymentKind, string>;

export const PACK_METHOD_KEYS = {
  numerario: "packsPay.methodNumerario",
  mbway: "packsPay.methodMbway",
  multibanco: "packsPay.methodMultibanco",
  cartao: "packsPay.methodCartao",
  transferencia: "packsPay.methodTransferencia",
  outro: "packsPay.methodOutro",
} as const satisfies Record<PackPaymentMethod, string>;

/** "Vender pack" (P8): a patient, a pacote, and the price agreed (P2: typed, required). */
export function parseSellPackForm(form: {
  get(name: string): FormDataEntryValue | null;
}): { ok: true; value: { patientId: string; packId: string; agreedPriceCents: number } } | { ok: false; error: SellPackFormError } {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const patientId = str("patientId");
  if (!UUID.test(patientId)) return { ok: false, error: "patient" };
  const packId = str("packId");
  if (!UUID.test(packId)) return { ok: false, error: "pack" };
  const p = parseEurosToCents(str("agreedPrice"));
  if (p === "invalid") return { ok: false, error: "agreed_price" };
  if (p === null) return { ok: false, error: "agreed_price_required" };
  return { ok: true, value: { patientId, packId, agreedPriceCents: p } };
}

/** The "€ POR RECEBER" filter: the rows whose pacote still has money to receive. */
export function filterPorReceber<T extends { instanceId: string }>(
  rows: readonly T[],
  payments: ReadonlyMap<string, PackPaymentSummary>,
): T[] {
  return rows.filter((r) => payments.get(r.instanceId)?.state === "due");
}

/** `?pagamento=por-receber` read safely. */
export function parsePorReceberFilter(raw: string | undefined): boolean {
  return raw === "por-receber";
}

/** A Packs em uso URL with the "€ POR RECEBER" filter set or left out. */
export function withPorReceberFilter(href: string, on: boolean): string {
  if (!on) return href;
  return `${href}${href.includes("?") ? "&" : "?"}pagamento=por-receber`;
}
