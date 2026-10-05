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
  practitionerName: "Dr. Teste Ficticio",
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
        "Terapeuta: Dr. Teste Ficticio",
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

/* ==================================================================== */
/* THE SMS. Strategy copy, dispatch S-1004-A (2026-10-04).               */
/* ==================================================================== */

import { formatDateShort, formatTime } from "./locale";
import {
  BOOKING_APPROVED_SMS,
  SMS_SEGMENT_LIMIT,
  isGsm7,
  renderBookingApprovedSms,
  smsCompliance,
} from "./templates";

/** The dispatch's text, as given. */
const PT_SMS = "OsteoJP: marcacao confirmada para {data} as {hora} em {local}. Duvidas: {telefone}.";

describe("the pt-PT SMS is strategy's copy, character for character", () => {
  it("body", () => {
    expect(BOOKING_APPROVED_SMS.pt).toBe(PT_SMS);
  });

  it("carries no accent: it is GSM-7 before a single value is filled in", () => {
    expect(isGsm7(PT_SMS.replace(/[{}]/g, ""))).toBe(true);
    expect(isGsm7(BOOKING_APPROVED_SMS.en.replace(/[{}]/g, ""))).toBe(true);
  });

  it("the English mirrors it: the same four placeholders, in the same order", () => {
    const tokens = (text: string) => text.match(/\{[a-z_]+\}/g) ?? [];
    expect(tokens(BOOKING_APPROVED_SMS.en)).toEqual(tokens(PT_SMS));
    expect(tokens(PT_SMS)).toEqual(["{data}", "{hora}", "{local}", "{telefone}"]);
    expect(BOOKING_APPROVED_SMS.en).toContain("appointment confirmed");
    expect(BOOKING_APPROVED_SMS.en).not.toContain("marcacao");
  });
});

describe("the SMS, rendered", () => {
  const ctx = {
    appointmentDateShort: "10/09",
    appointmentTime: "14:30",
    locationName: "OsteoJP (CB)",
    locationPhone: "+351 272 000 000",
  };

  it("pt: exactly the copy with the values in place", () => {
    expect(renderBookingApprovedSms("pt", ctx)).toBe(
      "OsteoJP: marcacao confirmada para 10/09 as 14:30 em OsteoJP (CB). Duvidas: +351 272 000 000.",
    );
  });

  it("en: no unfilled placeholder", () => {
    const en = renderBookingApprovedSms("en", ctx);
    expect(en).toBe(
      "OsteoJP: appointment confirmed for 10/09 at 14:30 at OsteoJP (CB). Questions: +351 272 000 000.",
    );
    expect(en).not.toMatch(/[{}]/);
  });

  it("a location name with an accent REFUSES the render: it would leave GSM-7", () => {
    expect(() => renderBookingApprovedSms("pt", { ...ctx, locationName: "Clínica do Coração" })).toThrow(
      /non-GSM-7/,
    );
  });

  it("a location name long enough to need a second segment REFUSES the render", () => {
    expect(() =>
      renderBookingApprovedSms("pt", { ...ctx, locationName: "Clinica ".repeat(20).trim() }),
    ).toThrow(/exceeds 160-char single segment/);
  });
});

/**
 * GATE G2 (S-1004-A). ONE SEGMENT AT THE LONGEST INPUTS.
 *
 * The date and the time are produced by the renderer's own formatters, so the
 * longest they can be is found by running them, not by assuming "dd/mm" and
 * "HH:mm": every day of a leap year, and every minute of a day across both
 * Lisbon offsets. The location names are the clinic's three plus the longest
 * place name it uses; the phone is a full international mobile.
 */
describe("GATE G2: the SMS is one GSM-7 segment at the longest inputs", () => {
  const LOCATIONS = ["OsteoJP (CB)", "OsteoJP (LV)", "OsteoJP (MN)", "Montemor-o-Novo"];
  const PHONE = "+351 912 345 678";

  /** The longest strings the two formatters can produce, and how many shapes they have. */
  function longestDateAndTime() {
    let date = "";
    let time = "";
    const dateLengths = new Set<number>();
    const timeLengths = new Set<number>();
    // 2028 is a leap year: every calendar day, at noon UTC.
    for (let d = Date.UTC(2028, 0, 1, 12); d < Date.UTC(2029, 0, 1, 12); d += 86_400_000) {
      const s = formatDateShort(new Date(d));
      dateLengths.add(s.length);
      if (s.length > date.length) date = s;
    }
    // Every minute of a winter day and of a summer day (WET and WEST).
    for (const base of [Date.UTC(2028, 0, 15), Date.UTC(2028, 6, 15)]) {
      for (let m = 0; m < 24 * 60; m++) {
        for (const locale of ["pt", "en"] as const) {
          const s = formatTime(new Date(base + m * 60_000), locale);
          timeLengths.add(s.length);
          if (s.length > time.length) time = s;
        }
      }
    }
    return { date, time, dateLengths: [...dateLengths], timeLengths: [...timeLengths] };
  }

  it("the formatters have ONE shape each: dd/mm and HH:mm, five characters", () => {
    const { date, time, dateLengths, timeLengths } = longestDateAndTime();
    expect(dateLengths).toEqual([5]);
    expect(timeLengths).toEqual([5]);
    expect(date).toMatch(/^\d{2}\/\d{2}$/);
    expect(time).toMatch(/^\d{2}:\d{2}$/);
  });

  it.each(["pt", "en"] as const)("%s: every location fits, GSM-7, one segment", (locale) => {
    const { date, time } = longestDateAndTime();
    for (const locationName of LOCATIONS) {
      const body = renderBookingApprovedSms(locale, {
        appointmentDateShort: date,
        appointmentTime: time,
        locationName,
        locationPhone: PHONE,
      });
      expect(smsCompliance(body), locationName).toEqual({ ok: true });
      expect(body.length, locationName).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    }
  });

  it("the WORST CASE is 95 characters in pt (Montemor-o-Novo), 65 short of the limit", () => {
    const { date, time } = longestDateAndTime();
    const lengths = LOCATIONS.map((locationName) => ({
      locationName,
      pt: renderBookingApprovedSms("pt", {
        appointmentDateShort: date,
        appointmentTime: time,
        locationName,
        locationPhone: PHONE,
      }).length,
      en: renderBookingApprovedSms("en", {
        appointmentDateShort: date,
        appointmentTime: time,
        locationName,
        locationPhone: PHONE,
      }).length,
    }));
    // Printed, as the gate asks, so the number is in the run's own output.
    console.info(`[G2] booking_approved.sms worst-case lengths: ${JSON.stringify(lengths)}`);
    const worstPt = Math.max(...lengths.map((l) => l.pt));
    const worstEn = Math.max(...lengths.map((l) => l.en));
    expect(lengths.find((l) => l.pt === worstPt)!.locationName).toBe("Montemor-o-Novo");
    expect(worstPt).toBe(95);
    expect(SMS_SEGMENT_LIMIT - worstPt).toBe(65);
    expect(worstEn).toBe(98);
    // Every measured length, pinned: the gate's numbers are in the diff, not
    // only in a log line a test runner may hide.
    expect(lengths).toEqual([
      { locationName: "OsteoJP (CB)", pt: 92, en: 95 },
      { locationName: "OsteoJP (LV)", pt: 92, en: 95 },
      { locationName: "OsteoJP (MN)", pt: 92, en: 95 },
      { locationName: "Montemor-o-Novo", pt: 95, en: 98 },
    ]);
  });
});
