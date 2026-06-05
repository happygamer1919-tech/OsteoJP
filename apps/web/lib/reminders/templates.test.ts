import { describe, expect, it } from "vitest";
import {
  assertSmsCompliant,
  isGsm7,
  renderEmail,
  renderSms,
  SMS_SEGMENT_LIMIT,
  type ReminderContext,
} from "./templates";

// A realistic worst-case-ish context: long-ish names + a clinic name with a
// hyphen, matching the OsteoJP locations (Linda-a-Velha).
const ctx: ReminderContext = {
  patientFirstName: "Madalena",
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  appointmentTime: "14:30",
  practitionerName: "Dr. Joao Pereira",
  clinicLocation: "Linda-a-Velha",
  clinicPhone: "+351 210 000 000",
  rescheduleLink: "https://osteojp.pt/r/abc123",
};

describe("email rendering", () => {
  it("renders the PT 48h reminder verbatim from the doc copy", () => {
    const { subject, body } = renderEmail("48h", "pt", ctx);
    expect(subject).toBe(
      "Lembrete: consulta em 48 horas — 23 de maio de 2026, 14:30",
    );
    expect(body).toContain("Olá Madalena,");
    expect(body).toContain(
      "Lembrete da sua consulta em 23 de maio de 2026 às 14:30, em Linda-a-Velha, com Dr. Joao Pereira.",
    );
    expect(body).toContain("Para remarcar ou cancelar: https://osteojp.pt/r/abc123");
    expect(body).toContain("Ou contacte: +351 210 000 000");
    expect(body.trimEnd().endsWith("— OsteoJP")).toBe(true);
  });

  it("renders the EN 48h reminder verbatim from the doc copy", () => {
    const { subject, body } = renderEmail("48h", "en", ctx);
    expect(subject).toBe(
      "Reminder: appointment in 48 hours — 23 de maio de 2026, 14:30",
    );
    expect(body).toContain("Dear Madalena,");
    expect(body).toContain(
      "Reminder of your appointment on 23 de maio de 2026 at 14:30, at our Linda-a-Velha clinic, with Dr. Joao Pereira.",
    );
    expect(body).toContain("To reschedule or cancel: https://osteojp.pt/r/abc123");
  });

  it("renders the PT 24h reminder with the arrive-early line", () => {
    const { subject, body } = renderEmail("24h", "pt", ctx);
    expect(subject).toBe("Lembrete: consulta amanhã — 14:30, Linda-a-Velha");
    expect(body).toContain("amanhã, 23 de maio de 2026, às 14:30");
    expect(body).toContain("Pedimos que chegue 10 minutos antes.");
  });

  it("renders the EN 24h reminder with the arrive-early line", () => {
    const { subject, body } = renderEmail("24h", "en", ctx);
    expect(subject).toBe("Reminder: appointment tomorrow — 14:30, Linda-a-Velha");
    expect(body).toContain("tomorrow, 23 de maio de 2026, at 14:30");
    expect(body).toContain("Please arrive 10 minutes early.");
  });

  it("leaves no unfilled placeholders in any email variant", () => {
    for (const offset of ["48h", "24h"] as const) {
      for (const locale of ["pt", "en"] as const) {
        const { subject, body } = renderEmail(offset, locale, ctx);
        expect(subject).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
        expect(body).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
      }
    }
  });
});

describe("sms rendering", () => {
  it("renders the PT 48h SMS verbatim, accent-free", () => {
    const msg = renderSms("48h", "pt", ctx);
    expect(msg).toBe(
      "OsteoJP: lembrete da sua consulta a 23/05 as 14:30 em Linda-a-Velha. Para remarcar ligue +351 210 000 000",
    );
  });

  it("renders the EN 48h SMS verbatim", () => {
    const msg = renderSms("48h", "en", ctx);
    expect(msg).toBe(
      "OsteoJP: reminder of your appointment on 23/05 at 14:30 in Linda-a-Velha. To reschedule call +351 210 000 000",
    );
  });

  it("renders the PT 24h SMS with the 'amanha' framing (no tilde)", () => {
    const msg = renderSms("24h", "pt", ctx);
    expect(msg).toContain("a sua consulta e amanha, 23/05, as 14:30 em Linda-a-Velha");
    expect(msg).not.toMatch(/amanhã/);
  });

  it("renders the EN 24h SMS", () => {
    const msg = renderSms("24h", "en", ctx);
    expect(msg).toContain("your appointment is tomorrow, 23/05, at 14:30 in Linda-a-Velha");
  });

  it("keeps every rendered SMS GSM-7 and within one segment", () => {
    for (const offset of ["48h", "24h"] as const) {
      for (const locale of ["pt", "en"] as const) {
        const msg = renderSms(offset, locale, ctx);
        expect(isGsm7(msg)).toBe(true);
        expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
      }
    }
  });
});

describe("sms compliance guard", () => {
  it("rejects accented characters (would force UCS-2)", () => {
    expect(() => assertSmsCompliant("marcação confirmada")).toThrow(/non-GSM-7/);
  });

  it("rejects messages over the single-segment limit", () => {
    expect(() => assertSmsCompliant("a".repeat(SMS_SEGMENT_LIMIT + 1))).toThrow(
      /exceeds/,
    );
  });

  it("accepts a plain GSM-7 message at the limit", () => {
    expect(() => assertSmsCompliant("a".repeat(SMS_SEGMENT_LIMIT))).not.toThrow();
  });

  it("throws if a render would leave a non-GSM-7 value in an SMS", () => {
    // 'ã'/'õ' are NOT in GSM-7 (unlike 'é'/'à'), so they force UCS-2 — exactly
    // the case the no-accents rule guards against. Must blow up, not ship.
    const accented: ReminderContext = { ...ctx, clinicLocation: "marcação" };
    expect(() => renderSms("48h", "pt", accented)).toThrow(/non-GSM-7/);
  });
});
