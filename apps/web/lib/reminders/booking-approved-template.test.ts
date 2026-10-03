/**
 * booking-approved-template.test.ts - BOOK-CONFIRM, the copy.
 *
 * The pt-PT subject and body are FINAL, character for character (strategy
 * dispatch S-1003-B block 1, amended by the owner on 2026-10-03). They are
 * pinned here as the literal the dispatch gave, so an edit to the template that
 * moves a single character reddens this file. The English is written from the
 * Portuguese and is pinned to the same shape.
 *
 * Every name below is invented.
 */
import { describe, expect, it } from "vitest";

import {
  BOOKING_APPROVED_EMAIL,
  renderBookingApprovedEmail,
  type BookingApprovedContext,
} from "./templates";

const CTX: BookingApprovedContext = {
  patientFirstName: "Madalena",
  appointmentDateLong: "10 de setembro de 2026",
  appointmentTime: "14:30",
  serviceName: "Osteopatia",
  practitionerName: "Dr. Joao Pereira",
  locationName: "Castelo Branco",
  locationAddress: "Rua de Exemplo 1, 6000-000 Castelo Branco",
  locationPhone: "+351 272 000 000",
};

/** The dispatch's text, as given. Nine lines, single line breaks. */
const PT_SUBJECT = "Consulta confirmada: {{appointment_date}} às {{appointment_time}}";
const PT_BODY = [
  "Olá {{patient_first_name}},",
  "O seu pedido de marcação foi aprovado. A consulta está confirmada:",
  "Data: {{appointment_date}}",
  "Hora: {{appointment_time}}",
  "Serviço: {{service_name}}",
  "Terapeuta: {{practitioner_name}}",
  "Local: {{location_name}}, {{location_address}}",
  "Para alterar ou cancelar, contacte a clínica: {{location_phone}}",
  "OsteoJP",
].join("\n");

describe("the pt-PT copy is the dispatch's, character for character", () => {
  it("subject", () => {
    expect(BOOKING_APPROVED_EMAIL.pt.subject).toBe(PT_SUBJECT);
  });

  it("body", () => {
    expect(BOOKING_APPROVED_EMAIL.pt.body).toBe(PT_BODY);
  });
});

describe("the English mirrors the Portuguese", () => {
  it("has the same placeholders, in the same order, on the same number of lines", () => {
    const tokens = (text: string) => text.match(/\{\{[a-z_]+\}\}/g) ?? [];
    expect(tokens(BOOKING_APPROVED_EMAIL.en.subject)).toEqual(tokens(PT_SUBJECT));
    expect(tokens(BOOKING_APPROVED_EMAIL.en.body)).toEqual(tokens(PT_BODY));
    expect(BOOKING_APPROVED_EMAIL.en.body.split("\n")).toHaveLength(PT_BODY.split("\n").length);
  });

  it("is English, not a copy of the Portuguese", () => {
    expect(BOOKING_APPROVED_EMAIL.en.body).toContain("Your booking request has been approved.");
    expect(BOOKING_APPROVED_EMAIL.en.body).not.toContain("pedido");
  });
});

describe.each(["pt", "en"] as const)("rendered in %s", (locale) => {
  const rendered = renderBookingApprovedEmail(locale, CTX);

  it("leaves no unfilled placeholder in the subject or the body", () => {
    expect(rendered.subject).not.toMatch(/[{}]/);
    expect(rendered.body).not.toMatch(/[{}]/);
  });

  it("carries every fact: date, time, service, therapist, location, address, phone", () => {
    expect(rendered.subject).toContain(CTX.appointmentDateLong);
    expect(rendered.subject).toContain(CTX.appointmentTime);
    for (const value of Object.values(CTX)) expect(rendered.body).toContain(value);
  });

  it("puts the location's name and address on one line, and its phone on the contact line", () => {
    const lines = rendered.body.split("\n");
    expect(lines[6]).toContain(`${CTX.locationName}, ${CTX.locationAddress}`);
    expect(lines[7]!.endsWith(CTX.locationPhone)).toBe(true);
    expect(lines[8]).toBe("OsteoJP");
  });
});

describe("the rendered pt-PT message, whole", () => {
  it("is exactly the dispatch's text with the values in place", () => {
    const rendered = renderBookingApprovedEmail("pt", CTX);
    expect(rendered.subject).toBe("Consulta confirmada: 10 de setembro de 2026 às 14:30");
    expect(rendered.body).toBe(
      [
        "Olá Madalena,",
        "O seu pedido de marcação foi aprovado. A consulta está confirmada:",
        "Data: 10 de setembro de 2026",
        "Hora: 14:30",
        "Serviço: Osteopatia",
        "Terapeuta: Dr. Joao Pereira",
        "Local: Castelo Branco, Rua de Exemplo 1, 6000-000 Castelo Branco",
        "Para alterar ou cancelar, contacte a clínica: +351 272 000 000",
        "OsteoJP",
      ].join("\n"),
    );
  });
});

describe("a missing value fails the render instead of reaching a patient", () => {
  it("throws on a placeholder the context did not fill", () => {
    // A value that itself looks like a placeholder is the one way `fill` can
    // leave one behind; the guard is the same one every other email uses.
    expect(() =>
      renderBookingApprovedEmail("pt", { ...CTX, serviceName: "{{service_name}}" }),
    ).toThrow(/unfilled placeholder/);
  });
});
