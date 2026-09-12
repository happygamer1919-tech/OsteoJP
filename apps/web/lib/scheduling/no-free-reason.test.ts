/**
 * SCHED-20 - WHY A DAY OFFERS NO SLOTS, AND WHY IT MATTERS THAT IT IS COMPUTED.
 *
 * ==========================================================================
 * THE 23 SEPTEMBER SHAPE IS THE FIRST TEST, VERBATIM
 * ==========================================================================
 * The panel printed "Sem horarios livres neste dia" under "Horario 09:00-20:00"
 * and "Ocupado 14:00-15:00". Eleven hours of working time, one booked, nothing
 * free. That sentence names BOOKING as the cause, and booking had taken one
 * hour of eleven - a five-day block had taken the rest, and the panel never
 * mentioned blocks.
 *
 * A test asserting only "the panel says something when free is empty" would
 * have passed throughout. The claim under test is which of three DIFFERENT
 * ACTIONS the reader is being sent to: set some hours, remove a block, or move
 * an appointment.
 */
import { describe, expect, it } from "vitest";
import { noFreeReason, type DayAvailability } from "./day-availability-core";

const iso = (h: string) => `2026-09-23T${h}:00.000Z`;

function day(over: Partial<DayAvailability> = {}): DayAvailability {
  return {
    date: "2026-09-23",
    working: [{ start: iso("08"), end: iso("19") }],
    booked: [],
    blocks: [],
    closures: [],
    free: [{ start: iso("08"), end: iso("19") }],
    sources: [],
    ...over,
  };
}

describe("SCHED-20 - noFreeReason", () => {
  it("is null while there is anything free - the panel shows chips, not a sentence", () => {
    expect(noFreeReason(day())).toBeNull();
  });

  it("says no_working_hours when the therapist does not work that day", () => {
    expect(noFreeReason(day({ working: [], free: [] }))).toBe("no_working_hours");
  });

  it("THE 23 SEPTEMBER SHAPE: eleven hours, one booked, a block over the rest -> blocked", () => {
    const d = day({
      booked: [
        { start: iso("14"), end: iso("15"), appointmentId: "a1", status: "scheduled" },
      ],
      blocks: [
        { start: iso("08"), end: iso("19"), blockId: "b1", reason: "vacation", note: "Atende em LV" },
      ],
      free: [],
    });
    expect(
      noFreeReason(d),
      'this is the day that printed "Sem horarios livres neste dia" for five days while a ' +
        "block held it - naming booking as the cause is the defect",
    ).toBe("blocked");
  });

  it("says booked when bookings really did consume the day", () => {
    const d = day({
      booked: [{ start: iso("08"), end: iso("19"), appointmentId: "a1", status: "scheduled" }],
      free: [],
    });
    expect(noFreeReason(d)).toBe("booked");
  });

  it("blocked WINS over booked when both are true", () => {
    // Removing the block is the action that frees anything; moving every
    // appointment off a blocked day frees nothing, so the block is named first.
    const d = day({
      booked: [{ start: iso("08"), end: iso("19"), appointmentId: "a1", status: "scheduled" }],
      blocks: [{ start: iso("08"), end: iso("19"), blockId: "b1", reason: "other", note: null }],
      free: [],
    });
    expect(noFreeReason(d)).toBe("blocked");
  });

  it("a block OUTSIDE working hours does not get the blame", () => {
    // The same class of wrong answer in the other direction: a 21:00 block on a
    // day ending at 19:00 has taken nothing, so bookings are the honest cause.
    const d = day({
      booked: [{ start: iso("08"), end: iso("19"), appointmentId: "a1", status: "scheduled" }],
      blocks: [{ start: iso("21"), end: iso("22"), blockId: "b1", reason: "other", note: null }],
      free: [],
    });
    expect(noFreeReason(d)).toBe("booked");
  });

  it("0085: a CLOSURE beats both blocked and booked - it is the only one nobody can act on", () => {
    // Removing a block frees nothing on a day the building is shut, and neither
    // does moving an appointment. The sentence has to send the reader to the
    // clinic's hours, not to the block list or the appointment list.
    const d = day({
      booked: [{ start: iso("08"), end: iso("19"), appointmentId: "a1", status: "scheduled" }],
      blocks: [{ start: iso("08"), end: iso("19"), blockId: "b1", reason: "other", note: null }],
      closures: [{ start: iso("13"), end: iso("14") }],
      free: [],
    });
    expect(noFreeReason(d)).toBe("closed");
  });

  it("0085: a closure OUTSIDE working hours does not get the blame either", () => {
    // Same guard as the block case, in the same direction: a closure the
    // working window never reaches has taken nothing.
    const d = day({
      working: [{ start: iso("08"), end: iso("12") }],
      booked: [{ start: iso("08"), end: iso("12"), appointmentId: "a1", status: "scheduled" }],
      closures: [{ start: iso("13"), end: iso("14") }],
      free: [],
    });
    expect(noFreeReason(d)).toBe("booked");
  });

  it("a block that merely TOUCHES the end of the day is not an overlap", () => {
    const d = day({
      booked: [{ start: iso("08"), end: iso("19"), appointmentId: "a1", status: "scheduled" }],
      blocks: [{ start: iso("19"), end: iso("20"), blockId: "b1", reason: "other", note: null }],
      free: [],
    });
    expect(noFreeReason(d)).toBe("booked");
  });
});
