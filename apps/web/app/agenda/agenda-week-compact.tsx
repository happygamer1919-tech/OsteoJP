"use client";

import { useEffect, useRef, useState, type Ref } from "react";

import { locale, s } from "@/lib/i18n";
import {
  autoScrollDecision,
  buildCompactWeek,
  compactDayLabel,
  compactLaneBox,
  COMPACT_AXIS_PX,
  COMPACT_CHIP,
  COMPACT_FACE,
  COMPACT_ROW_MINUTES,
  COMPACT_ROW_PX,
  type CompactAppointment,
  type CompactBand,
  type CompactMore,
  type CompactWeek,
} from "@/lib/scheduling/agenda-compact-core";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";
import { ESTADO_LABEL_KEY } from "@/lib/scheduling/estado";
import { SERVICE_COLORS, SERVICE_COLOR_NONE, type ServiceColor } from "@/lib/scheduling/service-color";
import {
  formatDayHeader,
  lisbonMinutesFromMidnight,
  slotLabel,
  todayInLisbon,
} from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { EstadoMarker } from "./estado-marker";

/* ==================================================================== */
/* AGENDA-MOBILE-WEEK - THE WEEK, ON A PHONE, AS A COMPRESSED GRID.      */
/* ==================================================================== */
/*
 * The owner ruled that below 640px Semana renders the desktop week grid,
 * compressed. This is that grid. It is a SEPARATE component from agenda-grid.tsx
 * on purpose: the desktop face is pinned by W11-00 v3 (stacked, never side by
 * side, names never truncated, colour by therapist) and its unit tests assert
 * exactly that. This ruling amends those rules below 640 ONLY, so the phone gets
 * its own tree and the desktop code never sees a lane. Every layout decision is
 * made in lib/scheduling/agenda-compact-core.ts; this file draws the answer.
 *
 * MOUNTED ONLY FOR `view === "week"`, AFTER the desktop grid and the phone list
 * in DOM order, displayed only under `sm` (`sm:hidden` from agenda-view.tsx).
 * So it is in the DOM at 1440 too, and three rules follow from that:
 *
 * 1. EVERY HANDLE IS PREFIXED `data-compact-` / `agenda-compact-`. A CSS
 *    attribute locator matches a `display: none` element, so an unprefixed
 *    `data-appointment-id` here would double every count in the eleven e2e files
 *    that select on it (AGMOB-01 hit exactly that in the required gate).
 * 2. THE DAY HEADER'S LABELS ARE NOT DOM TEXT. Four desktop specs assert W3-08
 *    page-wide: `getByText(/^sáb/i).first()` is visible and `getByText(/^dom/i)`
 *    counts zero. A text locator matches a `display: none` element too, so a
 *    "Dom 27" here (Dom shows when a Sunday holds a booking) would fail the
 *    second on a desktop that never draws it. So each label is CSS generated
 *    content from `data-compact-label`, which is not in the DOM's text, and the
 *    button's accessible name is its aria-label. Those two locators are the
 *    only page-wide text locators any week-view spec uses today; the times,
 *    first names and legend below are DOM text. The tree also sits AFTER the
 *    grid and the list in DOM order, so no `.first()` lands here.
 * 3. NO AUTO-SCROLL UNLESS THIS TREE IS THE ONE ON SCREEN. `getClientRects()`
 *    is empty for a `display: none` element, so the scroll below cannot fire on
 *    a desktop, where two specs measure the page at scroll-top. The scroll is
 *    decided ONCE per week shown, at the first moment the time is known
 *    (`autoScrollDecision` in the core): a phone opened at 07:50 is not moved
 *    when the clock reaches 08:00.
 *
 * NO `overflow`, `transform` OR `filter` ON ANY WRAPPER. Each makes an element a
 * containing block or a scrollport, and the sticky day header would then pin to
 * a box that never moves (AGENDA-01). The header sticks to the PAGE under the
 * toolbar through the same `--agenda-header-top` the grid and the list use.
 * `isolate` on the root is a stacking context only: it keeps the blocks' z-10
 * from painting over the sticky toolbar (also z-10) while scrolling. Inside it
 * the order is blocks and chips z-10, the now line z-20, the pinned day header
 * z-30: the day columns set no z-index, so all of them share this one context
 * and a now line scrolled under the header passes BEHIND it (the desktop grid's
 * header is above its now line for the same reason).
 *
 * THE TIME AXIS NEEDS NO PIN. The grid never scrolls sideways (the e2e asserts
 * the page does not), so the axis never leaves the screen horizontally, and its
 * labels must travel with their rows vertically - a label frozen in place would
 * name whatever row happens to be level with it (agenda-grid.tsx's reasoning).
 */

/**
 * Height of one 30-minute row, from the core: the half-lane face (time, name,
 * glyph) plus the 1px gap under a block, so a 30-minute block is 33px and a
 * 45-minute one 50px.
 */
const ROW_PX = COMPACT_ROW_PX;
/**
 * The start time is never cut. Measured in Chromium with Inter loaded, "15:00"
 * at 600 with tabular figures is 2.86em wide (25.7px at 9px), so it needs about
 * 26px of face at 9px, and a half lane has 25.7px without Dom and 21.4px with
 * Dom at 390. The block is a size container, so `100cqi` is its content width:
 * the time is 9px wherever 9px fits and only as much smaller as the lane needs
 * where it does not (about 7.4px in a half lane at 390 with Dom shown). 2.9
 * rather than 2.86 is a margin for a font build a little wider than the one
 * measured. WebKit has container units since Safari 16.
 */
const TIME_FONT = "min(9px, calc(100cqi / 2.9))";

const COLOR_BY_KEY: ReadonlyMap<string, ServiceColor> = new Map(
  [...SERVICE_COLORS, SERVICE_COLOR_NONE].map((c) => [c.key, c]),
);

function colorFor(key: string): ServiceColor {
  return COLOR_BY_KEY.get(key) ?? SERVICE_COLOR_NONE;
}

type CompactProps = {
  anchor: string;
  appointments: AgendaAppointment[];
  blocks?: BlockSpan[];
  closure?: { startMin: number; endMin: number; locationName: string } | null;
  sharedResourceIds?: ReadonlySet<string>;
  /** Opens the existing edit sheet, exactly as the grid and the list do. */
  onSelectAppointment: (appt: AgendaAppointment) => void;
  /** Opens Dia for that date. Never writes the stored view preference. */
  onSelectDay: (date: string) => void;
  className?: string;
};

/**
 * The phone week: the clock and the one-time scroll live here, the drawing in
 * `CompactWeekView`. The split is what lets a test render the view WITH a now
 * line (a value passed in) and this component WITHOUT one (no clock is read
 * during render), under the same fixed clock.
 */
export function AgendaWeekCompact({
  anchor,
  appointments,
  blocks = [],
  closure = null,
  sharedResourceIds,
  onSelectAppointment,
  onSelectDay,
  className,
}: CompactProps) {
  const week = buildCompactWeek({ anchor, appointments, blocks, closure, sharedResourceIds });
  const win = week.window;

  /* "NOW" IS READ AFTER MOUNT, NOT DURING RENDER. A clock read in render would
     differ between the server pass and hydration; starting at null makes both
     render the same markup and the line appears on the first client effect.
     (The desktop grid's `useState(() => new Date())` initialiser is the
     pattern this avoids.) */
  const [now, setNow] = useState<{ date: string; min: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow({ date: todayInLisbon(d), min: lisbonMinutesFromMidnight(d) });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rootRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const decidedFor = useRef<string | null>(null);
  const weekKey = week.days[0]?.date ?? anchor;
  const datesKey = week.days.map((d) => d.date).join(",");
  const nowDate = now?.date ?? null;
  const nowMin = now?.min ?? null;

  /* AUTO-SCROLL TO NOW: decided once per week shown (see autoScrollDecision),
     and only when this tree is the one displayed. The target puts the now line
     two rows below the sticky day header, so the reader sees what just
     happened and what comes next. */
  useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    if (!root || !body) return;
    const current = nowDate !== null && nowMin !== null ? { date: nowDate, min: nowMin } : null;
    const decision = autoScrollDecision({
      weekKey,
      decidedFor: decidedFor.current,
      now: current,
      dates: datesKey.split(","),
      window: { startMin: win.startMin, endMin: win.endMin },
      displayed: root.getClientRects().length > 0,
    });
    decidedFor.current = decision.decidedFor;
    if (!decision.scroll || nowMin === null) return;
    const pinnedTop =
      Number.parseFloat(window.getComputedStyle(root).getPropertyValue("--agenda-header-top")) || 0;
    const headerPx = headerRef.current?.getBoundingClientRect().height ?? 0;
    const lineY =
      body.getBoundingClientRect().top +
      window.scrollY +
      ((nowMin - win.startMin) / COMPACT_ROW_MINUTES) * ROW_PX;
    window.scrollTo({ top: Math.max(0, lineY - pinnedTop - headerPx - 2 * ROW_PX) });
  }, [nowDate, nowMin, weekKey, datesKey, win.startMin, win.endMin]);

  return (
    <CompactWeekView
      week={week}
      now={now}
      appointments={appointments}
      onSelectAppointment={onSelectAppointment}
      onSelectDay={onSelectDay}
      className={className}
      rootRef={rootRef}
      headerRef={headerRef}
      bodyRef={bodyRef}
    />
  );
}

/**
 * The drawing. Pure: everything it shows is in its props, `now` included, and
 * it reads no clock.
 */
export function CompactWeekView({
  week,
  now,
  appointments,
  onSelectAppointment,
  onSelectDay,
  className,
  rootRef,
  headerRef,
  bodyRef,
}: {
  week: CompactWeek;
  now: { date: string; min: number } | null;
  appointments: AgendaAppointment[];
  onSelectAppointment: (appt: AgendaAppointment) => void;
  onSelectDay: (date: string) => void;
  className?: string;
  rootRef?: Ref<HTMLElement>;
  headerRef?: Ref<HTMLDivElement>;
  bodyRef?: Ref<HTMLDivElement>;
}) {
  const win = week.window;
  const byId = new Map(appointments.map((a) => [a.id, a]));
  const rows = (win.endMin - win.startMin) / COMPACT_ROW_MINUTES;
  const totalPx = rows * ROW_PX;
  const minToPx = (m: number) => ((m - win.startMin) / COMPACT_ROW_MINUTES) * ROW_PX;
  /* The hour lines start each hour INSIDE the window; the axis labels also
     name the window's END, on the bottom edge (see the axis below). */
  const hours: number[] = [];
  for (let m = win.startMin; m < win.endMin; m += 60) hours.push(m);
  const axisLabels = [...hours, win.endMin];
  const cols = { gridTemplateColumns: `${COMPACT_AXIS_PX}px repeat(${week.days.length}, minmax(0, 1fr))` };
  const nowDate = now?.date ?? null;
  const nowMin = now?.min ?? null;
  const nowInWindow = nowMin !== null && nowMin >= win.startMin && nowMin <= win.endMin;

  return (
    <section
      ref={rootRef}
      data-testid="agenda-compact-week"
      aria-label={s["agenda.compactWeek"]}
      className={`relative isolate -mx-6 bg-v2-surface ${className ?? ""}`}
    >
      {/* ---- The day header: sticky, and each day is a button into Dia. ---- */}
      <div
        ref={headerRef}
        data-testid="agenda-compact-header"
        className="sticky z-30 grid border-y border-v2-border bg-v2-surface"
        style={{ ...cols, top: "var(--agenda-header-top, 0px)" }}
      >
        <div className="border-r border-v2-border" />
        {week.days.map((d) => {
          const label = formatDayHeader(d.date, locale);
          return (
            <button
              key={d.date}
              type="button"
              data-compact-header-day={d.date}
              aria-label={`${s["agenda.openDay"]} ${label}`}
              onClick={() => onSelectDay(d.date)}
              className={`flex h-10 min-w-0 items-center justify-center border-r border-v2-border px-0.5 text-[11px] font-medium whitespace-nowrap last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                d.date === nowDate ? "text-v2-green-700" : "text-v2-text-primary"
              }`}
            >
              {/* The label is CSS generated content, not DOM text: see rule 2
                  at the top of this file. */}
              <span
                aria-hidden="true"
                data-compact-label={compactDayLabel(label)}
                className="before:content-[attr(data-compact-label)]"
              />
            </button>
          );
        })}
      </div>

      {/* ---- The body: the axis and one column per day. ----
          HOUR RULES ONLY, AS ON THE DESKTOP. The rows are 30 minutes (ROW_PX
          per half hour, every block placed on that scale), but the faint :30
          rule was removed from the desktop grid on the owner's request (W13-B,
          agenda-grid.tsx) and this is that grid, compressed, so it draws none
          either.
          THE AXIS NAMES THE WINDOW'S END ON THE BOTTOM EDGE. An hour label names
          the row it starts, so without this the axis stopped at 20:00 and the
          last hour of the day was unlabelled: the symptom 0085 removed from the
          desktop (its closing label). `pb-1.5` is room for that label, which is
          centred on the edge like every other one, before the legend's rule. */}
      <div ref={bodyRef} className="grid pb-1.5" style={cols}>
        <div
          data-testid="agenda-compact-axis"
          aria-hidden="true"
          className="relative border-r border-v2-border"
          style={{ height: totalPx }}
        >
          {axisLabels.map((m, i) => (
            <span
              key={m}
              data-compact-axis-min={m}
              className="absolute right-1 bg-v2-surface text-[10px] leading-none tabular-nums text-v2-text-secondary"
              style={{ top: i === 0 ? 2 : minToPx(m) - 5 }}
            >
              {slotLabel(m)}
            </span>
          ))}
        </div>

        {week.days.map((d) => (
          <div
            key={d.date}
            data-compact-day={d.date}
            className="relative border-r border-v2-border last:border-r-0"
            style={{ height: totalPx }}
          >
            {hours.map((m, i) =>
              i === 0 ? null : (
                <div
                  key={m}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-v2-border"
                  style={{ top: minToPx(m) }}
                />
              ),
            )}

            {d.bands.map((b) => (
              <Band key={b.kind === "block" ? b.id : `closure-${d.date}`} band={b} top={minToPx(b.startMin)} height={minToPx(b.endMin) - minToPx(b.startMin)} />
            ))}

            {d.appointments.map((a) => (
              <Block
                key={a.id}
                a={a}
                top={minToPx(a.startMin)}
                height={minToPx(a.drawnEndMin) - minToPx(a.startMin) - 1}
                onSelect={() => {
                  const appt = byId.get(a.id);
                  if (appt) onSelectAppointment(appt);
                }}
              />
            ))}

            {d.more.map((m) => (
              <More
                key={m.key}
                m={m}
                dayLabel={formatDayHeader(d.date, locale)}
                top={minToPx(m.startMin)}
                onSelect={() => onSelectDay(d.date)}
              />
            ))}

            {d.date === nowDate && nowInWindow && nowMin !== null && (
              <div
                data-testid="agenda-compact-now"
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-v2-burgundy-600"
                style={{ top: minToPx(nowMin) - 1 }}
              />
            )}
          </div>
        ))}
      </div>

      {/* ---- Q-B6-3: colour is never the only cue, so the week names its
              services beside their colours. Each block also carries its
              service in its accessible name. ---- */}
      {week.legend.length > 0 && (
        <ul
          data-testid="agenda-compact-legend"
          aria-label={s["agenda.legend"]}
          className="flex flex-wrap gap-x-3 gap-y-1 border-t border-v2-border px-3 py-2 text-[11px] text-v2-text-secondary"
        >
          {week.legend.map((e) => (
            <li key={e.serviceId ?? "none"} className="inline-flex min-w-0 items-center gap-1">
              <span aria-hidden="true" className={`size-2.5 flex-none rounded-sm ${colorFor(e.colorKey).swatch}`} />
              <span className="min-w-0 break-words">{e.serviceName ?? s["agenda.noService"]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One appointment: its start time, then its first name and status glyph, on
 * the service's colour. Tapping it opens the existing edit sheet. The
 * accessible name carries everything the face cannot: the full name, whose row
 * it is (Q-B6-6: a machine row has no visual marker), the service and the
 * status.
 *
 * THE FACE IN A HALF-WIDTH LANE. A lane is 22.3px at 360 with Dom shown and
 * 28.7px at 390 without. The time sits one pixel from the stripe and sizes
 * itself to the lane (TIME_FONT); the first name has a line of its own across
 * the whole face, at 9px, CLIPPED rather than ellipsised (an 8.6px ellipsis in
 * 21px would leave one letter; "Gem" is 20.2px at 9px); the status glyph has
 * the line below. Every half-lane block has that room: a row is as tall as the
 * face (COMPACT_ROW_PX). With the glyph before the name, a 30-minute half lane
 * left the name 6 to 9px: none to two letters. A block on its own keeps two
 * lines, the glyph before an ellipsised name, with room for both.
 */
function Block({
  a,
  top,
  height,
  onSelect,
}: {
  a: CompactAppointment;
  top: number;
  height: number;
  onSelect: () => void;
}) {
  const color = colorFor(a.colorKey);
  const box = compactLaneBox(a.lane, a.lanes);
  const half = a.lanes === 2;
  const name = [
    a.timeLabel,
    a.patientLabel,
    a.practitionerName,
    a.serviceName ?? s["agenda.noService"],
    `${s["appointment.status"]}: ${s[ESTADO_LABEL_KEY[a.estado]]}`,
  ].join(", ");
  const patient = (
    <span
      data-testid="agenda-compact-patient"
      className={`block min-w-0 overflow-hidden whitespace-nowrap ${
        half ? "text-clip text-[9px] leading-[10px]" : "text-ellipsis text-[10px] leading-3"
      } ${a.struck ? "line-through" : ""} ${a.withheld ? "italic" : ""}`}
    >
      {a.firstName}
    </span>
  );
  return (
    <button
      type="button"
      data-compact-appointment-id={a.id}
      data-compact-lane={a.lane}
      data-compact-lanes={a.lanes}
      data-compact-face={half ? "three-lines" : "two-lines"}
      aria-label={name}
      onClick={onSelect}
      className={`absolute z-10 flex flex-col items-stretch overflow-hidden rounded-[3px] border-l-2 py-px text-left text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
        half ? "pl-px pr-0" : "px-[3px]"
      } ${color.fill} ${color.stripe}`}
      style={{ top, height, left: box.left, width: box.width, containerType: "inline-size" }}
    >
      <span
        data-testid="agenda-compact-time"
        className="block truncate font-semibold leading-[11px] tabular-nums"
        style={{ fontSize: TIME_FONT }}
      >
        {a.timeLabel}
      </span>
      {half ? (
        <>
          {patient}
          <EstadoMarker estado={a.estado} size={COMPACT_FACE.glyphPx} />
        </>
      ) : (
        <span className="flex min-w-0 items-center gap-0.5">
          <EstadoMarker estado={a.estado} size={10} />
          {patient}
        </span>
      )}
    </button>
  );
}

/**
 * Q-B6-1: the rows of a crowded moment beyond the two drawn blocks, as one
 * "+N" chip that opens that day in Dia. It is a pill on the blocks' glyph line,
 * across the gap between them (COMPACT_CHIP): it covers no time, name or
 * glyph. It is smaller than a 24px target; the day header above the column,
 * 40px tall, opens the same Dia, which is WCAG 2.5.8's equivalent-control case.
 */
function More({
  m,
  dayLabel,
  top,
  onSelect,
}: {
  m: CompactMore;
  dayLabel: string;
  top: number;
  onSelect: () => void;
}) {
  const what = m.count === 1 ? s["agenda.moreOne"] : s["agenda.moreMany"].replace("{n}", String(m.count));
  return (
    <button
      type="button"
      data-testid="agenda-compact-more"
      data-compact-more-count={m.count}
      aria-label={`${what}. ${s["agenda.openDay"]} ${dayLabel}`}
      onClick={onSelect}
      className="absolute z-10 flex items-center justify-center overflow-hidden rounded-full bg-v2-text-primary text-[8px] font-bold leading-none tabular-nums text-v2-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      style={{
        top: top + COMPACT_CHIP.topPx,
        height: COMPACT_CHIP.heightPx,
        left: COMPACT_CHIP.leftPx,
        right: COMPACT_CHIP.right,
      }}
    >
      +{m.count}
    </button>
  );
}

/**
 * Q-B6-8: blocked time and the midday closure, VISUAL ONLY. The phone list
 * already shows both as rows with their words; here they are the grid's two
 * existing band looks (the hatch for a therapist's block, the flat band for the
 * building being shut), under the blocks, never interactive. The Dia view on a
 * phone is the list, which names them in text.
 */
function Band({ band, top, height }: { band: CompactBand; top: number; height: number }) {
  if (height <= 0) return null;
  const look =
    band.kind === "block"
      ? "rounded-[3px] bg-surface-muted/80 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.05)_6px,rgba(0,0,0,0.05)_12px)]"
      : "border-y border-v2-border bg-v2-text-primary/[0.07]";
  return (
    <div
      data-testid="agenda-compact-band"
      data-compact-band-kind={band.kind}
      aria-hidden="true"
      title={band.kind === "block" ? (band.note ?? s["agenda.blockedTime"]) : s["agenda.clinicClosed"]}
      className={`pointer-events-none absolute inset-x-0 ${look}`}
      style={{ top, height }}
    />
  );
}
