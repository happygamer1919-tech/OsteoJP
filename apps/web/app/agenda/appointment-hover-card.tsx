"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Clock, Info, MapPin, Stethoscope, StickyNote, User } from "lucide-react";

import { s } from "@/lib/i18n";
import { deriveEstado, estadoStrikesName } from "@/lib/scheduling/estado";
import { formatTimeOfDay } from "@/lib/scheduling/time";
import { therapistColor } from "@/lib/scheduling/therapist-color";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { ConfirmationIndicator } from "./confirmation-indicator";
import { EstadoMarker } from "./estado-marker";

// W10-05: ONE shared unified hover popup (a mini-dashboard), mounted on BOTH the
// agenda card AND the Marcacoes list row, replacing the W9-06 note-only hover on
// both surfaces (owner ruling 2026-07-21). It reads ONLY existing
// AgendaAppointment fields (types.ts:28-68) - no new query, no migration, no axis
// change. It is a clearly STRUCTURED card (osteojp-design: AA, colour-not-only -
// every state is TEXT, colour only reinforces), explicitly better than
// Fisiozero's plain black tooltip. Staff-only (agenda + marcacoes); the portal
// never imports this.
//
// W12-33 (defect loop): the popup was rendered as an in-grid absolutely
// positioned sibling. The agenda grid root is `.glass-card` = overflow-hidden +
// backdrop-filter(blur) (packages/ui/theme.css), and each start-slot group is a
// `z-10` stacking context. A backdrop-filter ancestor is a containing block for
// fixed descendants AND a paint boundary, so NO z-index or position:fixed on an
// in-tree popup can escape it: the popup was clipped by the grid overflow and
// painted UNDER neighbouring name lines. The fix renders the popup through a
// PORTAL to document.body (escapes both the clip and the trapped stacking
// context) with viewport-edge-aware anchoring. See HoverPopover below.

function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));
}

// created_at is stored UTC; display in Europe/Lisbon (CLAUDE.md dates rule), the
// clinic locale (pt-PT), as a compact date + time distinct from the appointment time.
function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(new Date(iso));
}

/**
 * The shared mini-dashboard PANEL (pure content, no trigger/positioning). Both
 * surfaces render this inside HoverPopover: the agenda card and the Marcacoes
 * row. Pure and server-renderable so it unit-tests without jsdom.
 */
export function AppointmentHoverPanel({ appt }: { appt: AgendaAppointment }) {
  // W12-11 R10 / W12-33: derive the estado from the two axes; it is the SINGLE
  // source of truth over `status` + `confirmationState`. Falta strikes the name;
  // Cancelada is de-emphasised (secondary) but never struck.
  const estado = deriveEstado(appt.status, appt.confirmationState);
  const struck = estadoStrikesName(estado);
  const nameClass = struck
    ? "text-v2-text-secondary line-through"
    : estado === "cancelada"
      ? "text-v2-text-secondary"
      : "text-v2-text-primary";
  const tColor = therapistColor(appt.practitionerId);
  const note = appt.notes?.trim() || null;
  const dur = durationMinutes(appt.startsAt, appt.endsAt);

  // W12-33 defect B (owner screenshot: "Confirmada" AND "Confirmação pendente"
  // shown together - contradictory axes on one card). The estado marker is
  // authoritative; the separate confirmation line only ADDS signal when it is
  // NON-REDUNDANT with the estado. That is true in exactly one case: estado ===
  // "agendada" (scheduled + pending), where "aguarda confirmação" tells the
  // reception the patient has not replied yet. For Confirmada (incl. a
  // staff-confirmed appointment whose patient axis is still pending) and every
  // terminal estado (Concluída / Cancelada / Falta) the estado marker already
  // carries the state, so the confirmation line is suppressed - it would either
  // restate or CONTRADICT the estado. No data or derivation change: only what
  // this panel renders. (estado === "agendada" already implies pending per
  // deriveEstado; the explicit confirmation check documents the invariant.)
  const showConfirmationLine =
    estado === "agendada" && appt.confirmationState === "pending";

  return (
    <div
      data-testid="appointment-hover-panel"
      className="flex w-64 max-w-[16rem] flex-col gap-1.5 text-xs text-v2-text-primary"
    >
      {/* Patient name — first + largest element of the panel. */}
      <span
        data-testid="hover-patient"
        className={`flex items-center gap-1 text-sm font-semibold ${nameClass}`}
      >
        <User size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
        <span className="truncate">{appt.patientName}</span>
      </span>

      {/* Time + duration. */}
      <span className="flex items-center gap-1 text-v2-text-secondary">
        <Clock size={13} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        <span>
          {formatTimeOfDay(new Date(appt.startsAt))}-{formatTimeOfDay(new Date(appt.endsAt))} · {dur}{" "}
          {s["appointment.minutesAbbrev"]}
        </span>
      </span>

      {/* Service. */}
      {appt.serviceName && (
        <span className="flex items-center gap-1">
          <Stethoscope size={13} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
          <span className="truncate">{appt.serviceName}</span>
        </span>
      )}

      {/* Therapist — the per-therapist colour dot reinforces; the NAME is authoritative. */}
      <span className="flex items-center gap-1 text-v2-text-secondary">
        <span className={`size-2 shrink-0 rounded-full ${tColor.fill}`} aria-hidden="true" />
        <span className="truncate">{appt.practitionerName}</span>
      </span>

      {/* Location. */}
      <span className="flex items-center gap-1 text-v2-text-secondary">
        <MapPin size={13} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{appt.locationName}</span>
      </span>

      {/* Estado (derived, single source of truth) restated as TEXT
          (colour-not-only). The confirmation line is shown ONLY when it is
          non-redundant with the estado (Agendada + pending); never alongside
          Confirmada or a terminal estado (W12-33 defect B). */}
      <span data-testid="hover-state" className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <EstadoMarker estado={estado} showLabel className="font-medium" />
        {showConfirmationLine && (
          <ConfirmationIndicator state={appt.confirmationState} showLabel />
        )}
      </span>

      {/* Note preview — only when a note exists. */}
      {note && (
        <span
          data-testid="hover-note"
          className="mt-0.5 flex flex-col gap-0.5 border-t border-v2-border pt-1"
        >
          <span className="flex items-center gap-1 font-medium text-v2-text-secondary">
            <StickyNote size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            {s["appointment.noteHoverLabel"]}
          </span>
          <span className="whitespace-pre-line">{note}</span>
        </span>
      )}

      {/* Provenance: created-by + created-at. NULL createdBy = portal booking. */}
      <span
        data-testid="hover-created"
        className="mt-0.5 border-t border-v2-border pt-1 text-v2-text-secondary"
      >
        {s["appointment.createdBy"]}: {appt.createdByName ?? s["appointment.createdByPortal"]}
        {" · "}
        {s["appointment.createdAt"]} {formatCreatedAt(appt.createdAt)}
      </span>
    </div>
  );
}

/**
 * W12-33 — the popup container's own classes: a SOLID (opaque) surface
 * (`bg-v2-surface` = #FFFFFF; text tokens v2-text-primary/secondary both clear
 * WCAG AA on white per theme.css), `isolate` + a high `z-50` so it owns its
 * stacking context at the document.body portal level, above all agenda grid /
 * card / row content. Border + float shadow lift it off the page. Shared by the
 * live (portaled) popup and the SSR fallback so a single assertion on the static
 * markup proves the shown popup's isolation/solid-bg.
 */
const POPOVER_PANEL_CLASS =
  "isolate z-50 w-max max-w-[calc(100vw-1rem)] rounded-v2 border border-v2-border bg-v2-surface p-2 shadow-v2-float";

const VIEWPORT_MARGIN = 8; // px kept between the popup and the viewport edge
const TRIGGER_GAP = 6; // px between the trigger and the popup

/**
 * HoverPopover — the shared trigger + PORTAL for the mini-dashboard (W12-33).
 *
 * The popup is rendered through a portal to document.body, so it escapes the
 * agenda grid's `.glass-card` overflow clip + backdrop-filter containing block
 * and the `z-10` start-slot stacking contexts that trapped the old in-tree
 * popup under neighbouring name lines. It is anchored to the hovered trigger and
 * FLIPPED / CLAMPED against the viewport edges (never overflows off-screen).
 *
 * `renderToStaticMarkup` forbids portals, so on the server (and before hydration)
 * the panel is rendered INLINE but hidden - same container classes, same
 * content, no portal call. That keeps the markup present for SSR + tests without
 * changing the client behaviour.
 */
export function HoverPopover({
  appt,
  containerTestId,
  className,
  children,
}: {
  appt: AgendaAppointment;
  /** data-testid for the popup container (agenda uses "agenda-card-hover"). */
  containerTestId?: string;
  /** Layout class for the inline trigger wrapper (e.g. "block w-full"). */
  className?: string;
  /** The trigger element (the hovered/focused name line or info icon). */
  children: ReactNode;
}) {
  // `open` is only ever set true by client pointer/focus events, so it is false
  // during SSR and hydration - the portal (which needs document.body) is never
  // reached on the server, and `renderToStaticMarkup` never sees a portal.
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLSpanElement | null>(null);

  // Anchor below the trigger, then flip/clamp so the popup never leaves the
  // viewport: flip left when it would overflow the right edge, flip above when it
  // would overflow the bottom, and clamp to the margins in every case. Position
  // is written straight to the DOM node (not React state) - the panel is a
  // portaled overlay we synchronise with layout, and this keeps the effect free
  // of setState (no cascading renders) and the inline coords out of React's
  // control so a re-render never resets them.
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const r = trigger.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = r.left;
    if (left + pw > vw - VIEWPORT_MARGIN) left = r.right - pw;
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, vw - pw - VIEWPORT_MARGIN));

    let top = r.bottom + TRIGGER_GAP;
    if (top + ph > vh - VIEWPORT_MARGIN) {
      const above = r.top - TRIGGER_GAP - ph;
      top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, vh - ph - VIEWPORT_MARGIN);
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = "visible"; // reveal only once positioned (no flash)
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    // capture-phase scroll so an ancestor scroll container also repositions.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  return (
    <span
      ref={triggerRef}
      className={className}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open
        ? createPortal(
            <span
              ref={panelRef}
              role="tooltip"
              data-testid={containerTestId}
              // `invisible` until reposition() reveals it, so it never flashes at
              // the top-left corner before it is measured and placed.
              className={`pointer-events-none invisible ${POPOVER_PANEL_CLASS}`}
              style={{ position: "fixed" }}
            >
              <AppointmentHoverPanel appt={appt} />
            </span>,
            document.body,
          )
        : // SSR, hydration, and the closed state: same container, hidden inline,
          // no portal - keeps the markup present for tests and accessibility.
          <span hidden role="tooltip" data-testid={containerTestId} className={POPOVER_PANEL_CLASS}>
            <AppointmentHoverPanel appt={appt} />
          </span>}
    </span>
  );
}

/**
 * Self-contained trigger + popover for the Marcacoes list row (replaces the
 * note-only `NoteHoverCard`). The focusable info icon is the trigger; the shared
 * HoverPopover shows the mini-dashboard on hover AND focus, portaled so it clears
 * the row. Renders on EVERY row (the mini-dashboard always has content).
 */
export function AppointmentHoverCard({ appt }: { appt: AgendaAppointment }) {
  return (
    <HoverPopover appt={appt} className="inline-flex shrink-0">
      <Info
        size={14}
        strokeWidth={1.75}
        tabIndex={0}
        role="button"
        aria-label={s["appointment.detailsHoverLabel"]}
        className="cursor-help rounded-sm text-v2-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />
    </HoverPopover>
  );
}
