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

/** "YYYY-MM-DD" and nothing else. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The value, but ONLY when it is a date this component can stand on. Anything
 * else - "", a half-typed "2026-9-3", undefined - is UNKNOWN, and unknown is
 * not a date.
 *
 * IT EXISTS BECAUSE `parseIso` ANSWERS EVERY INPUT. Give it "" and
 * `"".split("-").map(Number)` is `[0]`, so `y ?? 1970` keeps the 0 (0 is not
 * nullish), and the caller gets `{y: 0, m: 0, d: 1}` - a real-looking date that
 * came from nowhere. That is the §1.3 shape exactly: an unknown case mapped
 * onto a known one, which is then read as the known one.
 */
const asIsoDate = (value: string | null | undefined): string | null =>
  value != null && ISO_DATE.test(value) ? value : null;

/**
 * The date the calendar opens on: the field's own value when it has a usable
 * one, TODAY when it does not.
 *
 * ==========================================================================
 * EXPORTED AND PURE BECAUSE IT IS THE LINE THAT WAS WRONG, and the regression
 * test has to be able to reach it. The calendar's month header only exists
 * while the popover is open, and this repo's unit tests render through
 * `react-dom/server` with no DOM to click - so a test that could only see the
 * header could not see this at all.
 * ==========================================================================
 *
 * THE DEFECT IT CLOSES. The line was `value ?? todayIso()`. `??` admits the
 * EMPTY STRING, and every caller here holds its date in form state where "not
 * picked yet" is `""` rather than `null`. "" reached `parseIso`, came back as
 * year 0, and `new Date(0, 0, 1)` is 1 January 1900 - JavaScript maps years
 * 0-99 onto 1900-1999. A pacote row the user had not filled in yet opened its
 * calendar on "janeiro de 1900" (Nova marcacao, second package session).
 *
 * `||` would also have fixed the empty string and would have left the
 * half-typed value fabricating a date, so the test is the SHAPE of the value,
 * not its truthiness.
 */
export function datePickerAnchor(value: string | null | undefined, today: string = todayIso()): string {
  return asIsoDate(value) ?? today;
}
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
  const initial = datePickerAnchor(value);
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

  // Mon..Sun header labels (2024-01-01 is a Monday). pt-PT's Intl "short"
  // weekday is the full word ("segunda", "terça", … "domingo"), which overflows
  // the narrow header cells and collides. Clamp to a 3-letter abbreviation
  // ("seg", "ter", … "dom"; "Mon".."Sun" in en) so labels always fit one cell.
  const weekdays = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(2024, 0, 1 + i)).slice(0, 3));

  const openMenu = () => {
    if (disabled) return;
    const base = datePickerAnchor(value);
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
  /** The value only if it is a real date - see datePickerAnchor. */
  const picked = asIsoDate(value);
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
        {/* `picked`, not `value`: a value the calendar refuses to stand on must
            not be formatted into a date on the trigger either, or the field
            would READ as set while the calendar sat on today. */}
        <span className={picked ? "text-text-primary" : "text-text-muted"}>
          {picked ? triggerFmt.format(new Date(parseIso(picked).y, parseIso(picked).m, parseIso(picked).d)) : placeholder}
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
          <h2 className="sr-only">{triggerLabel}</h2>
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
              <span key={i} className="flex size-9 items-center justify-center text-xs text-text-secondary">
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
              const selected = iso === picked;
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
