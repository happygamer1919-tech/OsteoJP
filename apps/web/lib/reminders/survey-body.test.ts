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
import { formatDateShort } from "./locale";
import { REMINDER_TEMPLATES } from "./notification-registry";
import { renderSurveyEmailBody, renderSurveySmsBody, surveyLinks } from "./survey-body";
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
/* The email                                                            */
/* ------------------------------------------------------------------ */

const EMAIL_CTX = {
  patientFirstName: "Madalena",
  appointmentDateLong: "23 de maio de 2026",
  surveyExpiryDateLong: "7 de junho de 2026",
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
        "A ligação é pessoal, só pode ser usada uma vez e é válida até 7 de junho de 2026.",
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
