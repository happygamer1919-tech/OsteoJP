"use client";

import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
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
  /**
   * SCHED-07 conversion: post the ISO value under this NAME, for the forms that
   * read FormData by field name. Without it this component posts NOTHING, which
   * is why the conversion of the native date inputs waited for it.
   */
  name?: string;
  /**
   * Native constraint validation, on the VISIBLE field so the browser can focus
   * and message it. Two cases are refused: an empty required field, and text
   * that is not a date - the second through setCustomValidity, because the field
   * is a text input and the browser has no opinion about what a date looks like.
   */
  required?: boolean;
  /** Message for text that is not a date. Shown by the browser, so it is copy. */
  invalidTypedMessage?: string;
  /**
   * `data-testid` for the text field. The converted native inputs carried them
   * and the specs address them; dropping one would have turned a locator into a
   * silent no-match rather than a failure anybody could read.
   */
  testId?: string;
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  /** SCHED-07: accessible names for the year jump. */
  prevYearLabel?: string;
  nextYearLabel?: string;
  /** SCHED-07: accessible name for the calendar toggle beside the text field. */
  openCalendarLabel?: string;
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
/**
 * SCHED-07 / SR-38 — TYPED ENTRY. The picker accepts a date TYPED as dd/mm/aaaa,
 * and typed entry is never removed from any field it replaces.
 *
 * ==========================================================================
 * WHY THIS EXISTS AT ALL, because the calendar alone looked like enough.
 * ==========================================================================
 * Before this the component was a BUTTON and a grid: no text input anywhere,
 * and a header that moved one MONTH at a time. Converting the product's 22
 * native `<input type="date">` fields to it would have removed typed entry from
 * every one of them - a date of birth forty years back is ~480 clicks. The
 * conversion was held on exactly that finding and the owner ruled the order:
 * teach typing first, convert second.
 *
 * WHAT IS ACCEPTED: dd/mm/aaaa with `/`, `-` or `.`, a bare 8-digit ddmmaaaa,
 * and single-digit day or month (1/2/2026). The YEAR MUST BE FOUR DIGITS - a
 * two-digit year is ambiguous exactly where it hurts most, on a birth date,
 * where "50" is a coin flip between 1950 and 2050.
 *
 * IT VALIDATES RATHER THAN ROLLING OVER, which is the whole difference between
 * this and `new Date(...)`. `31/02/2026` is REFUSED, not silently accepted as
 * 3 March: a Date constructor rolls over, so a typo becomes a real date nobody
 * typed. The round-trip check below is what refuses it.
 */
const TYPED_DATE = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$|^(\d{2})(\d{2})(\d{4})$/;

export function parseTypedDate(text: string): string | null {
  const m = TYPED_DATE.exec(text.trim());
  if (!m) return null;
  const d = Number(m[1] ?? m[4]);
  const mo = Number(m[2] ?? m[5]);
  const y = Number(m[3] ?? m[6]);
  if (!d || !mo || !y || mo > 12 || d > 31) return null;
  // THE ROUND TRIP IS THE VALIDATION. new Date(2026, 1, 31) is 3 March, so a
  // date that comes back with a different day or month was never a real date.
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return toIso(y, mo - 1, d);
}

/** The ISO value as the user types it: "dd/mm/aaaa", or "" when there is none. */
export function formatTypedDate(value: string | null | undefined): string {
  const iso = asIsoDate(value);
  if (!iso) return "";
  const { y, m, d } = parseIso(iso);
  return `${pad2(d)}/${pad2(m + 1)}/${y}`;
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
  name,
  required = false,
  invalidTypedMessage = "Data inválida. Use dd/mm/aaaa.",
  testId,
  prevMonthLabel = "Mês anterior",
  nextMonthLabel = "Mês seguinte",
  prevYearLabel = "Ano anterior",
  nextYearLabel = "Ano seguinte",
  openCalendarLabel = "Abrir calendário",
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

  /**
   * SCHED-07 — what the user has TYPED, which is not the same thing as the
   * value. Half of "15/09/2026" is not a date, so the field must be allowed to
   * hold text that does not parse while it is being typed.
   *
   * IT RESYNCS WHEN THE VALUE CHANGES FROM OUTSIDE (a calendar click, a parent
   * reset) rather than in an effect: the render-phase compare is the same
   * pattern ScheduleWeekFields uses, and an effect here would leave one frame
   * showing the previous date.
   */
  const [typed, setTyped] = useState(() => formatTypedDate(value));
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setTyped(formatTypedDate(value));
  }

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
      {/* SCHED-07 / SR-38 — A TEXT FIELD, NOT A BUTTON. This replaced a
          button-only trigger, and the change is the reason the 22 native date
          inputs can now be converted at all: typing 15/09/2026 must stay
          possible everywhere, and a date of birth is unreachable by clicking.

          THE VALUE IS ONLY EMITTED WHEN WHAT IS TYPED IS A REAL DATE. Half a
          date is not a date, so the field holds unparseable text while it is
          being typed and says nothing upstream until it parses. */}
      <div className={cx(fieldSkin(invalid), "flex h-10 items-center gap-1 pl-3 pr-1")}>
        <input
          id={id}
          data-testid={testId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          disabled={disabled}
          required={required}
          // The browser validates THIS field, not the hidden one below: a hidden
          // input is skipped by constraint validation, so a required date could
          // be posted empty with nothing named on screen.
          ref={(el) => {
            if (!el) return;
            el.setCustomValidity(typed !== "" && parseTypedDate(typed) === null ? invalidTypedMessage : "");
          }}
          aria-label={triggerLabel}
          aria-invalid={invalid || (typed !== "" && parseTypedDate(typed) === null) || undefined}
          placeholder={placeholder ?? "dd/mm/aaaa"}
          onChange={(e) => {
            const next = e.target.value;
            setTyped(next);
            const iso = parseTypedDate(next);
            if (iso && inRange(iso)) {
              onChange(iso);
              const { y, m } = parseIso(iso);
              setView({ y, m });
              setFocused(iso);
            } else if (next.trim() === "") {
              // CLEARING IS AN INSTRUCTION, not a parse failure. Emitting "" is
              // what every caller already holds for "not picked".
              onChange("");
            }
          }}
          onBlur={() => {
            // ON BLUR THE FIELD TELLS THE TRUTH ABOUT THE VALUE IT ACTUALLY
            // HOLDS. Leaving "15/09/20" on screen next to an unchanged value
            // would be a field reading as one date while holding another - the
            // §1.3 shape, on the control the whole product types into.
            setTyped(formatTypedDate(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && open) { e.preventDefault(); setOpen(false); }
            if (e.key === "ArrowDown" && !open) { e.preventDefault(); openMenu(); }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
        />
        {/* The ISO value, under the caller's field name. Empty string when there
            is no date, which is what every server action already reads as "not
            set" - never a half-typed string. */}
        {name != null && <input type="hidden" name={name} value={asIsoDate(value) ?? ""} />}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={openCalendarLabel}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openMenu())}
          className={cx("inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text-primary", FOCUS_RING)}
        >
          <Calendar size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={triggerLabel}
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg"
        >
          <h2 className="sr-only">{triggerLabel}</h2>
          {/* SCHED-07 — THE YEAR JUMP. The header moved one MONTH at a time, so
              reaching a birth date forty years back was ~480 clicks. That is
              half the reason converting the native date inputs would have been
              a regression; the text field above is the other half. */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={prevYearLabel}
              onClick={() => setView((v) => ({ y: v.y - 1, m: v.m }))}
              className={cx("inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary", FOCUS_RING)}
            >
              <ChevronsLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
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
            <button
              type="button"
              aria-label={nextYearLabel}
              onClick={() => setView((v) => ({ y: v.y + 1, m: v.m }))}
              className={cx("inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-muted hover:text-text-primary", FOCUS_RING)}
            >
              <ChevronsRight size={18} strokeWidth={1.75} aria-hidden="true" />
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
