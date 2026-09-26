"use client";

import { s } from "@/lib/i18n";
import type { Option } from "@/lib/scheduling/types";

/* ==================================================================== */
/* AGENDA-FILTER-SERVICE - the toolbar's service chips.                 */
/* ==================================================================== */
/*
 * Two pieces, both WITHOUT hooks: a toggle button that carries the count badge,
 * and the panel of chips it opens. agenda-view.tsx owns the state (the stored
 * selection and whether the panel is open) and decides what a press does
 * (lib/scheduling/agenda-service-filter.ts). Hook-free so a test can call them
 * as functions and press their buttons without a DOM.
 *
 * WHY THE TOGGLE IS MOUNTED TWICE, ONE PER BREAKPOINT. The toolbar is already
 * measured to the pixel (AGENDA-02, AGENDA-MOBILE-WEEK):
 *   - at 1280 the control row is one line with ~78px spare, so a labelled
 *     toggle there would wrap it and cost the grid a 44px row. On desktop the
 *     toggle sits on LINE 1, beside the therapist and clinic filters, which is
 *     the line for filters.
 *   - below `md` line 1 holds the two selects in ~268px. A toggle there would
 *     squeeze each select to ~70px. On a phone the toggle sits beside Dia/Semana,
 *     on the row that toggle already has to itself.
 * Exactly one is displayed at any width (`hidden md:inline-flex` and
 * `inline-flex md:hidden`), so a role locator finds one. Their test ids differ
 * (`-phone`), so an attribute locator never finds two.
 *
 * THE PANEL IS RENDERED ONLY WHILE OPEN, never hidden by CSS. A hidden panel
 * would be a set of buttons in the DOM at every width, and every toolbar test
 * that counts controls would count them.
 */

export const SERVICE_FILTER_PANEL_ID = "agenda-service-filter-panel";

/** "1 selecionado" / "3 selecionados": the count the badge shows, in words. */
export function serviceFilterCountLabel(count: number): string {
  return count === 1
    ? s["agenda.filterServicesSelectedOne"]
    : s["agenda.filterServicesSelectedMany"].replace("{n}", String(count));
}

export function ServiceFilterToggle({
  count,
  expanded,
  onToggle,
  testId,
  className,
}: {
  /** How many services are selected. 0 = the filter is off, and no badge. */
  count: number;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
  /** The DISPLAY classes, which say at which widths this copy shows. */
  className: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={expanded}
      aria-controls={expanded ? SERVICE_FILTER_PANEL_ID : undefined}
      onClick={onToggle}
      className={`h-10 flex-none items-center gap-1.5 rounded-v2 border px-3 text-sm font-medium transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
        count > 0 ? "border-v2-green-700 text-v2-green-800" : "border-v2-border text-v2-text-primary"
      } ${className}`}
    >
      <span className="whitespace-nowrap">{s["agenda.filterServices"]}</span>
      {count > 0 && (
        <>
          {/* THE COUNT BADGE. The digit is for the eye; the words after it are
              for a screen reader, so the name reads "Serviços, 2 selecionados"
              rather than "Serviços 2". */}
          <span
            aria-hidden="true"
            data-testid={`${testId}-count`}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-v2-green-700 px-1.5 text-xs font-semibold tabular-nums text-text-inverse"
          >
            {count}
          </span>
          <span className="sr-only">, {serviceFilterCountLabel(count)}</span>
        </>
      )}
    </button>
  );
}

export function ServiceFilterPanel({
  services,
  selected,
  onToggle,
  onClear,
}: {
  /** The chips, already scoped to the viewer's clinics and in the app's order. */
  services: readonly Option[];
  selected: readonly string[];
  onToggle: (serviceId: string) => void;
  onClear: () => void;
}) {
  const chip =
    "inline-flex h-10 max-w-full min-w-0 items-center rounded-full border px-3 text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
  // v2 Wellness Green, on the AA rule theme.css states: 700 as a FILL or a
  // border, 800 for label text (on green-50 that is well over 4.5:1).
  const on = "border-v2-green-700 bg-v2-green-50 text-v2-green-800";
  const off = "border-v2-border text-v2-text-secondary hover:bg-surface-muted";
  return (
    <div
      id={SERVICE_FILTER_PANEL_ID}
      role="group"
      aria-label={s["agenda.filterServicesGroup"]}
      data-testid="agenda-service-filter-panel"
      // flex-wrap inside the toolbar's content box: however many services and
      // however long their names, the chips wrap and never widen the page.
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      {/* "Todos os serviços" is the empty selection made visible: pressed when
          nothing is selected, and pressing it clears the selection. */}
      <button
        type="button"
        aria-pressed={selected.length === 0}
        data-agenda-service-chip-all=""
        onClick={onClear}
        className={`${chip} ${selected.length === 0 ? on : off}`}
      >
        <span className="truncate">{s["agenda.allServices"]}</span>
      </button>
      {services.map((svc) => {
        const pressed = selected.includes(svc.id);
        return (
          <button
            key={svc.id}
            type="button"
            aria-pressed={pressed}
            data-agenda-service-chip={svc.id}
            onClick={() => onToggle(svc.id)}
            className={`${chip} ${pressed ? on : off}`}
          >
            <span className="truncate">{svc.label}</span>
          </button>
        );
      })}
    </div>
  );
}
