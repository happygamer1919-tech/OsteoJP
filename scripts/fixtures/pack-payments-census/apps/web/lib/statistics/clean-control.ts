// CLEAN CONTROL for scripts/pack-payments-census.test.mjs: it must offend
// nothing. Prose may name pack_instance_payments and pack_instance_agreed_prices
// and even "tx.insert(invoices)" inside comments.
/* import { x } from "@/lib/packs/payments-read"; (a comment, not an import) */
import { foldForSearch } from "@/lib/packs/in-use";

export const cleanQuery = "select sum(amount_cents) from invoices";
export const clean = foldForSearch;
