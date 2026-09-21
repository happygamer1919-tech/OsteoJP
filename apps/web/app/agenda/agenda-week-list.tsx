"use client";

import { locale, s } from "@/lib/i18n";
import {
  buildWeekListDays,
  type ClosureWindow,
  type WeekListRow,
} from "@/lib/scheduling/agenda-week-list-core";
import type { BlockSpan } from "@/lib/scheduling/blocked-time-core";
import { estadoStrikesName } from "@/lib/scheduling/estado";
import { patientLabel } from "@/lib/scheduling/patient-label";
import { paletteColorByKey, therapistColor } from "@/lib/scheduling/therapist-color";
import { formatDayHeader, slotLabel, todayInLisbon, type AgendaView } from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { EstadoMarker } from "./estado-marker";

/* ==================================================================== */
/* AGMOB-01 - THE WEEK, ON A PHONE, AS A LIST.                          */
/* ==================================================================== */
/*
 * A therapist reported that the weekly view is not available on the phone. It
 * was not: agenda-view.tsx forced the Dia view below `lg` through a client-side
 * matchMedia override, and hid the Dia/Semana toggle, so nothing a thumb could
 * press reached the week. The server had been fetching the week all along.
 *
 * THIS IS NOT THE GRID MADE NARROWER, AND THAT IS THE WHOLE DESIGN. The grid is
 * one CSS Grid of `64px repeat(dates.length, minmax(0, 1fr))`; six columns in a
 * 342px content box leaves 46px a column, and after the column border and the
 * name button's `px-2` a patient name has 11px - one to two characters per
 * line, with `break-words` stacking the remainder into a ribbon. So below `md`
 * the same data is projected into a vertical list of DAYS instead, where a name
 * gets the full width.
 *
 * WHAT THIS COMPONENT DECIDES: nothing. `buildWeekListDays` decides which days
 * exist, what is on them, in what order and how many appointments each holds -
 * pure, no DOM, no clock - and this file renders the answer. The reason is that
 * no CI job here runs WebKit (`.github/workflows/e2e.yml` passes
 * `--project=chromium` alone) while the clinic is on iPhones, so every claim
 * worth making has to be a claim about a value.
 *
 * EVERY HANDLE HERE IS PREFIXED `data-list-`, AND THAT IS A RULE, NOT A STYLE.
 * This component puts a SECOND element in the DOM for every appointment the
 * grid already renders, at every viewport - the swap is CSS, so both trees are
 * always present. Any CSS-attribute locator that the grid answers to and this
 * tree also answers to therefore returns TWO elements instead of one.
 *
 * THAT IS NOT HYPOTHETICAL. The first push of this card used `data-appointment-id`
 * on the row, and `therapist-cancel-uncancel.spec.ts` failed in the required E2E
 * gate with `expect(locator).toHaveCount(1) ... Received: 2` on
 * `[data-appointment-id="74cbdbbc-..."]`. Eleven e2e files select on that
 * attribute and `e2e/helpers/index.ts:451` does an UNSCOPED
 * `page.locator("[data-appointment-id]").evaluateAll(...)`.
 *
 * So: `data-list-day` not `data-day`, `data-list-appointment-id` not
 * `data-appointment-id`, `data-list-block-id` not `data-block-id`. The render
 * test asserts the absence of all three grid forms, which is the only part of
 * this a reviewer can check cheaply.
 *
 * ROLE AND TEXT LOCATORS ARE A DIFFERENT CASE and are NOT a problem: `md:hidden`
 * is `display: none`, and Playwright's role locators do not match elements
 * outside the accessibility tree. `e2e/agenda-mobile-week.spec.ts` measures that
 * on the real page rather than taking it on trust.
 *
 * NO `overflow`, NO `transform`, NO `filter` ON ANY WRAPPER HERE OR AROUND THE
 * GRID. Each of the three makes an element a containing block or a scroll
 * container, and AGENDA-01's sticky weekday header then pins to a box that
 * never moves. The day headings below are sticky against the PAGE, using the
 * same `--agenda-header-top` the grid's header uses, so the two surfaces cannot
 * drift apart.
 */

export function AgendaWeekList({
  view,
  anchor,
  appointments,
  blocks = [],
  closure = null,
  dayWindow,
  onSelectAppointment,
  onOpenBlock,
  className,
}: {
  view: AgendaView;
  anchor: string;
  appointments: AgendaAppointment[];
  blocks?: BlockSpan[];
  closure?: ClosureWindow | null;
  dayWindow?: { startMin: number; endMin: number };
  onSelectAppointment: (appt: AgendaAppointment) => void;
  /** SCHED-22: a band opens the block that made it. Absent = not openable. */
  onOpenBlock?: (blockId: string) => void;
  className?: string;
}) {
  const days = buildWeekListDays({ view, anchor, appointments, blocks, closure, dayWindow });
  const byId = new Map(appointments.map((a) => [a.id, a]));
  const today = todayInLisbon();

  return (
    <section
      data-testid="agenda-week-list"
      aria-label={s["agenda.weekList"]}
      className={`flex flex-col ${className ?? ""}`}
    >
      {days.map((day) => (
        <section key={day.date} data-list-day={day.date} className="flex flex-col">
          <h2
            data-testid="agenda-week-list-day-heading"
            className="sticky z-20 flex items-baseline gap-2 border-b border-v2-border bg-v2-surface px-3 py-2 text-sm font-semibold text-v2-text-primary"
            style={{ top: "var(--agenda-header-top, 0px)" }}
          >
            <span className={day.date === today ? "text-v2-green-700" : undefined}>
              {formatDayHeader(day.date, locale)}
            </span>
            <span className="text-xs font-normal text-v2-text-secondary">
              {day.appointmentCount}{" "}
              {day.appointmentCount === 1 ? s["agenda.apptCountOne"] : s["agenda.apptCountMany"]}
            </span>
          </h2>

          {day.rows.length === 0 ? (
            /* NOT `agenda.noAppointments`. That string says "neste período",
               which is wrong under a heading that names ONE date - and it has
               zero call sites, so it is dormant rather than established. The
               string used here is SPEC-staff-screens.md's own, which was
               specified and never built. */
            <p className="px-3 py-3 text-sm text-v2-text-secondary">
              {s["agenda.dayNoAppointments"]}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-v2-border">
              {day.rows.map((row) => (
                <li key={rowKey(day.date, row)}>
                  <Row
                    row={row}
                    onSelectAppointment={
                      row.kind === "appointment"
                        ? () => {
                            const appt = byId.get(row.id);
                            if (appt) onSelectAppointment(appt);
                          }
                        : undefined
                    }
                    onOpenBlock={onOpenBlock}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}

function rowKey(date: string, row: WeekListRow): string {
  return row.kind === "closure" ? `${date}-closure` : `${row.kind}-${row.id}`;
}

/** "09:00 · 1h30" — the time column. Duration is TEXT, not a height: the grid's
 *  hour rows are non-linear (STAFF-03), so pixel height never read as duration
 *  and on a phone it would read as even less. */
function When({ startMin, endMin }: { startMin: number; endMin: number }) {
  const mins = Math.max(0, endMin - startMin);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dur = h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  return (
    <span className="flex w-16 flex-none flex-col text-xs tabular-nums leading-tight text-v2-text-secondary">
      <span className="font-semibold text-v2-text-primary">{slotLabel(startMin)}</span>
      <span>{dur}</span>
    </span>
  );
}

/* Tap targets are `min-h-11` = 44px. WCAG 2.2 AA asks for 24x24; this clinic is
   holding phones, and 44 is the platform convention both Apple and Google
   publish. The e2e spec measures the rendered boxes rather than the class. */
const ROW = "flex w-full min-h-11 items-start gap-2 px-3 py-2 text-left";

function Row({
  row,
  onSelectAppointment,
  onOpenBlock,
}: {
  row: WeekListRow;
  onSelectAppointment?: () => void;
  onOpenBlock?: (blockId: string) => void;
}) {
  if (row.kind === "closure") {
    /* NOT a button, deliberately: the clinic being shut is not something the
       reader can open or act on, and the grid's own closure band is
       `pointer-events-none` for the same reason. Colour is not the only cue -
       it says so in words. */
    return (
      <div
        data-testid="agenda-week-list-closure"
        className={`${ROW} bg-v2-text-primary/[0.05] text-sm text-v2-text-secondary`}
      >
        <When startMin={row.startMin} endMin={row.endMin} />
        <span className="min-w-0 break-words font-medium uppercase tracking-wide">
          {s["agenda.clinicClosed"]}
        </span>
      </div>
    );
  }

  if (row.kind === "block") {
    const openable = onOpenBlock != null;
    const Tag = openable ? "button" : "div";
    return (
      <Tag
        {...(openable
          ? { type: "button" as const, onClick: () => onOpenBlock!(row.id) }
          : {})}
        data-testid="agenda-week-list-block"
        data-list-block-id={row.id}
        className={`${ROW} bg-v2-text-primary/[0.04] text-sm text-v2-text-secondary ${
          openable
            ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
            : ""
        }`}
      >
        <When startMin={row.startMin} endMin={row.endMin} />
        <span className="min-w-0 break-words">
          <span className="font-medium">{s["agenda.blockedTime"]}</span>
          {row.note ? <span className="text-v2-text-secondary"> · {row.note}</span> : null}
        </span>
      </Tag>
    );
  }

  const tColor = paletteColorByKey(row.colorKey) ?? therapistColor(row.practitionerId);
  const struck = estadoStrikesName(row.estado);
  return (
    <button
      type="button"
      onClick={onSelectAppointment}
      /* The row's own identity, same reasoning as the grid's card - a patient
         name is shared vocabulary on a seeded database and the time is
         positional, so only the id proves a test opened the RIGHT row - but
         under a DIFFERENT attribute name. See the header: the grid's
         `data-appointment-id` must resolve to exactly one element. */
      data-list-appointment-id={row.id}
      className={`${ROW} text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset`}
    >
      <When startMin={row.startMin} endMin={row.endMin} />
      <EstadoMarker estado={row.estado} className="mt-0.5" />
      <span className="flex min-w-0 flex-col">
        {/* NOT shortPatientName(). PL-10 shortened the name because a 46px grid
            column could not hold it; this row is the full width, so the whole
            name is rendered and `break-words` wraps it rather than clipping. */}
        <span
          data-testid="week-list-patient"
          className={`block min-w-0 break-words font-medium ${tColor.text} ${
            struck ? "line-through" : ""
          }`}
        >
          {patientLabel(row.patientName)}
        </span>
        {/* W9-05: the therapist is named in TEXT on every row. Colour is never
            the only cue, and on a week list the column position that identified
            a day on the grid is gone, so the name has to carry it. */}
        <span className="block min-w-0 break-words text-xs text-v2-text-secondary">
          {row.practitionerName}
          {row.serviceName ? ` · ${row.serviceName}` : ""}
        </span>
      </span>
    </button>
  );
}
