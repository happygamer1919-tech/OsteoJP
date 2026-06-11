import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { type ReactNode } from "react";

/**
 * Table + TableCardRow — SPEC-foundation §4.7.
 *
 * Dense clinical list table inside a bordered, radius-lg frame. Header row is
 * caption/weight-500/text-secondary on `bg`; body rows are body-sm, 48px tall,
 * hairline-separated, and hover when interactive. Columns align text left,
 * numbers/actions right. Built-in loading / empty / error states render inside
 * the frame. Under 640px screens swap to the exported TableCardRow stacked
 * pattern (a screen-level concern).
 *
 * Interactive rows: pass `getRowHref` (and `getRowLabel` for the link's
 * accessible name). A single stretched link covers the row — one tab stop — so
 * such rows must not contain other interactive cells.
 *
 * Loading/empty/error: loading renders placeholder bars; empty/error render the
 * `empty`/`error` slots spanning all columns.
 * TODO(W1-07): replace the loading bars with <SkeletonTable> and default the
 * empty/error slots to <EmptyState>/<ErrorState> once W1-07 merges.
 */

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
  sortable?: boolean;
}

export type TableState = "ready" | "loading" | "empty" | "error";
export interface TableSort {
  key: string;
  direction: "asc" | "desc";
}

interface TableBaseProps<T> {
  columns: Array<TableColumn<T>>;
  data: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  /** Visually-hidden accessible caption for the table. */
  caption: string;
  state?: TableState;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Spans all columns when state === "empty" (screen supplies the content). */
  empty?: ReactNode;
  /** Spans all columns when state === "error" (screen supplies the content). */
  error?: ReactNode;
  loadingRows?: number;
  className?: string;
}

/**
 * Interactive rows require BOTH the href and the label (for the stretched
 * link's accessible name) — they cannot be supplied independently.
 */
type RowLinkProps<T> =
  | { getRowHref?: undefined; getRowLabel?: undefined }
  | { getRowHref: (row: T) => string; getRowLabel: (row: T) => string };

export type TableProps<T> = TableBaseProps<T> & RowLinkProps<T>;

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

const alignClass = (align: "left" | "right" | undefined): string =>
  align === "right" ? "text-right" : "text-left";

export function Table<T>({
  columns,
  data,
  rowKey,
  caption,
  state = "ready",
  getRowHref,
  getRowLabel,
  sort,
  onSortChange,
  empty,
  error,
  loadingRows = 5,
  className,
}: TableProps<T>) {
  const colCount = columns.length;
  const cellPad = "px-4";

  const headerCell = (col: TableColumn<T>) => {
    const sorted = sort?.key === col.key ? sort.direction : undefined;
    const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
    if (!col.sortable) {
      return (
        <th
          key={col.key}
          scope="col"
          className={cx(cellPad, "text-xs font-medium text-text-secondary", alignClass(col.align))}
        >
          {col.header}
        </th>
      );
    }
    const SortIcon = sorted === "asc" ? ChevronUp : sorted === "desc" ? ChevronDown : ChevronsUpDown;
    return (
      <th
        key={col.key}
        scope="col"
        aria-sort={ariaSort}
        className={cx(cellPad, "text-xs font-medium text-text-secondary", alignClass(col.align))}
      >
        <button
          type="button"
          onClick={() =>
            onSortChange?.({
              key: col.key,
              direction: sorted === "asc" ? "desc" : "asc",
            })
          }
          className={cx(
            "inline-flex items-center gap-1 font-medium text-text-secondary hover:text-text-primary",
            "transition-colors duration-fast ease-standard",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
            col.align === "right" && "flex-row-reverse",
          )}
        >
          {col.header}
          <SortIcon size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <div
      className={cx("overflow-hidden rounded-lg border border-border bg-surface", className)}
      aria-busy={state === "loading" || undefined}
    >
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="h-10 border-b border-border bg-bg text-left">
            {columns.map(headerCell)}
          </tr>
        </thead>
        <tbody>
          {state === "loading" &&
            // TODO(W1-07): replace with <SkeletonTable rows cols />.
            Array.from({ length: loadingRows }).map((_, r) => (
              <tr key={`s-${r}`} className="h-12 border-b border-border last:border-b-0">
                {columns.map((col) => (
                  <td key={col.key} className={cx(cellPad)}>
                    <span className="block h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
                  </td>
                ))}
              </tr>
            ))}

          {state === "empty" && (
            <tr>
              <td colSpan={colCount} className="p-12 text-center">
                {empty}
              </td>
            </tr>
          )}

          {state === "error" && (
            <tr>
              <td colSpan={colCount} className="p-12 text-center">
                {error}
              </td>
            </tr>
          )}

          {state === "ready" &&
            data.map((row) => {
              const href = getRowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cx(
                    "h-12 border-b border-border last:border-b-0",
                    href && "relative hover:bg-bg",
                  )}
                >
                  {columns.map((col, ci) => (
                    <td
                      key={col.key}
                      className={cx(cellPad, "text-sm text-text-primary align-middle", alignClass(col.align))}
                    >
                      {col.cell(row)}
                      {href && ci === 0 && (
                        <a
                          href={href}
                          aria-label={getRowLabel?.(row)}
                          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2-500"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export interface TableCardRowItem {
  label: ReactNode;
  value: ReactNode;
}

export interface TableCardRowProps {
  items: Array<TableCardRowItem>;
  /** Makes the whole row-card a single link. */
  href?: string;
  "aria-label"?: string;
  className?: string;
}

/**
 * TableCardRow — the under-640px stacked replacement for a table row: a bordered
 * card of label/value pairs. Pass `href` (+ aria-label) for a tappable row.
 */
export function TableCardRow({
  items,
  href,
  "aria-label": ariaLabel,
  className,
}: TableCardRowProps) {
  const body = (
    <dl className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-text-secondary">{item.label}</dt>
          <dd className="text-sm font-medium text-text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );

  const base = "block rounded-lg border border-border bg-surface p-4";
  if (href) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        className={cx(
          base,
          "cursor-pointer transition-colors duration-fast ease-standard hover:bg-bg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
          className,
        )}
      >
        {body}
      </a>
    );
  }
  return <div className={cx(base, className)}>{body}</div>;
}
