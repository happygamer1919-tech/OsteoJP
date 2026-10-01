"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

/**
 * Tabs — SPEC-foundation §4.8.
 *
 * Section navigation within a screen (e.g. patient-profile sections). Renders
 * only the tablist; the screen renders the active section (no lazy-mount).
 * Roving tabindex + arrow/Home/End keys move and activate; active tab gets a
 * 2px accent-1-700 (logo purple) underline - the W6-06 55/25/20 equity uses
 * purple for selected states (AA 8.72:1 on white). Pass `aria-controls` per item
 * to associate panels.
 *
 * NARROW SCREENS (EPI-01 M2, 2026-10-01): at 390 px the patient profile's six
 * tabs are 569 px wide, and the tablist pushed the WHOLE PAGE into a sideways
 * scroll. The row now scrolls inside its own box instead: labels never wrap or
 * shrink, the box scrolls horizontally, and the selected tab is brought into
 * view on render. The box's 4 px padding, cancelled by an equal negative margin,
 * leaves room for the focus ring, which overflow would otherwise clip, without
 * moving anything on a wide screen.
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
  const scroller = useRef<HTMLDivElement | null>(null);
  const activeIndex = items.findIndex((i) => i.value === value);

  // Bring the selected tab into the visible part of the row, horizontally only:
  // scrollIntoView would also scroll the page vertically.
  useEffect(() => {
    const box = scroller.current;
    const tab = refs.current[activeIndex];
    if (!box || !tab) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < box.scrollLeft) box.scrollLeft = left;
    else if (right > box.scrollLeft + box.clientWidth) box.scrollLeft = right - box.clientWidth;
  }, [activeIndex]);

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
    <div ref={scroller} className="relative -m-1 overflow-x-auto p-1" data-tabs-scroller="">
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        onKeyDown={onKeyDown}
        className={cx("flex w-max min-w-full gap-6 border-b border-border", className)}
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
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-1 pb-3 pt-2 text-sm font-medium",
                "transition-colors duration-fast ease-standard",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
                // W7-03: the LABEL is purple too, not just the 2px underline.
                // W6-06b purpled only the hairline beneath a near-black label,
                // which the owner reported (correctly) as imperceptible.
                // accent-1-700 on white = 8.72:1. The underline and font-weight
                // still carry the selected state, so colour is never the only cue.
                selected
                  ? "border-accent-1-700 text-accent-1-700"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
