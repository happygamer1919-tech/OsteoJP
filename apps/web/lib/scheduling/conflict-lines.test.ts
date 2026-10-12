import { describe, expect, it } from "vitest";

import { conflictLines } from "./conflict-lines";
import type { ConflictInfo } from "./types";

/**
 * MARC-THERAPIST-01 - the lines of a conflict warning, the ones the agenda's
 * edit panel and the ficha's Terapeuta field both draw.
 *
 * Asserted as the words reception reads (pt-PT), not as key names. Times are
 * Lisbon in winter, so UTC and the clock on the wall agree. Names are invented.
 */

const at = (hhmm: string) => `2031-01-15T${hhmm}:00.000Z`;
const booking = (over: Partial<ConflictInfo>): ConflictInfo => ({
  kind: "therapist",
  id: "c-1",
  patientName: "Paciente Inventado",
  startsAt: at("15:00"),
  endsAt: at("15:45"),
  room: null,
  ...over,
});

describe("the lines of a conflict warning", () => {
  it("a therapist's booking in the way names the kind, the patient and the hour", () => {
    expect(conflictLines([booking({})])).toEqual([
      { kind: "therapist", heading: "Conflito de terapeuta", text: "Paciente Inventado: 15:00-15:45" },
    ]);
  });

  it("an ABSENCE names the kind and its reason, never a bare hour", () => {
    expect(
      conflictLines([booking({ kind: "time_off", patientName: null, reason: "vacation", startsAt: at("09:00"), endsAt: at("18:00") })]),
    ).toEqual([{ kind: "time_off", heading: "Ausência", text: "Férias: 09:00-18:00" }]);
  });

  it("an absence with a reason the list does not know reads as the generic one", () => {
    expect(conflictLines([booking({ kind: "time_off", patientName: null, reason: "something-new" })])[0]!.text).toBe(
      "Ausência: 15:00-15:45",
    );
  });

  it("a booking whose patient this viewer may not see still reads as a booking", () => {
    expect(conflictLines([booking({ patientName: null })])[0]!.text).toBe("Marcação reservada: 15:00-15:45");
  });

  it("a room conflict names the room beside the patient", () => {
    expect(conflictLines([booking({ kind: "room", room: "Sala 2" })])).toEqual([
      { kind: "room", heading: "Conflito de sala", text: "Paciente Inventado · Sala 2: 15:00-15:45" },
    ]);
  });

  it("outside working hours carries no name, only the hour asked for", () => {
    expect(conflictLines([booking({ kind: "availability", patientName: null })])).toEqual([
      { kind: "availability", heading: "Fora do horário", text: "15:00-15:45" },
    ]);
  });

  it("one line per kind, in the agenda's order, the items of a kind joined on one line", () => {
    const lines = conflictLines([
      booking({ kind: "time_off", id: "c-4", patientName: null, reason: "sick" }),
      booking({ kind: "room", id: "c-3", room: "Sala 1" }),
      booking({ id: "c-1" }),
      booking({ id: "c-2", patientName: "Outro Inventado", startsAt: at("15:30"), endsAt: at("16:15") }),
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["therapist", "room", "time_off"]);
    expect(lines[0]!.text).toBe("Paciente Inventado: 15:00-15:45; Outro Inventado: 15:30-16:15");
    expect(lines[2]!.text).toBe("Baixa médica: 15:00-15:45");
  });

  it("no conflicts, no lines", () => {
    expect(conflictLines([])).toEqual([]);
  });
});
