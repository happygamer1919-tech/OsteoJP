"use client";

import { s, locale } from "@/lib/i18n";
import { intervalsOverlap } from "@/lib/scheduling/overlap";
import {
  DAY_START_HOUR,
  daySlots,
  formatDayHeader,
  formatInstantTime,
  lisbonMinutesFromMidnight,
  lisbonParts,
  slotLabel,
  viewDates,
  type AgendaView,
} from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AppointmentStatusValue,
} from "@/lib/scheduling/types";

const SLOT_HEIGHT = 48; // px per 30-min slot
const DAY_START_MIN = DAY_START_HOUR * 60;

const STATUS_STYLE: Record<AppointmentStatusValue, string> = {
  scheduled: "border-[#45B9A7] bg-[#E6F4EE] text-[#1A2733]",
  confirmed: "border-[#2F8F6B] bg-[#E6F4EE] text-[#1A2733]",
  completed: "border-[#98B2C2] bg-[#F0F3F6] text-[#56697A]",
  cancelled: "border-[#C7D1DA] bg-[#F0F3F6] text-[#8A98A6] line-through opacity-70",
  no_show: "border-[#B47A14] bg-[#FBF1DD] text-[#1A2733]",
};

/** Same room (case-insensitive) at the same location — the room-conflict key. */
function sameRoom(a: AgendaAppointment, b: AgendaAppointment): boolean {
  const ra = a.room?.trim().toLowerCase();
  const rb = b.room?.trim().toLowerCase();
  return !!ra && !!rb && ra === rb && a.locationId === b.locationId;
}

/**
 * Ids of appointments that overlap another on the same day with either the
 * same therapist or the same room — the two conflict kinds enforced server-side.
 */
function conflictingIds(appts: AgendaAppointment[]): Set<string> {
  const flagged = new Set<string>();
  for (let i = 0; i < appts.length; i++) {
    for (let j = i + 1; j < appts.length; j++) {
      const a = appts[i];
      const b = appts[j];
      if (a.status === "cancelled" || b.status === "cancelled") continue;
      if (a.practitionerId !== b.practitionerId && !sameRoom(a, b)) continue;
      if (
        intervalsOverlap(
          new Date(a.startsAt),
          new Date(a.endsAt),
          new Date(b.startsAt),
          new Date(b.endsAt),
        )
      ) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }
  return flagged;
}

export function AgendaGrid({
  view,
  anchor,
  appointments,
  onSelectAppointment,
  onSelectSlot,
}: {
  view: AgendaView;
  anchor: string;
  appointments: AgendaAppointment[];
  onSelectAppointment: (appt: AgendaAppointment) => void;
  onSelectSlot: (date: string, time: string) => void;
}) {
  const dates = viewDates(view, anchor);
  const slots = daySlots();
  const totalHeight = slots.length * SLOT_HEIGHT;
  const conflicts = conflictingIds(appointments);

  // Bucket appointments by their Lisbon calendar date.
  const byDate = new Map<string, AgendaAppointment[]>();
  for (const a of appointments) {
    const d = lisbonParts(new Date(a.startsAt)).date;
    const list = byDate.get(d);
    if (list) list.push(a);
    else byDate.set(d, [a]);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#E2E8EE] bg-white">
      {/* Column headers */}
      <div
        className="grid border-b border-[#E2E8EE]"
        style={{ gridTemplateColumns: `64px repeat(${dates.length}, 1fr)` }}
      >
        <div className="border-r border-[#E2E8EE]" />
        {dates.map((d) => (
          <div
            key={d}
            className="border-r border-[#E2E8EE] px-2 py-2 text-center text-sm font-medium text-[#1A2733]"
          >
            {formatDayHeader(d, locale)}
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `64px repeat(${dates.length}, 1fr)` }}
      >
        {/* Time gutter */}
        <div className="border-r border-[#E2E8EE]" style={{ height: totalHeight }}>
          {slots.map((m) => (
            <div
              key={m}
              className="relative border-b border-[#F0F3F6] pr-2 text-right text-xs text-[#8A98A6]"
              style={{ height: SLOT_HEIGHT }}
            >
              <span className="absolute right-2 -top-1.5 bg-white px-0.5">
                {slotLabel(m)}
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {dates.map((d) => (
          <div
            key={d}
            className="relative border-r border-[#E2E8EE]"
            style={{ height: totalHeight }}
          >
            {/* Clickable empty slots */}
            {slots.map((m) => (
              <button
                key={m}
                type="button"
                aria-label={`${formatDayHeader(d, locale)} ${slotLabel(m)}`}
                onClick={() => onSelectSlot(d, slotLabel(m))}
                className="absolute inset-x-0 border-b border-[#F0F3F6] hover:bg-[#F0F3F6]"
                style={{ top: (m - DAY_START_MIN) / 30 * SLOT_HEIGHT, height: SLOT_HEIGHT }}
              />
            ))}

            {/* Appointments */}
            {(byDate.get(d) ?? []).map((a) => (
              <AppointmentBlock
                key={a.id}
                appt={a}
                conflicting={conflicts.has(a.id)}
                totalHeight={totalHeight}
                onClick={() => onSelectAppointment(a)}
              />
            ))}
          </div>
        ))}
      </div>

      {appointments.length === 0 && (
        <p className="border-t border-[#E2E8EE] px-4 py-6 text-center text-sm text-[#8A98A6]">
          {s["agenda.noAppointments"]}
        </p>
      )}
    </div>
  );
}

function AppointmentBlock({
  appt,
  conflicting,
  totalHeight,
  onClick,
}: {
  appt: AgendaAppointment;
  conflicting: boolean;
  totalHeight: number;
  onClick: () => void;
}) {
  const startMin = lisbonMinutesFromMidnight(new Date(appt.startsAt));
  const endMin = lisbonMinutesFromMidnight(new Date(appt.endsAt));
  const top = Math.max(0, ((startMin - DAY_START_MIN) / 30) * SLOT_HEIGHT);
  const rawHeight = ((endMin - startMin) / 30) * SLOT_HEIGHT;
  const height = Math.max(20, Math.min(rawHeight, totalHeight - top));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute inset-x-1 overflow-hidden rounded border px-1.5 py-1 text-left text-xs leading-tight ${STATUS_STYLE[appt.status]} ${
        conflicting ? "ring-2 ring-[#B23A3A]" : ""
      }`}
      style={{ top, height }}
    >
      {conflicting && (
        <span className="block font-semibold uppercase text-[#B23A3A]">
          {s["agenda.conflict"]}
        </span>
      )}
      <span className="block font-medium">
        {(appt.recurrenceRule || appt.recurrenceParentId) && (
          <span className="mr-0.5 text-[#8E2C7A]" title={s["appointment.recurring"]}>
            ⟳
          </span>
        )}
        {appt.patientName}
      </span>
      {appt.serviceName && <span className="block">{appt.serviceName}</span>}
      <span className="block text-[10px] opacity-80">
        {formatInstantTime(new Date(appt.startsAt), locale)}–
        {formatInstantTime(new Date(appt.endsAt), locale)}
      </span>
    </button>
  );
}
