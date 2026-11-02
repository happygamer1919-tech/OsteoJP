import { AdminError } from "./errors";

/**
 * A price typed into an admin form, to integer cents. Pure, so the rules are
 * tested without a form or a server action (a "use server" file may export
 * async functions only, which is why this is not in actions.ts).
 *
 * - Blank returns null: the caller decides what blank means (no price for a
 *   service, refused for a pack).
 * - Plain decimal only: digits, optionally one "." or "," and more digits.
 *   `Number()` alone accepted "0x10" (16), "1e3" (1000), "Infinity" and
 *   " 12 " forms nobody types on purpose; they are refused as "invalid".
 * - An upper bound, MAX_PRICE_CENTS (100 000,00 EUR), also "invalid". The
 *   column is a 32-bit integer, and a price above the bound is a typo, not a
 *   pacote.
 */
export const MAX_PRICE_CENTS = 10_000_000;

const PLAIN_DECIMAL = /^\d+(?:[.,]\d+)?$/;

export function parsePriceToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (!PLAIN_DECIMAL.test(t)) throw new AdminError("invalid", "invalid price");
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new AdminError("invalid", "invalid price");
  const cents = Math.round(n * 100);
  if (cents > MAX_PRICE_CENTS) throw new AdminError("invalid", "price above the allowed maximum");
  return cents;
}
