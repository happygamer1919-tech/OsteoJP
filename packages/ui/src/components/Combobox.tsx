"use client";

import { Check, Plus, Search } from "lucide-react";
import {
  type KeyboardEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { cx, fieldSkin } from "./composite-skin";
import { Skeleton } from "./Skeleton";

/**
 * Combobox — SPEC-staff-screens §2.
 *
 * Generic searchable single-select: an Input-skinned trigger with a Search
 * leading icon and a filtering options popover (surface, border, radius lg,
 * shadow lg, 320px scroll). Option rows are 40px, body-sm, hover `bg`, with a
 * trailing Check when selected. Supports async options (loading = 3 skeleton
 * lines), an empty row, and a pinned action row (set `actionLabel`). Full
 * combobox keyboard semantics (arrows, Enter, Escape, aria-activedescendant).
 * Options in, selection out — no domain logic.
 *
 * Pass `onQueryChange` to drive filtering yourself (async); otherwise the
 * component filters `options` by label internally.
 *
 * @example
 * <Combobox options={patients} value={id} onChange={setId}
 *   emptyLabel={t("search.none")} placeholder={t("search.patients")}
 *   actionLabel={t("patient.createNew")} onAction={openCreate}
 *   onQueryChange={search} loading={isSearching} />
 */
export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  emptyLabel: string;
  /** Controlled query (async mode). When set, the parent owns filtering. */
  query?: string;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  placeholder?: string;
  /** When set, a pinned action row renders at the bottom of the popover. */
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  emptyLabel,
  query: queryProp,
  onQueryChange,
  loading = false,
  placeholder,
  actionLabel,
  onAction,
  disabled = false,
  invalid = false,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  className,
}: ComboboxProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const async = onQueryChange !== undefined;

  const [open, setOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<number | undefined>(undefined);

  const query = queryProp ?? internalQuery;

  const filtered = useMemo(() => {
    if (async) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [async, options, query]);

  const hasAction = actionLabel != null && onAction != null;
  // Navigable rows: filtered options [0..n-1], then the action row at index n.
  const rowCount = filtered.length + (hasAction ? 1 : 0);

  const setQuery = (q: string) => {
    if (queryProp === undefined) setInternalQuery(q);
    onQueryChange?.(q);
  };

  const openMenu = () => {
    if (!disabled) {
      setOpen(true);
      setActiveIndex(0);
    }
  };

  const commit = (index: number) => {
    if (hasAction && index === filtered.length) {
      onAction?.();
      setOpen(false);
      return;
    }
    const option = filtered[index];
    if (!option) return;
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return openMenu();
      setActiveIndex((i) => (rowCount === 0 ? 0 : (i + 1) % rowCount));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openMenu();
      setActiveIndex((i) => (rowCount === 0 ? 0 : (i - 1 + rowCount) % rowCount));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        commit(activeIndex);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const activeId = open && rowCount > 0 ? `${reactId}-row-${activeIndex}` : undefined;

  return (
    <div className={cx("relative", className)}>
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={openMenu}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          className={cx(fieldSkin(invalid), "h-10 pl-8 pr-3")}
        />
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          onMouseDown={(e) => {
            // keep input focus so the click commits before blur closes the list
            e.preventDefault();
            if (blurTimer.current) window.clearTimeout(blurTimer.current);
          }}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {loading ? (
            <li className="flex flex-col gap-2 px-3 py-2" aria-hidden="true">
              <Skeleton variant="text" className="w-3/4" />
              <Skeleton variant="text" className="w-1/2" />
              <Skeleton variant="text" className="w-2/3" />
            </li>
          ) : (
            <>
              {filtered.length === 0 && (
                <li role="option" aria-disabled="true" className="px-3 py-2 text-sm text-text-secondary">
                  {emptyLabel}
                </li>
              )}
              {filtered.map((option, i) => {
                const selected = option.value === value;
                const active = i === activeIndex;
                return (
                  <li
                    key={option.value}
                    id={`${reactId}-row-${i}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => commit(i)}
                    className={cx(
                      "flex h-10 cursor-pointer items-center justify-between gap-2 px-3 text-sm",
                      active ? "bg-bg" : "bg-surface",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text-primary">{option.label}</span>
                      {option.description && (
                        <span className="block truncate text-xs text-text-secondary">{option.description}</span>
                      )}
                    </span>
                    {selected && (
                      <Check size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-accent-2-700" />
                    )}
                  </li>
                );
              })}
              {hasAction && (
                <li
                  id={`${reactId}-row-${filtered.length}`}
                  role="option"
                  aria-selected={false}
                  onMouseEnter={() => setActiveIndex(filtered.length)}
                  onClick={() => commit(filtered.length)}
                  className={cx(
                    "mt-1 flex h-10 cursor-pointer items-center gap-2 border-t border-border px-3 text-sm font-medium text-accent-2-700",
                    activeIndex === filtered.length ? "bg-bg" : "bg-surface",
                  )}
                >
                  <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                  {actionLabel}
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
