"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";

/**
 * Tabs — SPEC-foundation §4.8.
 *
 * Section navigation within a screen (e.g. patient-profile sections). Renders
 * only the tablist; the screen renders the active section (no lazy-mount).
 * Roving tabindex + arrow/Home/End keys move and activate; active tab gets a
 * 2px accent-2-600 underline. Pass `aria-controls` per item to associate panels.
 *
 * @example
 * <Tabs aria-label={t("patient.sections")} value={tab} onValueChange={setTab}
 *   items={[{ value: "summary", label: t("patient.summary") }, …]} />
 */
export interface TabItem {
  value: string;
  label: ReactNode;
  "aria-controls"?: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function Tabs({
  items,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: TabsProps) {
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
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      onKeyDown={onKeyDown}
      className={cx("flex gap-6 border-b border-border", className)}
    >
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={item["aria-controls"]}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cx(
              "-mb-px border-b-2 px-1 pb-3 pt-2 text-sm font-medium",
              "transition-colors duration-fast ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
              selected
                ? "border-accent-2-600 text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
