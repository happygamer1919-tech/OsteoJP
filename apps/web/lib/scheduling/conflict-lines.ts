// MARC-THERAPIST-01 - the lines of a conflict warning, as one pure function.
//
// They were drawn inside the agenda's edit panel. The ficha's "Gerir marcação"
// now receives the same conflict list from the same action when its Terapeuta
// field is refused, and the acceptance check says it reads as on the agenda, so
// both screens draw these lines (app/agenda/conflict-banner.tsx) and neither
// words a conflict of its own.
//
// One line per KIND, in the agenda's order, each "<heading>: <item>; <item>".
// An item is "<who or why>: <from>-<to>": the patient of the booking in the way
// (or the withheld placeholder, patient-label.ts), the room when there is one,
// and for an absence its reason.

import { s } from "@/lib/i18n";

import { conflictPatientLabel } from "./patient-label";
import { formatTimeOfDay } from "./time";
import type { ConflictInfo, ConflictKind } from "./types";

type StringKey = keyof typeof s;

const HEADING_KEY: Record<ConflictKind, StringKey> = {
  therapist: "agenda.conflictTherapist",
  room: "agenda.conflictRoom",
  availability: "agenda.conflictAvailability",
  time_off: "agenda.conflictTimeOff",
};

/** The order the agenda lists the kinds in. */
const KIND_ORDER: readonly ConflictKind[] = ["therapist", "room", "availability", "time_off"];

const TIME_OFF_REASON_KEY: Record<string, StringKey> = {
  vacation: "appointment.timeOffReasonVacation",
  sick: "appointment.timeOffReasonSick",
  holiday: "appointment.timeOffReasonHoliday",
  other: "appointment.timeOffReasonOther",
};

export type ConflictLine = { kind: ConflictKind; heading: string; text: string };

function conflictItem(c: ConflictInfo): string {
  const lead =
    conflictPatientLabel(c) ??
    (c.reason ? s[TIME_OFF_REASON_KEY[c.reason] ?? "appointment.timeOffReasonOther"] : null);
  const prefix = [lead, c.room].filter(Boolean).join(" · ");
  const time = `${formatTimeOfDay(new Date(c.startsAt))}-${formatTimeOfDay(new Date(c.endsAt))}`;
  return prefix ? `${prefix}: ${time}` : time;
}

export function conflictLines(conflicts: readonly ConflictInfo[]): ConflictLine[] {
  return KIND_ORDER.flatMap((kind) => {
    const items = conflicts.filter((c) => c.kind === kind);
    if (items.length === 0) return [];
    return [{ kind, heading: s[HEADING_KEY[kind]], text: items.map(conflictItem).join("; ") }];
  });
}
