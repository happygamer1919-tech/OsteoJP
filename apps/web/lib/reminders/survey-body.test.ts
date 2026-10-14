/**
 * survey-body.test.ts - SAT-01, the two messages of the satisfaction survey.
 *
 * THE COPY. The pt-PT texts are texts 1, 2 and 3 of
 * docs/design/SAT-01-copy-pt.md, pinned here as literals, so an edit to a
 * template that moves one character reddens this file. The English is the copy
 * file's own English section.
 *
 * THE MEASUREMENT. The SMS is one GSM-7 segment or it is not sent. Its length
 * is the fixed text, the date, "/s/", the code and the host, and only the host
 * is not this code's to bound: it comes from configuration. So the SMS is
 * measured here with the longest host that fits, and one character past it.
 * The copy file says 43 characters in pt and 47 in en. This file is where that
 * is a measurement.
 *
 * Every name, phone and host below is invented; the hosts are reserved
 * `.invalid` names.
 */
import { describe, expect, it } from "vitest";

import { CONFIRM_CODE_LENGTH, CONFIRM_LINK_BASE_VAR } from "./confirm-code";
import { formatDateLong, formatDateShort } from "./locale";
import { REMINDER_TEMPLATES } from "./notification-registry";
import {
  SURVEY_LINK_DAYS,
  renderSurveyEmailBody,
  renderSurveySmsBody,
  surveyLinks,
  surveyValidUntilDateLong,
} from "./survey-body";
import {
  SMS_SEGMENT_LIMIT,
  SURVEY_EMAIL,
  SURVEY_SMS,
  assembleSurveySms,
  isGsm7,
  renderSurveyEmail,
} from "./templates";

/** Eight characters of the code alphabet, with both of its punctuation marks. */
const CODE = "Ab3-Xy_9";
const DATE = "23/05";

/** A host of exactly `length` characters under the reserved `.invalid` name. */
function hostOf(length: number): string {
  const tld = ".invalid";
  return "a".repeat(length - tld.length) + tld;
}
const envFor = (host: string) => ({ [CONFIRM_LINK_BASE_VAR]: `https://${host}` });

const HOST = "app.clinica-teste.invalid";
const ENV = envFor(HOST);

/* ------------------------------------------------------------------ */
/* The copy                                                             */
/* ------------------------------------------------------------------ */

const PT_SUBJECT = "Avaliação da sua consulta de {{appointment_date}}";
const PT_BODY = [
  "Olá {{patient_first_name}},",
  "",
  "Pedimos a sua avaliação da consulta de {{appointment_date}}. A avaliação tem três perguntas e a resposta é facultativa.",
  "",
  "Responder: {{survey_link}}",
  "",
  "A ligação é pessoal, só pode ser usada uma vez e é válida até {{survey_expiry_date}}.",
  "",
  "Se não pretender receber estas avaliações, indique-o na mesma ligação ou contacte a clínica: {{clinic_phone}}",
  "",
  "OsteoJP",
].join("\n");
const PT_SMS = [
  "OsteoJP: avaliacao da consulta de {data}",
  "Responder: {ligacao}",
  "Para nao receber mais avaliacoes, use a mesma ligacao.",
].join("\n");

const EN_SUBJECT = "Satisfaction survey for your appointment on {{appointment_date}}";
const EN_BODY = [
  "Dear {{patient_first_name}},",
  "",
  "We would like your rating of your appointment on {{appointment_date}}. The survey has three questions and answering is optional.",
  "",
  "Answer: {{survey_link}}",
  "",
  "The link is personal, can be used only once and is valid until {{survey_expiry_date}}.",
  "",
  "If you do not wish to receive these surveys, say so using the same link or contact the clinic: {{clinic_phone}}",
  "",
  "OsteoJP",
].join("\n");
const EN_SMS = [
  "OsteoJP: survey about your appointment on {data}",
  "Answer: {ligacao}",
  "To stop receiving surveys, use the same link.",
].join("\n");

describe("the pt-PT copy is the copy file's, character for character", () => {
  it("text 1, the email subject", () => {
    expect(SURVEY_EMAIL.pt.subject).toBe(PT_SUBJECT);
  });

  it("text 2, the email body", () => {
    expect(SURVEY_EMAIL.pt.body).toBe(PT_BODY);
  });

  it("text 3, the SMS", () => {
    expect(SURVEY_SMS.pt).toBe(PT_SMS);
  });
});

describe("the English is the copy file's English section", () => {
  it("subject, body and SMS", () => {
    expect(SURVEY_EMAIL.en.subject).toBe(EN_SUBJECT);
    expect(SURVEY_EMAIL.en.body).toBe(EN_BODY);
    expect(SURVEY_SMS.en).toBe(EN_SMS);
  });

  it("has the same placeholders, in the same order, on the same number of lines", () => {
    const tokens = (text: string) => text.match(/\{\{?[a-z_]+\}?\}/g) ?? [];
    expect(tokens(EN_SUBJECT)).toEqual(tokens(PT_SUBJECT));
    expect(tokens(EN_BODY)).toEqual(tokens(PT_BODY));
    expect(tokens(EN_SMS)).toEqual(tokens(PT_SMS));
    expect(EN_BODY.split("\n")).toHaveLength(PT_BODY.split("\n").length);
    expect(EN_SMS.split("\n")).toHaveLength(PT_SMS.split("\n").length);
  });
});

describe("no dash characters, and no accent in either SMS", () => {
  const DASHES = /[‒-―]/;

  it.each(["pt", "en"] as const)("%s", (locale) => {
    expect(SURVEY_EMAIL[locale].subject).not.toMatch(DASHES);
    expect(SURVEY_EMAIL[locale].body).not.toMatch(DASHES);
    expect(SURVEY_SMS[locale]).not.toMatch(DASHES);
    // ASCII only: the house rule for every SMS. One accent leaves GSM-7.
    expect(SURVEY_SMS[locale]).toMatch(/^[\x20-\x7e\n]+$/);
    expect(isGsm7(SURVEY_SMS[locale])).toBe(true);
  });
});

describe("the registry holds these two bodies, and not a copy of them", () => {
  it("survey.email and survey.sms carry the pt texts", () => {
    const byId = (id: string) => REMINDER_TEMPLATES.find((t) => t.id === id);
    expect(byId("survey.email")).toMatchObject({ channel: "email", body: SURVEY_EMAIL.pt.body });
    expect(byId("survey.sms")).toMatchObject({ channel: "sms", body: SURVEY_SMS.pt });
  });

  it("each is approved with a named approver and a date", () => {
    for (const id of ["survey.email", "survey.sms"]) {
      const entry = REMINDER_TEMPLATES.find((t) => t.id === id);
      expect(entry, id).toMatchObject({
        approved: true,
        approvedBy: "JP",
        approvedAt: "2026-10-02",
        audience: "patient",
      });
    }
  });
});

/* ------------------------------------------------------------------ */
/* The link                                                             */
/* ------------------------------------------------------------------ */

describe("the link: one origin, two forms", () => {
  it("the email carries the whole address, the SMS the bare host", () => {
    expect(surveyLinks(CODE, ENV)).toEqual({
      email: `https://${HOST}/s/${CODE}`,
      sms: `${HOST}/s/${CODE}`,
    });
  });

  it("a trailing slash on the origin does not double", () => {
    expect(surveyLinks(CODE, { [CONFIRM_LINK_BASE_VAR]: ` https://${HOST}// ` })).toEqual({
      email: `https://${HOST}/s/${CODE}`,
      sms: `${HOST}/s/${CODE}`,
    });
  });

  it.each([{}, { [CONFIRM_LINK_BASE_VAR]: "" }, { [CONFIRM_LINK_BASE_VAR]: "   " }])(
    "no origin configured (%j): no link, and no fallback host",
    (env) => {
      expect(surveyLinks(CODE, env)).toBeNull();
    },
  );
});

/* ------------------------------------------------------------------ */
/* The "valid until" date                                               */
/* ------------------------------------------------------------------ */

/** A UTC instant, written as its UTC wall clock. */
function utc(y: number, month: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, month - 1, d, h, min, 0));
}

const DAY_KEY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The same answer by another road, with no calendar arithmetic in it: walk
 * back from the instant the link dies, a quarter of an hour at a time, until
 * the Lisbon date changes. That instant is inside the day before.
 */
function dayBeforeByWalking(sentAt: Date): Date {
  const diesAt = sentAt.getTime() + SURVEY_LINK_DAYS * 24 * 60 * 60_000;
  const diesOn = DAY_KEY.format(diesAt);
  for (let back = 1; back <= 26 * 4; back += 1) {
    const at = diesAt - back * 15 * 60_000;
    if (DAY_KEY.format(at) !== diesOn) return new Date(at);
  }
  throw new Error("no earlier Lisbon day within 26 hours");
}

describe("the valid-until date: the day before the Lisbon day the link dies on (ruling of 2026-10-13)", () => {
  it("the copy file's worked example: sent 24 May, dies 7 June, prints 6 June", () => {
    const sent = utc(2026, 5, 24, 10, 0);
    expect(surveyValidUntilDateLong(sent, "pt")).toBe("6 de junho de 2026");
    expect(surveyValidUntilDateLong(sent, "en")).toBe("6 June 2026");
  });

  // Lisbon is UTC+1 in summer and UTC in winter, so each row names the UTC
  // instant and, beside it, what a clock in Lisbon shows.
  it.each([
    // Either side of Lisbon midnight, in summer: 23:59 and 00:01 Lisbon.
    ["summer, a minute before Lisbon midnight", utc(2026, 5, 24, 22, 59), "6 de junho de 2026"],
    ["summer, a minute after Lisbon midnight", utc(2026, 5, 24, 23, 1), "7 de junho de 2026"],
    // The same pair in winter, where Lisbon midnight is UTC midnight.
    ["winter, a minute before Lisbon midnight", utc(2027, 1, 10, 23, 59), "23 de janeiro de 2027"],
    ["winter, a minute after Lisbon midnight", utc(2027, 1, 11, 0, 1), "24 de janeiro de 2027"],
    // Across the end of summer time, Sunday 25 October 2026. Sent in summer
    // time, the link dies in winter time, an hour earlier on the Lisbon clock.
    ["sent 12/10 23:30 Lisbon, dies 26/10 22:30", utc(2026, 10, 12, 22, 30), "25 de outubro de 2026"],
    // Sent on the 13th in Lisbon, and it still dies on the 26th, at 23:30. A
    // count from the send's own Lisbon date would print the 26th here.
    ["sent 13/10 00:30 Lisbon, dies 26/10 23:30", utc(2026, 10, 12, 23, 30), "25 de outubro de 2026"],
    ["sent 13/10 01:30 Lisbon, dies 27/10 00:30", utc(2026, 10, 13, 0, 30), "26 de outubro de 2026"],
    // Dies on the night the clocks go back: 25/10 at 00:30 Lisbon, summer time.
    ["sent 11/10 00:30 Lisbon, dies 25/10 00:30", utc(2026, 10, 10, 23, 30), "24 de outubro de 2026"],
    // Across the start of summer time, Sunday 28 March 2027. Sent 14/03 at
    // 23:30 Lisbon, it dies 29/03 at 00:30. Taking 24 hours off prints the 27th.
    ["sent 14/03 23:30 Lisbon, dies 29/03 00:30", utc(2027, 3, 14, 23, 30), "28 de março de 2027"],
    // Across a month end, a leap day and a year end.
    ["dies 1 June", utc(2026, 5, 18, 12, 0), "31 de maio de 2026"],
    ["dies 1 March, 28 days in February", utc(2027, 2, 15, 12, 0), "28 de fevereiro de 2027"],
    ["dies 1 March, 29 days in February", utc(2028, 2, 16, 12, 0), "29 de fevereiro de 2028"],
    ["dies 1 January", utc(2026, 12, 18, 12, 0), "31 de dezembro de 2026"],
    // A month end and Lisbon midnight at once: 17/05 23:30 and 18/05 00:30 Lisbon.
    ["dies 31 May at 23:30 Lisbon", utc(2026, 5, 17, 22, 30), "30 de maio de 2026"],
    ["dies 1 June at 00:30 Lisbon", utc(2026, 5, 17, 23, 30), "31 de maio de 2026"],
  ])("%s", (_name, sent, printed) => {
    expect(surveyValidUntilDateLong(sent, "pt")).toBe(printed);
  });

  // One formatter for the whole sweep, with formatDateLong's own options: the
  // sweep asks for two dates per send, and building a formatter is the slow part.
  const LONG_PT = new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  });

  it("every hour of 2026 and 2027: the printed day is whole, and the next one is not", () => {
    const probe = utc(2026, 5, 23, 12, 0);
    expect(LONG_PT.format(probe)).toBe(formatDateLong(probe, "pt"));

    const first = Date.UTC(2026, 0, 1, 0, 30);
    const last = Date.UTC(2028, 0, 1, 0, 0);
    let checked = 0;
    for (let at = first; at < last; at += 60 * 60_000) {
      const sent = new Date(at);
      const want = LONG_PT.format(dayBeforeByWalking(sent));
      const got = surveyValidUntilDateLong(sent, "pt");
      if (got !== want) throw new Error(`sent ${sent.toISOString()}: printed ${got}, expected ${want}`);
      // And it is never the day the link dies on.
      const diesOn = LONG_PT.format(at + SURVEY_LINK_DAYS * 24 * 60 * 60_000);
      if (got === diesOn) throw new Error(`sent ${sent.toISOString()}: printed the day the link dies on`);
      checked += 1;
    }
    expect(checked).toBe(2 * 365 * 24);
  }, 30_000);
});

/* ------------------------------------------------------------------ */
/* The email                                                            */
/* ------------------------------------------------------------------ */

const EMAIL_CTX = {
  patientFirstName: "Madalena",
  appointmentDateLong: "23 de maio de 2026",
  surveyExpiryDateLong: "6 de junho de 2026",
  clinicPhone: "+351 272 000 000",
};

describe("the email", () => {
  it("pt, whole: the copy file's text with the values in place", () => {
    const res = renderSurveyEmailBody({ locale: "pt", ctx: EMAIL_CTX, code: CODE, env: ENV });
    expect(res).toEqual({
      ok: true,
      subject: "Avaliação da sua consulta de 23 de maio de 2026",
      body: [
        "Olá Madalena,",
        "",
        "Pedimos a sua avaliação da consulta de 23 de maio de 2026. A avaliação tem três perguntas e a resposta é facultativa.",
        "",
        `Responder: https://${HOST}/s/${CODE}`,
        "",
        "A ligação é pessoal, só pode ser usada uma vez e é válida até 6 de junho de 2026.",
        "",
        "Se não pretender receber estas avaliações, indique-o na mesma ligação ou contacte a clínica: +351 272 000 000",
        "",
        "OsteoJP",
      ].join("\n"),
    });
  });

  it.each(["pt", "en"] as const)("%s: no unfilled placeholder, and every value is there", (locale) => {
    const res = renderSurveyEmailBody({ locale, ctx: EMAIL_CTX, code: CODE, env: ENV });
    if (!res.ok) throw new Error(`expected an email, got ${res.kind}`);
    expect(res.subject).not.toMatch(/[{}]/);
    expect(res.body).not.toMatch(/[{}]/);
    expect(res.subject).toContain(EMAIL_CTX.appointmentDateLong);
    for (const value of Object.values(EMAIL_CTX)) expect(res.body).toContain(value);
    expect(res.body).toContain(`https://${HOST}/s/${CODE}`);
    expect(res.body.split("\n").at(-1)).toBe("OsteoJP");
  });

  it("no origin configured: a refusal as a value, and no email", () => {
    const res = renderSurveyEmailBody({ locale: "pt", ctx: EMAIL_CTX, code: CODE, env: {} });
    expect(res).toMatchObject({ ok: false, kind: "no_link_origin" });
    if (res.ok) throw new Error("unreachable");
    expect(res.refusal).toContain(CONFIRM_LINK_BASE_VAR);
    expect(res.refusal).not.toContain(CODE);
  });

  it("a value left out is a programming error, and that still throws", () => {
    expect(() =>
      renderSurveyEmail("pt", {
        ...EMAIL_CTX,
        surveyLink: "{{survey_link}}",
      }),
    ).toThrow(/unfilled placeholder/);
  });
});

/* ------------------------------------------------------------------ */
/* The SMS, measured                                                    */
/* ------------------------------------------------------------------ */

/**
 * The longest host that fits one segment, per locale. MEASURED below, not
 * taken from a document: 160, less the fixed text, the date, "/s/" and the
 * code.
 */
const LONGEST_HOST = { pt: 43, en: 47 } as const;

describe("what the SMS is made of", () => {
  it("the date is five characters on every day of a year", () => {
    const lengths = new Set<number>();
    for (let day = 0; day < 366; day++) {
      lengths.add(formatDateShort(new Date(Date.UTC(2028, 0, 1 + day, 12))).length);
    }
    expect([...lengths]).toEqual([DATE.length]);
  });

  it("the code is eight characters, the length the confirm code has", () => {
    // The survey's code module comes in a later pull request and is specified
    // to reuse this length and alphabet. If it does not, the verdict below
    // still decides: see "a longer code" further down.
    expect(CODE).toHaveLength(CONFIRM_CODE_LENGTH);
    expect(isGsm7("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")).toBe(true);
  });

  it.each([
    ["pt", 101],
    ["en", 97],
  ] as const)("%s: the fixed text is %i characters, line breaks included", (locale, fixed) => {
    expect(assembleSurveySms(locale, { appointmentDateShort: "", surveyLinkBare: "" })).toHaveLength(
      fixed,
    );
    // The arithmetic the copy file states, from the measured parts.
    expect(SMS_SEGMENT_LIMIT - fixed - DATE.length - "/s/".length - CODE.length).toBe(
      LONGEST_HOST[locale],
    );
  });
});

describe.each(["pt", "en"] as const)("the %s SMS at the limit", (locale) => {
  const longest = LONGEST_HOST[locale];

  it(`a host of ${longest} characters fits: exactly 160, one GSM-7 segment`, () => {
    const host = hostOf(longest);
    expect(host).toHaveLength(longest);
    const res = renderSurveySmsBody({
      locale,
      appointmentDateShort: DATE,
      code: CODE,
      env: envFor(host),
    });
    if (!res.ok) throw new Error(`expected a body, got ${res.kind}: ${res.refusal}`);
    expect(res.length).toBe(SMS_SEGMENT_LIMIT);
    expect(res.body).toHaveLength(SMS_SEGMENT_LIMIT);
    expect(isGsm7(res.body)).toBe(true);
    expect(res.body.split("\n")[1]!.endsWith(`${host}/s/${CODE}`)).toBe(true);
    expect(res.body).not.toMatch(/[{}]/);
  });

  it(`a host of ${longest + 1} is refused, as a value and not a throw`, () => {
    const res = renderSurveySmsBody({
      locale,
      appointmentDateShort: DATE,
      code: CODE,
      env: envFor(hostOf(longest + 1)),
    });
    expect(res).toMatchObject({ ok: false, kind: "too_long", length: SMS_SEGMENT_LIMIT + 1 });
    if (res.ok) throw new Error("unreachable");
    // The sentence is for an operator: it carries the length, never the code.
    expect(res.refusal).toContain("161");
    expect(res.refusal).not.toContain(CODE);
    expect(res).not.toHaveProperty("body");
  });

  it("a longer code at the longest host is refused too: the verdict is on the whole body", () => {
    const res = renderSurveySmsBody({
      locale,
      appointmentDateShort: DATE,
      code: `${CODE}Z`,
      env: envFor(hostOf(longest)),
    });
    expect(res).toMatchObject({ ok: false, kind: "too_long", length: SMS_SEGMENT_LIMIT + 1 });
  });
});

describe("the pt SMS, whole", () => {
  it("is the copy file's three lines with the values in place", () => {
    const res = renderSurveySmsBody({
      locale: "pt",
      appointmentDateShort: DATE,
      code: CODE,
      env: ENV,
    });
    expect(res).toEqual({
      ok: true,
      body: [
        "OsteoJP: avaliacao da consulta de 23/05",
        `Responder: ${HOST}/s/${CODE}`,
        "Para nao receber mais avaliacoes, use a mesma ligacao.",
      ].join("\n"),
      length: 101 + DATE.length + HOST.length + "/s/".length + CODE.length,
    });
  });
});

describe("the other two refusals", () => {
  it("no origin configured: no body, and the variable is named", () => {
    const res = renderSurveySmsBody({ locale: "pt", appointmentDateShort: DATE, code: CODE, env: {} });
    expect(res).toMatchObject({ ok: false, kind: "no_link_origin", length: null });
    if (res.ok) throw new Error("unreachable");
    expect(res.refusal).toContain(CONFIRM_LINK_BASE_VAR);
  });

  it("a host with an accent leaves GSM-7 and is refused, short as it is", () => {
    const res = renderSurveySmsBody({
      locale: "pt",
      appointmentDateShort: DATE,
      code: CODE,
      env: envFor("clínica.invalid"),
    });
    expect(res).toMatchObject({ ok: false, kind: "not_gsm7" });
  });
});
