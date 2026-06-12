"use client";

import { cx } from "./composite-skin";

/**
 * TimeField — SPEC-staff-screens §2.
 *
 * A "HH:mm" time input on a configurable minute step (default 15), rendered as
 * two linked native selects (hour, minute) sharing one Input-skin frame. Min /
 * max bound the selectable values. Value in and out is always "HH:mm".
 *
 * @example
 * <TimeField value={time} onChange={setTime} step={15} min="08:00" max="20:00"
 *   hourLabel={t("time.hour")} minuteLabel={t("time.minute")} />
 */
export interface TimeFieldProps {
  /** "HH:mm" or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  step?: number;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** Accessible names for the two selects (no visible label of their own). */
  hourLabel?: string;
  minuteLabel?: string;
  className?: string;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const pad = (n: number): string => String(n).padStart(2, "0");

export function TimeField({
  value,
  onChange,
  step = 15,
  min = "00:00",
  max = "23:59",
  disabled = false,
  invalid = false,
  id,
  hourLabel = "Horas",
  minuteLabel = "Minutos",
  className,
}: TimeFieldProps) {
  const minM = toMinutes(min);
  const maxM = toMinutes(max);
  const [hh, mm] = value ? value.split(":").map(Number) : [undefined, undefined];

  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => {
    // keep the hour if any in-step minute falls within [min, max]
    for (let m = 0; m < 60; m += step) {
      const t = h * 60 + m;
      if (t >= minM && t <= maxM) return true;
    }
    return false;
  });

  const minutesForHour = (h: number | undefined): number[] => {
    if (h === undefined) return Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
    const out: number[] = [];
    for (let m = 0; m < 60; m += step) {
      const t = h * 60 + m;
      if (t >= minM && t <= maxM) out.push(m);
    }
    return out;
  };

  const emit = (nextH: number | undefined, nextM: number | undefined) => {
    if (nextH === undefined || nextM === undefined) return;
    onChange(`${pad(nextH)}:${pad(nextM)}`);
  };

  const selectClass =
    "appearance-none bg-transparent text-text-primary outline-none disabled:cursor-not-allowed";

  return (
    <div
      className={cx(
        "inline-flex h-10 items-center gap-1 rounded border bg-surface px-3 text-sm text-text-primary",
        "transition-colors duration-fast ease-standard",
        invalid ? "border-error" : "border-border-strong",
        "focus-within:border-accent-2-500 focus-within:ring-2 focus-within:ring-focus-ring focus-within:ring-offset-2",
        disabled && "cursor-not-allowed bg-surface-muted text-text-muted",
        className,
      )}
    >
      <select
        id={id}
        aria-label={hourLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={hh ?? ""}
        onChange={(e) => emit(Number(e.target.value), mm ?? minutesForHour(Number(e.target.value))[0])}
        className={selectClass}
      >
        <option value="" disabled hidden></option>
        {hours.map((h) => (
          <option key={h} value={h}>
            {pad(h)}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="text-text-muted">
        :
      </span>
      <select
        aria-label={minuteLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={mm ?? ""}
        onChange={(e) => emit(hh, Number(e.target.value))}
        className={selectClass}
      >
        <option value="" disabled hidden></option>
        {minutesForHour(hh).map((m) => (
          <option key={m} value={m}>
            {pad(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
