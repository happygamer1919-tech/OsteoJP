/**
 * THE STORED CONTENT OF A RECORD THAT HAS NO FORM TEMPLATE, AS DATA.
 *
 * The rules `stored-record-content.tsx` draws by (B1), stated once as pure
 * functions so the screen and the PDF of the same record (report-model.ts)
 * read ONE mapping and cannot drift:
 *
 *   - every key keeps the name it is stored with, and nothing is interpreted;
 *   - NOTHING IS DROPPED: a value with no plain text form is its JSON;
 *   - null, undefined and blank strings are skipped, because they mean "not
 *     stored", and a blank row would invent a field;
 *   - the order is the stored object's own.
 *
 * Pure: no React, no database, no i18n.
 */

/** A leaf that is text without interpreting it. */
export function isPrintableStoredValue(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Nothing to show: genuine absence, not a value. */
export function isAbsentStoredValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** The stored keys that hold something, each with its value, in stored order. */
export function storedContentEntries(data: Readonly<Record<string, unknown>>): [string, unknown][] {
  return Object.entries(data).filter(([, v]) => !isAbsentStoredValue(v));
}

/**
 * One stored value as text. Arrays and objects have no agreed presentation and
 * inventing one would be a judgement about their meaning: JSON keeps every byte.
 */
export function storedValueText(value: unknown): string {
  if (isPrintableStoredValue(value)) return String(value);
  return JSON.stringify(value, null, 2);
}
