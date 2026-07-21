"use client";

import { Repeat, StickyNote, User } from "lucide-react";
import { useEffect, useState } from "react";

import { locale, s } from "@/lib/i18n";
import {
  isSlotBlocked,
  placeBlocksOnDate,
  type BlockPlacement,
  type BlockSpan,
} from "@/lib/scheduling/blocked-time-core";
import { intervalsOverlap } from "@/lib/scheduling/overlap";
import { therapistColor } from "@/lib/scheduling/therapist-color";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  daySlots,
  formatDayHeader,
  formatTimeOfDay,
  lisbonMinutesFromMidnight,
  lisbonParts,
  slotLabel,
  todayInLisbon,
  viewDates,
  type AgendaView,
} from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { AppointmentHoverPanel } from "./appointment-hover-card";
import { ConfirmationIndicator } from "./confirmation-indicator";

const SLOT_HEIGHT = 48; // px per 30-min slot
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;
const GUTTER = 64;

/** Minutes from the grid's first row -> px. Shared by cards and blocked bands. */
const minToPx = (min: number) => ((min - DAY_START_MIN) / 30) * SLOT_HEIGHT;

type StringKey = keyof typeof s;

/**
 * Service category → v2 accent (SPEC-v2-agenda §2.1). Cards are tinted by SERVICE
 * category, not status. The five categories below are the complete color-coded
 * set; any service outside the list falls back to a neutral glass tint and the
 * "Outros serviços" legend entry (flagged to Ivan in the PR ASSUMPTION block).
 */
type ServiceAccent = "green" | "lavender" | "gold" | "blue" | "burgundy";

// Legend order follows the SPEC §2.1 table.
const ACCENT_ORDER: ServiceAccent[] = [
  "green",
  "lavender",
  "gold",
  "blue",
  "burgundy",
];

// Card tint: 100 fill + 200 hairline, with v2-text-primary labels (≥11:1 on
// every 100 tint) so AA never depends on the accent (§2.1 / §3.4).
const SERVICE_TINT: Record<ServiceAccent, string> = {
  green: "bg-v2-green-100 border-v2-green-200",
  lavender: "bg-v2-lavender-100 border-v2-lavender-200",
  gold: "bg-v2-gold-100 border-v2-gold-200",
  blue: "bg-v2-blue-100 border-v2-blue-200",
  burgundy: "bg-v2-burgundy-100 border-v2-burgundy-200",
};

// Legend swatch echoes the card tint (100 fill, 300 edge). The adjacent text
// label carries the name, so color is never the sole information channel.
const SWATCH_TINT: Record<ServiceAccent, string> = {
  green: "bg-v2-green-100 border-v2-green-300",
  lavender: "bg-v2-lavender-100 border-v2-lavender-300",
  gold: "bg-v2-gold-100 border-v2-gold-300",
  blue: "bg-v2-blue-100 border-v2-blue-300",
  burgundy: "bg-v2-burgundy-100 border-v2-burgundy-300",
};

const ACCENT_LABEL: Record<ServiceAccent, StringKey> = {
  green: "agenda.serviceMassagemTerapeutica",
  lavender: "agenda.serviceMassagemRelaxamento",
  gold: "agenda.serviceDrenagemLinfatica",
  blue: "agenda.serviceMassagemDesportiva",
  burgundy: "agenda.serviceOsteopatia",
};

/** Match a service name (accent- and case-insensitive) to its color category. */
function serviceAccent(name: string | null): ServiceAccent | null {
  if (!name) return null;
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (n.startsWith("osteopat")) return "burgundy";
  if (n.includes("drenagem linfatica")) return "gold";
  if (n.includes("massagem desportiva")) return "blue";
  if (n.includes("massagem relaxamento") || n.includes("massagem de relaxamento"))
    return "lavender";
  if (n.includes("massagem terapeutica")) return "green";
  return null;
}

function sameRoom(a: AgendaAppointment, b: AgendaAppointment): boolean {
  const ra = a.room?.trim().toLowerCase();
  const rb = b.room?.trim().toLowerCase();
  return !!ra && !!rb && ra === rb && a.locationId === b.locationId;
}

function conflictingIds(appts: AgendaAppointment[]): Set<string> {
  const flagged = new Set<string>();
  for (let i = 0; i < appts.length; i++) {
    for (let j = i + 1; j < appts.length; j++) {
      const a = appts[i]!;
      const b = appts[j]!;
      if (a.status === "cancelled" || b.status === "cancelled") continue;
      if (a.practitionerId !== b.practitionerId && !sameRoom(a, b)) continue;
      if (intervalsOverlap(new Date(a.startsAt), new Date(a.endsAt), new Date(b.startsAt), new Date(b.endsAt))) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }
  return flagged;
}

/** Greedy side-by-side layout: each block gets {col, cols} within its overlap cluster. */
function layoutOverlaps(appts: AgendaAppointment[]): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...appts].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let cluster: AgendaAppointment[] = [];
  let clusterEnd = "";

  const flush = () => {
    const colEnd: string[] = []; // last end per column
    const assigned = new Map<string, number>();
    for (const a of cluster) {
      let col = colEnd.findIndex((end) => end <= a.startsAt);
      if (col === -1) {
        col = colEnd.length;
        colEnd.push(a.endsAt);
      } else {
        colEnd[col] = a.endsAt;
      }
      assigned.set(a.id, col);
    }
    const cols = colEnd.length;
    for (const a of cluster) out.set(a.id, { col: assigned.get(a.id)!, cols });
    cluster = [];
    clusterEnd = "";
  };

  for (const a of sorted) {
    if (cluster.length > 0 && a.startsAt >= clusterEnd) flush();
    cluster.push(a);
    if (a.endsAt > clusterEnd) clusterEnd = a.endsAt;
  }
  flush();
  return out;
}

export function AgendaGrid({
  view,
  anchor,
  appointments,
  blocks = [],
  onSelectAppointment,
  onSelectSlot,
}: {
  view: AgendaView;
  anchor: string;
  appointments: AgendaAppointment[];
  /** W9-04: time_off spans for the visible range. Non-empty ONLY when the agenda
   *  is scoped to one therapist (page.tsx), since the grid has no therapist axis
   *  and a full-width band would otherwise claim the whole clinic is blocked. */
  blocks?: BlockSpan[];
  onSelectAppointment: (appt: AgendaAppointment) => void;
  onSelectSlot: (date: string, time: string) => void;
}) {
  const dates = viewDates(view, anchor);
  const slots = daySlots();
  const totalHeight = slots.length * SLOT_HEIGHT;
  const conflicts = conflictingIds(appointments);
  const today = todayInLisbon();

  // Current-time line position (refreshed each minute). Rendered only on today.
  const [nowMin, setNowMin] = useState(() => lisbonMinutesFromMidnight(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setNowMin(lisbonMinutesFromMidnight(new Date())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowTop = ((nowMin - DAY_START_MIN) / 30) * SLOT_HEIGHT;
  const nowVisible = nowMin >= DAY_START_MIN && nowTop <= totalHeight;

  const byDate = new Map<string, AgendaAppointment[]>();
  for (const a of appointments) {
    const d = lisbonParts(new Date(a.startsAt)).date;
    const list = byDate.get(d);
    if (list) list.push(a);
    else byDate.set(d, [a]);
  }

  // Legend: only the categories present in the current view (§2.2). Cancelled
  // cards render muted, not service-tinted, so they never drive the legend.
  const presentAccents = new Set<ServiceAccent>();
  let hasOther = false;
  for (const a of appointments) {
    if (a.status === "cancelled") continue;
    const accent = serviceAccent(a.serviceName);
    if (accent) presentAccents.add(accent);
    else if (a.serviceName) hasOther = true;
  }
  const legendAccents = ACCENT_ORDER.filter((a) => presentAccents.has(a));
  const showLegend = legendAccents.length > 0 || hasOther;

  const gridCols = { gridTemplateColumns: `${GUTTER}px repeat(${dates.length}, minmax(0, 1fr))` };

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* Column headers */}
        <div className="grid border-b border-v2-border bg-v2-surface" style={gridCols}>
          <div className="border-r border-v2-border" />
          {dates.map((d) => (
            <div
              key={d}
              className={`border-r border-v2-border px-2 py-2 text-center text-sm font-medium last:border-r-0 ${
                d === today ? "text-v2-green-700" : "text-v2-text-primary"
              }`}
            >
              {formatDayHeader(d, locale)}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="grid" style={gridCols}>
          {/* Time gutter */}
          <div className="relative border-r border-v2-border" style={{ height: totalHeight }}>
            {slots.map((m, i) => (
              <div
                key={m}
                className={`absolute inset-x-0 ${m % 60 === 0 ? "border-b border-v2-border" : ""}`}
                style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              >
                {m % 60 === 0 && (
                  // The first hour label (i === 0) sits at the gutter top rather
                  // than centered on its line (-top-2), so it is not clipped above
                  // the grid body (W4-07: clipped 08:00 label).
                  <span
                    className={`absolute right-2 bg-v2-surface px-0.5 text-xs text-v2-text-secondary ${
                      i === 0 ? "top-0" : "-top-2"
                    }`}
                  >
                    {slotLabel(m)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dates.map((d) => {
            const dayAppts = byDate.get(d) ?? [];
            const layout = layoutOverlaps(dayAppts);
            const isToday = d === today;
            // W9-04: this day's blocked spans, clipped to the visible window.
            const dayBlocks = placeBlocksOnDate(blocks, d, DAY_END_MIN);
            return (
              <div key={d} className="relative border-r border-v2-border last:border-r-0" style={{ height: totalHeight }}>
                {/* Grid lines + clickable empty slots. A slot inside a blocked
                    span is DISABLED, not merely covered: an overlay alone would
                    still let a keyboard user tab to it and press Enter, which is
                    exactly the "bookable over blocked time" hole (CB QA item 3). */}
                {slots.map((m, i) => {
                  const blocked = isSlotBlocked(m, dayBlocks);
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={blocked}
                      aria-label={
                        blocked
                          ? `${formatDayHeader(d, locale)} ${slotLabel(m)} - ${s["agenda.blockedTime"]}`
                          : `${formatDayHeader(d, locale)} ${slotLabel(m)}`
                      }
                      onClick={blocked ? undefined : () => onSelectSlot(d, slotLabel(m))}
                      className={`absolute inset-x-0 transition duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                        blocked
                          ? "cursor-not-allowed"
                          : "motion-safe:active:scale-[0.97] hover:bg-v2-green-50"
                      } ${m % 60 === 0 ? "border-b border-v2-border" : "border-b border-surface-muted"}`}
                      style={{ top: i * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                    />
                  );
                })}

                {/* W9-04: blocked-time bands (SPEC-v2-agenda 2.1: muted,
                    non-interactive). Drawn above the slot layer so the hatch
                    reads, below the appointment cards (z-10) so a booking made
                    before the block was entered stays visible and fixable. */}
                {dayBlocks.map((p) => (
                  <BlockedBand key={p.id} placement={p} />
                ))}

                {/* Appointment blocks */}
                {dayAppts.map((a) => (
                  <AppointmentBlock
                    key={a.id}
                    appt={a}
                    conflicting={conflicts.has(a.id)}
                    place={layout.get(a.id) ?? { col: 0, cols: 1 }}
                    totalHeight={totalHeight}
                    onClick={() => onSelectAppointment(a)}
                  />
                ))}

                {/* Current-time line (on-palette burgundy, not an error red — §10). */}
                {isToday && nowVisible && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }} aria-hidden="true">
                    <span className="-ml-1 size-2 rounded-full bg-v2-burgundy-600" />
                    <span className="h-0.5 flex-1 bg-v2-burgundy-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Service-color legend (§2.2): one swatch + label per category in view. */}
      {showLegend && (
        <div
          role="group"
          aria-label={s["agenda.legend"]}
          className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-1"
        >
          {legendAccents.map((accent) => (
            <span key={accent} className="inline-flex items-center gap-2 text-sm text-v2-text-primary">
              <span aria-hidden="true" className={`size-3 rounded-sm border ${SWATCH_TINT[accent]}`} />
              {s[ACCENT_LABEL[accent]]}
            </span>
          ))}
          {hasOther && (
            <span className="inline-flex items-center gap-2 text-sm text-v2-text-primary">
              <span aria-hidden="true" className="size-3 rounded-sm border border-v2-border bg-v2-surface" />
              {s["agenda.serviceOther"]}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/**
 * W9-04 - a muted, non-interactive blocked-time band (SPEC-v2-agenda 2.1,
 * closing Q-V2W2-1, which deferred this until a data model existed; `time_off`
 * has existed since migration 0006).
 *
 * pointer-events-none so it never intercepts a click: the slot buttons beneath
 * are already `disabled`, which is what actually makes the span non-bookable for
 * mouse AND keyboard. The band is the visual half of the same fact.
 *
 * The label is text, never colour alone (the standing colour-not-only rule), and
 * is hidden on very short bands where it would not fit - the disabled slots
 * still carry the state in their aria-label, so the information is never
 * colour-only for a screen reader either.
 */
function BlockedBand({ placement }: { placement: BlockPlacement }) {
  const top = minToPx(placement.startMin);
  const height = minToPx(placement.endMin) - top;
  const showLabel = height >= SLOT_HEIGHT;

  return (
    <div
      data-testid="agenda-blocked-band"
      className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden rounded-v2 border border-v2-border bg-surface-muted/80 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.05)_6px,rgba(0,0,0,0.05)_12px)]"
      style={{ top, height }}
    >
      {showLabel && (
        <span className="block truncate px-2 py-1 text-xs font-medium text-v2-text-secondary">
          {s["agenda.blockedTime"]}
        </span>
      )}
    </div>
  );
}

function AppointmentBlock({
  appt,
  conflicting,
  place,
  totalHeight,
  onClick,
}: {
  appt: AgendaAppointment;
  conflicting: boolean;
  place: { col: number; cols: number };
  totalHeight: number;
  onClick: () => void;
}) {
  const startMin = lisbonMinutesFromMidnight(new Date(appt.startsAt));
  const endMin = lisbonMinutesFromMidnight(new Date(appt.endsAt));
  const top = Math.max(0, ((startMin - DAY_START_MIN) / 30) * SLOT_HEIGHT);
  const rawHeight = ((endMin - startMin) / 30) * SLOT_HEIGHT;
  const height = Math.max(SLOT_HEIGHT - 4, Math.min(rawHeight, totalHeight - top) - 2);
  const cancelled = appt.status === "cancelled";
  const widthPct = 100 / place.cols;

  // W9-05: the therapist name is required on EVERY card (item 7), so it is never
  // height-gated - a 30-min card shows time / patient / therapist as three dense
  // lines (the Fisiozero-compact look item 8 asks for), with the patient name
  // the middle priority and overflow-hidden clipping the rest gracefully. The
  // SERVICE line is the droppable one: the body tint + the title already carry
  // the service, so it shows only on taller cards.
  const showTherapist = !!appt.practitionerName;
  const showService = appt.serviceName && rawHeight >= 96;

  const accent = cancelled ? null : serviceAccent(appt.serviceName);
  const tint = cancelled
    ? "bg-surface-muted border-v2-border"
    : accent
      ? SERVICE_TINT[accent]
      : "bg-v2-surface border-v2-border";

  // W9-05 (item 7): deterministic per-therapist colour. Colour is REINFORCEMENT
  // (the spine + the dot); the therapist NAME below is the authoritative,
  // always-AA identifier. Reused -700 tokens, so no canonical hex drifts.
  const tColor = therapistColor(appt.practitionerId);

  // W9-06 (item 9): the marcacao note, surfaced on hover so staff need not open
  // the marcacao to read the historico. Staff-only surface (the portal never
  // receives notes - item 6 guard). The card is overflow-hidden, so the popover
  // is a SIBLING of the button inside a positioned `group` wrapper, letting it
  // escape the clip; it shows on group-hover AND group-focus-within (keyboard).
  const noteText = appt.notes?.trim() || null;

  return (
    <div
      className="group absolute hover:z-20"
      style={{
        top,
        height,
        left: `calc(${place.col * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
    <button
      type="button"
      onClick={onClick}
      title={appt.practitionerName ? `${appt.patientName} · ${appt.practitionerName}` : appt.patientName}
      // §2.1 tinted-glass card by service category (body). rounded-lg (12px)
      // keeps small blocks legible - the v2 radius scale only defines 24/28px
      // for large containers. The per-therapist colour is a spine drawn below.
      className={`hover-lift motion-safe:active:scale-[0.97] absolute inset-0 overflow-hidden rounded-lg border p-2 pl-3 text-left text-v2-text-primary shadow-v2-float ${tint} ${
        conflicting ? "ring-2 ring-warning" : ""
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1`}
    >
      {/* W9-05 (item 7): per-therapist colour SPINE on the left edge. A
          positioned background bar, not a border-left colour, so it never fights
          the service-tint border shorthand for precedence. Decorative (the
          therapist NAME carries the identity as text), so aria-hidden. */}
      <span className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${tColor.fill}`} aria-hidden="true" />
      {conflicting && (
        // The warning is carried by the ring (ring-warning); the label text uses
        // v2-text-primary so it clears AA on every service tint (warning-700 is
        // sub-AA on the 100 tints — SPEC §3.4).
        <span className="block text-xs font-semibold uppercase text-v2-text-primary">{s["agenda.conflict"]}</span>
      )}
      {/* W10-05: card face INVERTED - the PATIENT NAME is the first + largest
          element (was the 2nd/3rd line). Therapist stays the spine + dot; the
          service tint stays on the body; strikethrough-cancelled is unchanged. */}
      <span
        data-testid="agenda-card-patient"
        className={`flex items-center gap-1 truncate text-sm font-semibold ${cancelled ? "text-v2-text-secondary line-through" : "text-v2-text-primary"}`}
      >
        <User size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
        {(appt.recurrenceRule || appt.recurrenceParentId) && (
          <>
            <Repeat size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
            <span className="sr-only">{s["appointment.recurring"]}</span>
          </>
        )}
        <span className="truncate">{appt.patientName}</span>
        {/* Secondary participants (W4-19) — compact +1 badge; the secondary
            names sit in the title for hover/details. Rendered under the PRIMARY
            therapist column only (dual-column is a deferred follow-up). */}
        {(appt.patientTwoId || appt.practitionerTwoId) && (
          <span
            className="ml-1 shrink-0 rounded-full bg-surface-muted px-1.5 text-[10px] font-semibold text-v2-text-secondary"
            title={[appt.patientTwoName, appt.practitionerTwoName].filter(Boolean).join(" · ")}
          >
            {s["appointment.plusOne"]}
          </span>
        )}
      </span>
      <span className="flex items-center justify-between gap-1 text-xs text-v2-text-primary">
        <span className="truncate">
          {formatTimeOfDay(new Date(appt.startsAt))}-{formatTimeOfDay(new Date(appt.endsAt))}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {/* W9-06 (item 9): a note-presence icon signals a note exists even
              before hover (never hover-only); the content is in the popover. */}
          {noteText && (
            <StickyNote
              size={12}
              strokeWidth={1.75}
              aria-label={s["appointment.hasNoteLabel"]}
              className="text-v2-text-secondary"
            />
          )}
          {/* Confirmation axis (0024) - orthogonal to `status`. W9-05 (item 5,
              owner ruling 2026-07-17): a CANCELLED appointment SUPPRESSES the
              confirmation tick, so a cancelled-and-previously-confirmed card can
              never render a check + a strikethrough as one combined glyph (the
              reader read that as "strikethrough on a confirmation"). Strikethrough
              stays bound to cancelled (below); the axes are untouched in data. */}
          {!cancelled && <ConfirmationIndicator state={appt.confirmationState} />}
        </span>
      </span>
      {/* W9-05 (item 7): therapist identity on every card. The dot carries the
          per-therapist colour (reinforcement); the NAME is the authoritative
          text identifier, in AA-safe secondary ink regardless of the hue. */}
      {showTherapist && (
        <span
          data-testid="agenda-card-therapist"
          className="flex items-center gap-1 truncate text-xs text-v2-text-secondary"
        >
          <span className={`size-2 shrink-0 rounded-full ${tColor.fill}`} aria-hidden="true" />
          <span className="truncate">{appt.practitionerName}</span>
        </span>
      )}
      {showService && <span className="block truncate text-xs text-v2-text-primary">{appt.serviceName}</span>}
      {/* No-note indicator (W2-04): completed visit with no per-visit note yet. */}
      {appt.status === "completed" && !appt.hasNote && (
        <span className="mt-0.5 inline-block rounded bg-warning-bg px-1 text-[10px] font-semibold text-warning-700">
          {s["appointment.noNote"]}
        </span>
      )}
    </button>
    {/* W10-05: the shared unified hover popup (mini-dashboard), replacing the
        W9-06 note-only popover. Sibling of the button so it escapes the card's
        overflow-hidden; shown on card hover OR keyboard focus (group-focus-within)
        on EVERY card. Non-interactive; the SAME AppointmentHoverPanel renders on
        the Marcacoes row. */}
    <div
      role="tooltip"
      data-testid="agenda-card-hover"
      className="pointer-events-none absolute left-1 top-full z-50 mt-1 hidden rounded-v2 border border-v2-border bg-v2-surface p-2 shadow-v2-float group-hover:block group-focus-within:block"
    >
      <AppointmentHoverPanel appt={appt} />
    </div>
    </div>
  );
}
