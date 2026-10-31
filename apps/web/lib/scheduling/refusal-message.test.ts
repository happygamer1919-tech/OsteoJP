import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { s } from "@/lib/i18n";

import { appointmentRefusalMessage, isOverridableConflict } from "./refusal-message";

/**
 * MARC-THERAPIST-01 - one function words a refused appointment save for the
 * agenda's edit panel and for the ficha's "Gerir marcação".
 *
 * The sentences are asserted as the words reception reads (pt-PT), not as key
 * names, so a key pointed at the wrong sentence fails here.
 */

describe("the sentence for each refusal", () => {
  it("OUTSIDE WORKING HOURS names the therapist's hours that day, every period of a split shift", () => {
    expect(
      appointmentRefusalMessage({
        error: "outside_availability",
        availabilityWindows: [
          { startTime: "09:00", endTime: "13:00" },
          { startTime: "15:00", endTime: "19:00" },
        ],
      }),
    ).toBe(
      "Fora do horário do terapeuta nesse dia. Horário nesse dia: 09:00-13:00, 15:00-19:00. " +
        "Para marcar fora deste horário, altere primeiro a disponibilidade do terapeuta em Horários.",
    );
  });

  it("a weekday with NO hours is its own sentence, not an empty list", () => {
    const none =
      "Fora do horário do terapeuta nesse dia. Este terapeuta não tem horário definido nesse dia de semana. " +
      "Para marcar fora deste horário, altere primeiro a disponibilidade do terapeuta em Horários.";
    expect(appointmentRefusalMessage({ error: "outside_availability", availabilityWindows: [] })).toBe(none);
    expect(appointmentRefusalMessage({ error: "outside_availability" })).toBe(none);
  });

  it("the clinic's closure and the clinic's hours come from their own helpers, payload included", () => {
    const closed = appointmentRefusalMessage({
      error: "clinic_closed",
      clinicClosure: { locationName: "Clinica Teste", from: "13:00", to: "14:00" },
    });
    expect(closed).toContain("Clinica Teste");
    expect(closed).toContain("13:00");
    expect(closed).toContain("14:00");
    const late = appointmentRefusalMessage({
      error: "outside_clinic_hours",
      clinicWindow: {
        reason: "after_latest_start",
        locationName: "Clinica Teste",
        opensAt: "08:00",
        closesAt: "21:00",
        latestStart: "20:00",
      },
    });
    expect(late).toContain("20:00");
  });

  it.each([
    ["forbidden", "errors.forbidden"],
    ["illegal_transition", "appointment.illegalTransition"],
    ["double_booked", "appointment.doubleBooked"],
    ["location_not_assigned", "appointment.locationNotAssigned"],
    ["shared_resource_location", "appointment.sharedResourceLocation"],
    ["uncancel_shared_resource", "appointment.uncancelSharedResource"],
    ["therapist_change_reception_only", "appointment.therapistChangeReceptionOnly"],
    ["pack_insufficient", "appointment.packInsufficient"],
    ["pack_service_locked", "appointment.packServiceLocked"],
    ["validation", "appointment.requiredFields"],
    ["unauthenticated", "errors.unauthenticated"],
  ] as const)("%s reads %s", (error, key) => {
    expect(s[key]).toBeTruthy();
    expect(appointmentRefusalMessage({ error })).toBe(s[key]);
  });

  it("each of those codes has a sentence of its own: none is the generic one, no two are the same", () => {
    const codes = [
      "forbidden",
      "illegal_transition",
      "double_booked",
      "location_not_assigned",
      "shared_resource_location",
      "uncancel_shared_resource",
      "therapist_change_reception_only",
      "pack_insufficient",
      "pack_service_locked",
      "validation",
      "unauthenticated",
      "outside_availability",
      "clinic_closed",
      "outside_clinic_hours",
    ];
    const sentences = codes.map((error) => appointmentRefusalMessage({ error }));
    expect(new Set(sentences).size).toBe(codes.length);
    expect(sentences).not.toContain(s["errors.generic"]);
  });

  it("APPT-EDIT-02: a therapist's change of Terapeuta names who can make it", () => {
    expect(appointmentRefusalMessage({ error: "therapist_change_reception_only" })).toBe(
      "Só a receção pode mudar o terapeuta de uma marcação.",
    );
  });

  it("an unknown code, a missing code and a server error read as the generic sentence", () => {
    for (const error of ["error", "not_found", "something_new", undefined]) {
      expect(appointmentRefusalMessage({ error })).toBe("Ocorreu um erro. Tente novamente.");
    }
  });
});

describe("the conflict is a list, except the one the server will not override", () => {
  it("an ordinary conflict is overridable: the screen draws its list", () => {
    expect(isOverridableConflict({ error: "conflict" })).toBe(true);
  });

  it("SCHED-30's conflict is not: it is a sentence, and never the list", () => {
    const r = { error: "conflict", conflictOverridable: false } as const;
    expect(isOverridableConflict(r)).toBe(false);
    expect(appointmentRefusalMessage(r)).toBe(s["appointment.uncancelSlotTaken"]);
  });

  it("no other code is ever a conflict list", () => {
    for (const error of ["double_booked", "outside_availability", "clinic_closed", "outside_clinic_hours", "error"]) {
      expect(isOverridableConflict({ error }), error).toBe(false);
    }
  });
});

describe("both screens read their refusals from this function", () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const read = (...rel: string[]) => strip(readFileSync(join(__dirname, "..", "..", ...rel), "utf8"));

  it("the agenda's edit panel", () => {
    const src = read("app", "agenda", "appointment-drawer.tsx");
    expect(src).toContain("else setError(appointmentRefusalMessage(r));");
    // No second copy of a sentence was left behind in the drawer.
    expect(src).not.toContain('s["appointment.outsideAvailability"]');
    expect(src).not.toContain('s["appointment.doubleBooked"]');
    expect(src).not.toContain("clinicClosedMessage(");
  });

  it("the ficha's Terapeuta field, which draws the conflict list and offers no override", () => {
    const src = read("app", "patients", "[id]", "appointments-list.tsx");
    const field = src.slice(src.indexOf("function TherapistInline("), src.indexOf("function EstadoInline("));
    expect(field.length).toBeGreaterThan(200);
    expect(field).toContain("setError(appointmentRefusalMessage(r));");
    expect(field).toContain("if (isOverridableConflict(r)) {");
    expect(field).toContain("rescheduleAppointment(appt.id, therapistChangeInput(appt, next))");
    expect(field).not.toContain("saveAnyway");
    expect(field).not.toContain("allowConflict");
  });
});
