"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { FOCUS_RING, cx, fieldSkin } from "./composite-skin";

/**
 * DatePicker — SPEC-staff-screens §2.
 *
 * A month-calendar popover off an Input-skinned trigger. Week starts Monday
 * (pt-PT). Day cells are 36px, radius full; today is outlined (border-strong),
 * the selected day is filled accent-2-700 / text-inverse, out-of-range days are
 * text-muted with no pointer. Min/max bound selection. Arrow keys move by day
 * (and across months); Enter selects, Escape closes. Value is ISO "YYYY-MM-DD".
 * Visible month/weekday/trigger labels are derived via Intl from `locale`
 * (default pt-PT), so there are no hardcoded strings.
 *
 * @example
 * <DatePicker value={date} onChange={setDate} min={todayIso}
 *   triggerLabel={t("agenda.pickDate")} />
 */
export interface DatePickerProps {
  /** ISO "YYYY-MM-DD" or null. */
  value: string | null;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** Placeholder shown on the trigger when no value is set. */
  placeholder?: string;
  /** Accessible name for the trigger (e.g. "Escolher data"). */
  triggerLabel?: string;
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  locale?: string;
  className?: string;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number): string => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parseIso = (s: string): { y: number; m: number; d: number } => {
  const [y, m, d] = s.split("-").map(Number);
  return { y: y ?? 1970, m: (m ?? 1) - 1, d: d ?? 1 };
};
const todayIso = (): string => {
  const t = new Date();
  return toIso(t.getFullYear(), t.getMonth(), t.getDate());
};
const addDays = (iso: string, delta: number): string => {
  const { y, m, d } = parseIso(iso);
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + delta);
  return toIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
/** Mon..Sun column offset for the 1st of a month. */
const mondayOffset = (y: number, m: number): number => (new Date(y, m, 1).getDay() + 6) % 7;
const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  invalid = false,
  id,
  placeholder,
  triggerLabel,
  prevMonthLabel = "Mês anterior",
  nextMonthLabel = "Mês seguinte",
  locale = "pt-PT",
  className,
}: DatePickerProps) {
  const reactId = useId();
  const gridId = `${reactId}-grid`;
  const [open, setOpen] = useState(false);
  const initial = value ?? todayIso();
  const [view, setView] = useState(() => {
    const { y, m } = parseIso(initial);
    return { y, m };
  });
  const [focused, setFocused] = useState(initial);
  const dayRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const popoverRef = useRef<HTMLDivElement>(null);

  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const fullDateFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const triggerFmt = new Intl.DateTimeFormat(locale);

  // Mon..Sun header labels (2024-01-01 is a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2024, 0, 1 + i)));

  const openMenu = () => {
    if (disabled) return;
    const base = value ?? todayIso();
    const { y, m } = parseIso(base);
    setView({ y, m });
    setFocused(base);
    setOpen(true);
  };

  useEffect(() => {
    if (open) dayRefs.current.get(focused)?.focus();
  }, [open, focused]);

  const inRange = (iso: string): boolean => (!min || iso >= min) && (!max || iso <= max);

  const move = (delta: number) => {
    let next = addDays(focused, delta);
    if ((min && next < min) || (max && next > max)) next = focused;
    const { y, m } = parseIso(next);
    setView({ y, m });
    setFocused(next);
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-7); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(7); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (inRange(focused)) { onChange(focused); setOpen(false); }
    } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  const today = todayIso();
  const offset = mondayOffset(view.y, view.m);
  const count = daysInMonth(view.y, view.m);
  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: count }, (_, i) => toIso(view.y, view.m, i + 1)),
  ];

  return (
    <div
      className={cx("relative", className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={triggerLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cx(fieldSkin(invalid), "flex h-10 items-center justify-between gap-2 pl-3 pr-3 text-left")}
      >
        <span className={value ? "text-text-primary" : "text-text-muted"}>
          {value ? triggerFmt.format(new Date(parseIso(value).y, parseIso(value).m, parseIso(value).d)) : placeholder}
        </span>
        <Calendar size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={triggerLabel}
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={prevMonthLabel}
              onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
              className={cx("inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary", FOCUS_RING)}
            >
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <span aria-live="polite" className="text-xs font-medium text-text-primary">
              {monthFmt.format(new Date(view.y, view.m, 1))}
            </span>
            <button
              type="button"
              aria-label={nextMonthLabel}
              onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
              className={cx("inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary", FOCUS_RING)}
            >
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1" aria-hidden="true">
            {weekdays.map((w, i) => (
              // SPEC §2 says weekday text-muted, but as meaningful column labels
              // text-muted (#8A98A6 ≈3.0:1) fails AA; brand-tokens §1.8 reserves
              // text-muted for placeholders/deemphasis, so use text-secondary.
              <span key={i} className="flex h-8 items-center justify-center text-xs text-text-secondary">
                {w}
              </span>
            ))}
          </div>

          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <div
            id={gridId}
            role="grid"
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-7 gap-1"
          >
            {cells.map((iso, i) => {
              if (iso == null) return <span key={`b-${i}`} />;
              const { d } = parseIso(iso);
              const selected = iso === value;
              const isToday = iso === today;
              const enabled = inRange(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  ref={(el) => {
                    dayRefs.current.set(iso, el);
                  }}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={fullDateFmt.format(new Date(parseIso(iso).y, parseIso(iso).m, d))}
                  aria-disabled={!enabled || undefined}
                  tabIndex={iso === focused ? 0 : -1}
                  onClick={() => {
                    if (!enabled) return;
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex size-9 items-center justify-center rounded-full text-sm",
                    "transition-colors duration-fast ease-standard",
                    FOCUS_RING,
                    !enabled && "cursor-default text-text-muted",
                    enabled && !selected && "text-text-primary hover:bg-surface-muted",
                    selected && "bg-accent-2-700 text-text-inverse",
                    isToday && !selected && "border border-border-strong",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
