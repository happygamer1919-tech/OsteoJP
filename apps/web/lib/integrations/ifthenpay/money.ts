// IfThenPay integration — money conversion (domain ⇄ wire).
//
// Domain money is integer CENTS (CLAUDE.md money rule); IfThenPay wants euro
// DECIMAL STRINGS ("60.00"). Conversion is integer-based — never float
// arithmetic on money. EUR only (V1). Pure + side-effect-free → fully
// unit-testable without a network.

/** 6000 → "60.00". Integer-only; no float math on money. */
export function centsToDecimalString(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error("ifthenpay/money: amount must be integer cents");
  }
  if (cents < 0) {
    throw new Error("ifthenpay/money: a payment amount cannot be negative");
  }
  const euros = Math.trunc(cents / 100);
  const rem = cents % 100;
  return `${euros}.${rem.toString().padStart(2, "0")}`;
}

/** "60.00" / "60" / 60 → 6000 cents. Tolerant of the forms IfThenPay returns. */
export function decimalStringToCents(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const s = String(value).trim();
  if (s === "") return 0;
  // IfThenPay returns "." as the decimal separator; tolerate a stray ",".
  const normalized = s.replace(",", ".");
  const [intPart, fracPart = ""] = normalized.split(".");
  const cents = Number(intPart) * 100 + Number((fracPart + "00").slice(0, 2));
  if (!Number.isFinite(cents)) {
    throw new Error("ifthenpay/money: unparseable money value");
  }
  return cents;
}
