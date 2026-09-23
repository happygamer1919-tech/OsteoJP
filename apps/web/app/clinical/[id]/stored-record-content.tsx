import type { ReactNode } from "react";

/**
 * THE STORED CONTENT OF A RECORD THAT HAS NO FORM TEMPLATE, READ-ONLY.
 *
 * Lifted out of `imported-record-preview.tsx` (B1) unchanged, so the imported
 * preview and the neutral view (FICHA-IMPORTED-VIEW) draw stored content by ONE
 * set of rules and differ only in what they call it. The rules, and why they
 * are what they are, are B1's:
 *
 *   - every key is printed under the name it is stored with, and nothing is
 *     interpreted;
 *   - NOTHING IS DROPPED: a value with no nice rendering is printed as JSON;
 *   - null, undefined and blank strings are skipped, because they mean "not
 *     stored", and a blank row would invent a field;
 *   - a record with nothing to show says so, because "the viewer cannot draw
 *     it" and "there is nothing to draw" are different answers.
 *
 * READ-ONLY BY CONSTRUCTION: no form, no input, no action, no server action.
 */

/** A leaf we can print as text without interpreting it. */
function isPrintable(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Nothing to show: genuine absence, not a value. */
export function isAbsentStoredValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** One stored value, printed without interpretation. */
export function renderStoredValue(value: unknown): ReactNode {
  if (isPrintable(value)) return String(value);
  // Arrays and objects have no agreed presentation here and inventing one would
  // be a judgement about their meaning. JSON keeps every byte visible.
  return (
    <span className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(value, null, 2)}</span>
  );
}

export function StoredRecordContent({
  data,
  title,
  help,
  emptyText,
  testId,
  emptyTestId,
}: {
  data: Record<string, unknown>;
  title: string;
  help: string;
  emptyText: string;
  testId: string;
  emptyTestId: string;
}) {
  const entries = Object.entries(data).filter(([, v]) => !isAbsentStoredValue(v));

  if (entries.length === 0) {
    return (
      <p className="text-sm text-text-secondary" data-testid={emptyTestId}>
        {emptyText}
      </p>
    );
  }

  return (
    <section aria-label={title} data-testid={testId}>
      <h2 className="mb-2 text-base font-semibold text-text-primary">{title}</h2>
      <p className="mb-4 text-sm text-text-secondary">{help}</p>
      <dl className="flex flex-col gap-4">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-text-secondary">{key}</dt>
            <dd className="whitespace-pre-wrap text-sm text-text-primary">{renderStoredValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
