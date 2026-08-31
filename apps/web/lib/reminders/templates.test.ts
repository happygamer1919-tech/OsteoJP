import { describe, expect, it } from "vitest";

import { INBOUND_KEYWORDS } from "./inbound-classify";
import {
  assertSmsCompliant,
  isGsm7,
  renderEmail,
  renderSms,
  renderConfirmationEmail,
  renderConfirmationSms,
  renderFollowUpEmail,
  renderFollowUpSms,
  renderNoShowEmail,
  renderNoShowSms,
  SMS_SEGMENT_LIMIT,
  type ReminderContext,
  type FollowUpContext,
  type NoShowContext,
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
    // WF-02 (2026-08-05): "confirmar" was added to THIS line and only this line.
    // The link is signed confirm_cancel and the landing page renders a confirm
    // CTA, so confirming was built and never mentioned. The 24h bodies keep
    // "Para remarcar ou cancelar" - the 24h SMS is confirm-only by counsel's
    // matrix and carries no link at all.
    expect(body).toContain("Para confirmar, remarcar ou cancelar: https://osteojp.pt/r/abc123");
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
    // WF-02: the EN mirror moves with the PT body. The registry states the rule
    // explicitly - approving PT approves its EN counterpart, and JP approved on
    // that basis - so this is the same amendment, not a second one.
    expect(body).toContain("To confirm, reschedule or cancel: https://osteojp.pt/r/abc123");
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
  it("renders the PT 48h SMS verbatim, accent-free, multi-line", () => {
    const msg = renderSms("48h", "pt", ctx);
    expect(msg).toBe(
      [
        "OsteoJP - Lembrete",
        "Consulta: 23/05 as 14:30",
        "Local: Linda-a-Velha",
        "Remarcar: +351 210 000 000",
      ].join("\n"),
    );
  });

  it("renders the EN 48h SMS verbatim, multi-line", () => {
    const msg = renderSms("48h", "en", ctx);
    expect(msg).toBe(
      [
        "OsteoJP - Reminder",
        "Appointment: 23/05 at 14:30",
        "Location: Linda-a-Velha",
        "Reschedule: +351 210 000 000",
      ].join("\n"),
    );
  });

  /**
   * WF-18 B, JP 2026-09-01: the 24h SMS gained a FIFTH line telling the patient
   * they may reply. The first four are byte-identical to what JP approved on
   * 2026-08-03 and are still asserted verbatim here — an amendment that also
   * quietly reworded the body would pass a "contains the new line" check.
   */
  it("renders the PT 24h SMS with the 'amanha' framing (no tilde), plus the reply line", () => {
    const msg = renderSms("24h", "pt", ctx);
    expect(msg).toBe(
      [
        "OsteoJP - Lembrete",
        "Consulta: amanha 23/05 as 14:30",
        "Local: Linda-a-Velha",
        "Remarcar: +351 210 000 000",
        "Responda SIM para confirmar ou NAO para cancelar",
      ].join("\n"),
    );
    expect(msg).not.toMatch(/amanhã/);
  });

  it("renders the EN 24h SMS, plus its reply line", () => {
    const msg = renderSms("24h", "en", ctx);
    expect(msg).toBe(
      [
        "OsteoJP - Reminder",
        "Appointment: tomorrow 23/05 at 14:30",
        "Location: Linda-a-Velha",
        "Reschedule: +351 210 000 000",
        "Reply SIM to confirm or NAO to cancel",
      ].join("\n"),
    );
  });

  /**
   * THE KEYWORDS IN THE COPY ARE THE CLASSIFIER'S OWN, not a second spelling of
   * them. `REMINDER_CONFIRM_INSTRUCTION` derives the words from
   * `INBOUND_KEYWORDS`, so a change to the keyword policy cannot leave the
   * reminder telling patients to send a word the platform no longer recognises.
   * Asserted on the RENDERED output, because a constant-only check would pass
   * even if the line never reached the body.
   */
  it("tells the patient to send words the classifier actually recognises", () => {
    const msg = renderSms("24h", "pt", ctx);
    expect(msg).toContain(INBOUND_KEYWORDS.confirm[0]!.toUpperCase());
    expect(msg).toContain(INBOUND_KEYWORDS.cancel[0]!.toUpperCase());
    // The EN body keeps the PT keywords, because the classifier only knows
    // the pt-PT set — reminder-copy.ts states that and this pins it.
    expect(renderSms("24h", "en", ctx)).toContain("SIM");
    expect(renderSms("24h", "en", ctx)).toContain("NAO");
  });

  it("lays the 48h body out as four scannable lines and the 24h as five", () => {
    for (const locale of ["pt", "en"] as const) {
      expect(renderSms("48h", locale, ctx).split("\n")).toHaveLength(4);
      // The fifth line is the reply instruction. Only the 24h offset carries
      // it: 24h is the SMS offset and therefore the only one a patient can
      // answer (the 48h reminder routes to email).
      expect(renderSms("24h", locale, ctx).split("\n")).toHaveLength(5);
    }
  });

  it("the 48h SMS body is UNTOUCHED — the amendment reached one body only", () => {
    expect(renderSms("48h", "pt", ctx)).not.toContain("Responda");
    expect(renderSms("48h", "en", ctx)).not.toContain("Reply SIM");
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

  it("stays single-segment GSM-7 for the longest prod clinic name (Castelo Branco)", () => {
    const longest: ReminderContext = { ...ctx, clinicLocation: "Castelo Branco" };
    for (const offset of ["48h", "24h"] as const) {
      for (const locale of ["pt", "en"] as const) {
        const msg = renderSms(offset, locale, longest);
        expect(msg).toContain("Castelo Branco");
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

/* ================================================================== */
/* Confirmation templates                                              */
/* ================================================================== */

describe("confirmation email", () => {
  it("PT subject contains date and time", () => {
    const { subject } = renderConfirmationEmail("pt", ctx);
    expect(subject).toBe("Marcação confirmada — 23 de maio de 2026, 14:30");
  });

  it("EN subject contains date and time", () => {
    const { subject } = renderConfirmationEmail("en", ctx);
    expect(subject).toBe("Appointment confirmed — 23 de maio de 2026, 14:30");
  });

  it("PT body contains patient name, clinic details, and reschedule link", () => {
    const { body } = renderConfirmationEmail("pt", ctx);
    expect(body).toContain("Olá Madalena,");
    expect(body).toContain("23 de maio de 2026 às 14:30");
    expect(body).toContain("Linda-a-Velha");
    expect(body).toContain("Dr. Joao Pereira");
    expect(body).toContain("https://osteojp.pt/r/abc123");
    expect(body).toContain("+351 210 000 000");
    expect(body.trimEnd().endsWith("— OsteoJP")).toBe(true);
  });

  it("EN body is structurally correct", () => {
    const { body } = renderConfirmationEmail("en", ctx);
    expect(body).toContain("Dear Madalena,");
    expect(body).toContain("23 de maio de 2026 at 14:30");
    expect(body).toContain("Linda-a-Velha");
    expect(body).toContain("To reschedule or cancel: https://osteojp.pt/r/abc123");
  });

  it("leaves no unfilled placeholders in either locale", () => {
    for (const locale of ["pt", "en"] as const) {
      const { subject, body } = renderConfirmationEmail(locale, ctx);
      expect(subject).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
      expect(body).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
    }
  });
});

describe("confirmation SMS", () => {
  it("PT SMS is accent-free, multi-line, and within one segment", () => {
    const msg = renderConfirmationSms("pt", ctx);
    expect(msg).toBe(
      [
        "OsteoJP - Marcacao confirmada",
        "Consulta: 23/05 as 14:30",
        "Local: Linda-a-Velha",
        "Remarcar: +351 210 000 000",
      ].join("\n"),
    );
    expect(isGsm7(msg)).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("EN SMS is multi-line and within one segment", () => {
    const msg = renderConfirmationSms("en", ctx);
    expect(msg).toBe(
      [
        "OsteoJP - Appointment confirmed",
        "Appointment: 23/05 at 14:30",
        "Location: Linda-a-Velha",
        "Reschedule: +351 210 000 000",
      ].join("\n"),
    );
    expect(isGsm7(msg)).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("stays single-segment for the longest prod clinic name (Castelo Branco)", () => {
    const longest: ReminderContext = { ...ctx, clinicLocation: "Castelo Branco" };
    for (const locale of ["pt", "en"] as const) {
      const msg = renderConfirmationSms(locale, longest);
      expect(msg).toContain("Castelo Branco");
      expect(isGsm7(msg)).toBe(true);
      expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    }
  });
});

/* ================================================================== */
/* Follow-up templates                                                 */
/* ================================================================== */

const followUpCtx: FollowUpContext = {
  patientFirstName: "Madalena",
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  clinicPhone: "+351 210 000 000",
};

describe("follow-up email", () => {
  it("PT subject references the visit date", () => {
    const { subject } = renderFollowUpEmail("pt", followUpCtx);
    expect(subject).toBe("Obrigado pela sua visita — 23 de maio de 2026");
  });

  it("EN subject references the visit date", () => {
    const { subject } = renderFollowUpEmail("en", followUpCtx);
    expect(subject).toBe("Thank you for your visit — 23 de maio de 2026");
  });

  it("PT body thanks patient and provides clinic phone", () => {
    const { body } = renderFollowUpEmail("pt", followUpCtx);
    expect(body).toContain("Olá Madalena,");
    expect(body).toContain("visita de 23 de maio de 2026");
    expect(body).toContain("+351 210 000 000");
    expect(body.trimEnd().endsWith("— OsteoJP")).toBe(true);
  });

  it("EN body thanks patient and provides clinic phone", () => {
    const { body } = renderFollowUpEmail("en", followUpCtx);
    expect(body).toContain("Dear Madalena,");
    expect(body).toContain("visit on 23 de maio de 2026");
    expect(body).toContain("+351 210 000 000");
  });

  it("leaves no unfilled placeholders in either locale", () => {
    for (const locale of ["pt", "en"] as const) {
      const { subject, body } = renderFollowUpEmail(locale, followUpCtx);
      expect(subject).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
      expect(body).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
    }
  });
});

describe("follow-up SMS", () => {
  it("PT SMS is accent-free, multi-line, and within one segment", () => {
    const msg = renderFollowUpSms("pt", followUpCtx);
    expect(msg).toBe(
      [
        "OsteoJP - Obrigado pela sua visita",
        "Visita: 23/05",
        "Marcar proxima consulta: +351 210 000 000",
      ].join("\n"),
    );
    expect(isGsm7(msg)).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("EN SMS is multi-line and within one segment", () => {
    const msg = renderFollowUpSms("en", followUpCtx);
    expect(msg).toBe(
      [
        "OsteoJP - Thank you for your visit",
        "Visit: 23/05",
        "Book next appointment: +351 210 000 000",
      ].join("\n"),
    );
    expect(isGsm7(msg)).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });
});

/* ================================================================== */
/* No-show templates                                                   */
/* ================================================================== */

const noShowCtx: NoShowContext = {
  patientFirstName: "Madalena",
  appointmentDateLong: "23 de maio de 2026",
  appointmentDateShort: "23/05",
  appointmentTime: "14:30",
  clinicPhone: "+351 210 000 000",
  rescheduleLink: "https://osteojp.pt/r/abc123",
};

describe("no-show email", () => {
  it("PT subject names the missed appointment date", () => {
    const { subject } = renderNoShowEmail("pt", noShowCtx);
    expect(subject).toBe("Sentimos a sua falta — consulta de 23 de maio de 2026");
  });

  it("EN subject names the missed appointment date", () => {
    const { subject } = renderNoShowEmail("en", noShowCtx);
    expect(subject).toBe("We missed you — appointment on 23 de maio de 2026");
  });

  it("PT body contains date, time, reschedule link and phone", () => {
    const { body } = renderNoShowEmail("pt", noShowCtx);
    expect(body).toContain("Olá Madalena,");
    expect(body).toContain("23 de maio de 2026 às 14:30");
    expect(body).toContain("https://osteojp.pt/r/abc123");
    expect(body).toContain("+351 210 000 000");
    expect(body.trimEnd().endsWith("— OsteoJP")).toBe(true);
  });

  it("EN body contains date, time, reschedule link and phone", () => {
    const { body } = renderNoShowEmail("en", noShowCtx);
    expect(body).toContain("Dear Madalena,");
    expect(body).toContain("23 de maio de 2026 at 14:30");
    expect(body).toContain("https://osteojp.pt/r/abc123");
    expect(body).toContain("+351 210 000 000");
  });

  it("leaves no unfilled placeholders in either locale", () => {
    for (const locale of ["pt", "en"] as const) {
      const { subject, body } = renderNoShowEmail(locale, noShowCtx);
      expect(subject).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
      expect(body).not.toMatch(/\{\{?[a-z_]+\}?\}/i);
    }
  });
});

describe("no-show SMS", () => {
  it("PT SMS is accent-free, multi-line, and within one segment", () => {
    const msg = renderNoShowSms("pt", noShowCtx);
    expect(msg).toBe(
      [
        "OsteoJP - Consulta nao realizada",
        "Consulta: 23/05 as 14:30",
        "Remarcar: +351 210 000 000",
      ].join("\n"),
    );
    expect(isGsm7(msg)).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("EN SMS is multi-line and within one segment", () => {
    const msg = renderNoShowSms("en", noShowCtx);
    expect(msg).toBe(
      [
        "OsteoJP - Missed appointment",
        "Appointment: 23/05 at 14:30",
        "Rebook: +351 210 000 000",
      ].join("\n"),
    );
    expect(isGsm7(msg)).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  });

  it("PT and EN SMS are GSM-7 compliant across both locales", () => {
    for (const locale of ["pt", "en"] as const) {
      const msg = renderNoShowSms(locale, noShowCtx);
      expect(isGsm7(msg)).toBe(true);
      expect(msg.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
    }
  });
});
