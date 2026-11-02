"use client";

import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { matchesFilter } from "@/lib/scheduling/weekly-blocks-core";

/**
 * The red cross of Fisiozero's lists, in OsteoJP's own controls: a real
 * <button> inside a <form> posting to the delete action, a confirm before it
 * posts (a removal has no undo), an accessible name that says WHICH block it
 * removes (the line itself), and a visible focus ring. The icon is decorative.
 */
export function RemoveBlockButton({
  id,
  line,
  action,
  label,
  confirmText,
}: {
  id: string;
  line: string;
  action: (fd: FormData) => Promise<void>;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`${confirmText}\n${line}`)) e.preventDefault();
      }}
      className="flex-none"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label={`${label}: ${line}`}
        title={label}
        data-testid="block-remove"
        className="inline-flex h-7 w-7 items-center justify-center rounded-v2 text-red-700 hover:bg-red-50 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </form>
  );
}

/**
 * Modo PONTUAL's list: a "Filtrar..." box over the lines, newest first (the
 * order comes from the server). The filter is client-side over the lines the
 * page already holds: it narrows what is shown and never what exists.
 */
export function PontualList({
  rows,
  action,
  labels,
}: {
  rows: { id: string; line: string }[];
  action: (fd: FormData) => Promise<void>;
  labels: {
    filter: string;
    empty: string;
    filterEmpty: string;
    count: string;
    remove: string;
    removeConfirm: string;
  };
}) {
  const [query, setQuery] = useState("");
  const filterId = useId();
  const shown = useMemo(() => rows.filter((r) => matchesFilter(r.line, query)), [rows, query]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={filterId} className="sr-only">
          {labels.filter}
        </label>
        <input
          id={filterId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.filter}
          data-testid="pontual-filter"
          className="w-full max-w-sm rounded-v2 border border-v2-border bg-v2-surface px-3 py-2 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        />
        {query.trim() !== "" && (
          <span role="status" className="text-xs text-v2-text-secondary">
            {labels.count.replace("{n}", String(shown.length)).replace("{total}", String(rows.length))}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-v2-text-secondary">{labels.empty}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-v2-text-secondary">{labels.filterEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-v2-border" data-testid="pontual-list">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm text-v2-text-primary" data-testid="pontual-row">
              <span className="min-w-0 flex-1 break-words tabular-nums">{r.line}</span>
              <RemoveBlockButton
                id={r.id}
                line={r.line}
                action={action}
                label={labels.remove}
                confirmText={labels.removeConfirm}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
