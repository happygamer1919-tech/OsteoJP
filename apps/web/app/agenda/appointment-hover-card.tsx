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
 * surfaces render this inside their own hover/focus popover: the agenda card via
 * its `group` wrapper, the Marcacoes row via `AppointmentHoverCard` below.
 */
export function AppointmentHoverPanel({ appt }: { appt: AgendaAppointment }) {
  // W12-11 R10: derive the estado from the two axes. Falta strikes the name;
  // Cancelada is de-emphasised (secondary) but never struck. Terminal estados
  // (Concluída/Cancelada/Falta) suppress the separate confirmation indicator —
  // the estado marker already carries the state.
  const estado = deriveEstado(appt.status, appt.confirmationState);
  const struck = estadoStrikesName(estado);
  const terminal =
    estado === "concluida" || estado === "cancelada" || estado === "falta";
  const nameClass = struck
    ? "text-v2-text-secondary line-through"
    : estado === "cancelada"
      ? "text-v2-text-secondary"
      : "text-v2-text-primary";
  const tColor = therapistColor(appt.practitionerId);
  const note = appt.notes?.trim() || null;
  const dur = durationMinutes(appt.startsAt, appt.endsAt);

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

      {/* Estado (derived from the two axes) + confirmation, restated as TEXT
          (colour-not-only). The confirmation indicator shows only while the
          estado is non-terminal — it distinguishes Agendada from Confirmada. */}
      <span data-testid="hover-state" className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <EstadoMarker estado={estado} showLabel className="font-medium" />
        {!terminal && <ConfirmationIndicator state={appt.confirmationState} showLabel />}
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
 * Self-contained trigger + popover for the Marcacoes list row (replaces the
 * note-only `NoteHoverCard`). Its own `group/appt` scope so it works inside a
 * flex row without a positioned wrapper; the trigger is focusable so the panel
 * is reachable by keyboard (shows on hover AND focus-within). Renders on EVERY
 * row (the mini-dashboard always has content), unlike the old note-only hover.
 */
export function AppointmentHoverCard({ appt }: { appt: AgendaAppointment }) {
  return (
    <span className="group/appt relative inline-flex shrink-0">
      <Info
        size={14}
        strokeWidth={1.75}
        tabIndex={0}
        role="button"
        aria-label={s["appointment.detailsHoverLabel"]}
        className="cursor-help rounded-sm text-v2-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden rounded-v2 border border-v2-border bg-v2-surface p-2 shadow-v2-float group-hover/appt:block group-focus-within/appt:block"
      >
        <AppointmentHoverPanel appt={appt} />
      </span>
    </span>
  );
}
