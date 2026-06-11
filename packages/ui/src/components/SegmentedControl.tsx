"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";

/**
 * SegmentedControl — SPEC-foundation §4.8.
 *
 * Mutually-exclusive input modes (e.g. search-existing vs create-new patient).
 * surface-muted track, an active pill (surface bg + shadow-sm) that slides
 * between equal-width segments at --duration-fast. Radio-group semantics with
 * roving tabindex and arrow-key selection.
 *
 * @example
 * <SegmentedControl aria-label={t("patient.mode")} value={mode}
 *   onValueChange={setMode}
 *   items={[{ value: "search", label: t("search") }, { value: "new", label: t("new") }]} />
 */
export interface SegmentItem {
  value: string;
  label: ReactNode;
}

export interface SegmentedControlProps {
  items: SegmentItem[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function SegmentedControl({
  items,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SegmentedControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = items.findIndex((i) => i.value === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    let next = activeIndex;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = activeIndex >= last ? 0 : activeIndex + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = activeIndex <= 0 ? last : activeIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onValueChange(target.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      onKeyDown={onKeyDown}
      className={cx(
        "relative inline-flex rounded-full bg-surface-muted p-1",
        className,
      )}
    >
      {/* Sliding active pill (equal-width segments). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-surface shadow-sm transition-transform duration-fast ease-standard"
        style={{
          width: `calc((100% - 0.5rem) / ${items.length})`,
          transform: `translateX(calc(${Math.max(activeIndex, 0)} * 100%))`,
        }}
      />
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cx(
              "relative z-10 flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium",
              "transition-colors duration-fast ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
              selected ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
