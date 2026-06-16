"use client";

import { type KeyboardEvent, useRef } from "react";

import { FOCUS_RING, cx } from "./composite-skin";

/**
 * SlotPicker — SPEC-staff-screens §2.
 *
 * A wrapping grid of selectable time chips for one day. Available chips use the
 * secondary-button skin; the selected chip is filled accent-2-700 / text-inverse.
 * Unavailable slots are simply not passed in (never shown as disabled noise).
 * Radio-group semantics: roving tabindex + arrow/Home/End keys. Takes slots as
 * data — zero availability logic inside.
 *
 * @example
 * <SlotPicker aria-label={t("booking.slots")} value={slot} onChange={setSlot}
 *   slots={[{ value: "09:00", label: "09:00" }, { value: "09:15", label: "09:15" }]} />
 */
export interface SlotOption {
  /** "HH:mm". */
  value: string;
  label: string;
}

export interface SlotPickerProps {
  slots: SlotOption[];
  value: string | null;
  onChange: (value: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

export function SlotPicker({
  slots,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SlotPickerProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = slots.findIndex((s) => s.value === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = slots.length - 1;
    if (last < 0) return;
    const from = activeIndex < 0 ? 0 : activeIndex;
    let next = from;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = from >= last ? 0 : from + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = from <= 0 ? last : from - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    const target = slots[next];
    if (!target) return;
    onChange(target.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      onKeyDown={onKeyDown}
      className={cx("flex flex-wrap gap-2", className)}
    >
      {slots.map((slot, i) => {
        const selected = slot.value === value;
        // First slot is the default tab stop when nothing is selected.
        const tabbable = selected || (activeIndex < 0 && i === 0);
        return (
          <button
            key={slot.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => onChange(slot.value)}
            className={cx(
              "rounded-full px-3 py-2 text-sm font-medium",
              "transition-colors duration-fast ease-standard",
              FOCUS_RING,
              selected
                ? "bg-accent-2-700 text-text-inverse"
                : "border border-border-strong bg-surface text-text-primary hover:bg-surface-muted",
            )}
          >
            {slot.label}
          </button>
        );
      })}
    </div>
  );
}
