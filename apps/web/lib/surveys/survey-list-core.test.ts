/**
 * survey-list-core.test.ts: SAT-01 (spec 7.3, copy sections F and K). HOW ONE
 * SURVEY SEND READS ON THE LIST, cell by cell, and what the month filter takes.
 *
 * Every expected text is written out here as the copy file has it
 * (docs/design/SAT-01-copy-pt.md), not read back from the string file, so a
 * changed string fails this test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  EMPTY_CELL,
  channelCell,
  commentCell,
  parseSurveyMonth,
  sendCell,
  surveyDate,
  toSurveyListRow,
  type SurveyListEntry,
} from "./survey-list-core";

const RESERVED =
  "Resposta visível apenas para o terapeuta que realizou a consulta, para a receção e os administradores dessa clínica e para o proprietário.";

const entry = (over: Partial<SurveyListEntry> = {}): SurveyListEntry => ({
  sendId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  sentAt: new Date("2026-05-24T10:00:00Z"),
  channel: "email",
  origin: "automatic",
  outcome: null,
  senderName: null,
  patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  patientName: "Paciente Inventado",
  patientDeleted: false,
  visitStartsAt: new Date("2026-05-23T09:00:00Z"),
  therapistName: "Terapeuta Inventado",
  clinicName: "Clinica Inventada",
  answer: null,
  ...over,
});

const answer = (over: Partial<NonNullable<SurveyListEntry["answer"]>> = {}) => ({
  nps: 9,
  rating: 4,
  comment: "Texto inventado do comentario.",
  commentPurgedAt: null,
  contactConsent: true,
  submittedAt: new Date("2026-05-25T14:30:00Z"),
  ...over,
});

describe("the send cell (copy text 79)", () => {
  it("an automatic send reads its date and 'automático'", () => {
    expect(sendCell(entry())).toBe("24/05/2026, automático");
  });

  it("a send by staff reads its date and the sender's name", () => {
    expect(sendCell(entry({ origin: "manual", senderName: "Rececionista Inventada" }))).toBe(
      "24/05/2026, por Rececionista Inventada",
    );
  });

  it("a manual send whose sender the viewer cannot read is NOT called automatic", () => {
    const cell = sendCell(entry({ origin: "manual", senderName: null }));
    expect(cell).toBe(`24/05/2026, por ${EMPTY_CELL}`);
    expect(cell).not.toContain("automático");
  });

  it("the date is the Lisbon calendar day, not the UTC one", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in Lisbon (summer time).
    expect(surveyDate(new Date("2026-06-30T23:30:00Z"))).toBe("01/07/2026");
    // 23:30 UTC on 31 December is still 31 December in Lisbon (winter time).
    expect(surveyDate(new Date("2026-12-31T23:30:00Z"))).toBe("31/12/2026");
  });
});

describe("the channel cell (copy text 48)", () => {
  it("reads Email or SMS, and nothing for a value the table does not allow", () => {
    expect(channelCell("email")).toBe("Email");
    expect(channelCell("sms")).toBe("SMS");
    expect(channelCell("whatsapp")).toBe(EMPTY_CELL);
  });
});

describe("the comment cell (copy texts 45, 50, 51)", () => {
  it("shows the comment as written", () => {
    expect(commentCell(answer())).toBe("Texto inventado do comentario.");
  });
  it("says so when the patient wrote none", () => {
    expect(commentCell(answer({ comment: null }))).toBe("Sem comentário");
  });
  it("says the comment was deleted once it was purged, and that wins over 'none'", () => {
    expect(commentCell(answer({ comment: null, commentPurgedAt: new Date("2028-06-01T00:00:00Z") }))).toBe(
      "Comentário apagado ao fim de 24 meses.",
    );
  });
});

describe("one row of the list", () => {
  it("a send nobody answered: 'Sem resposta', and every answer cell empty", () => {
    const row = toSurveyListRow(entry());
    expect(row).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      visit: "23/05/2026",
      patientName: "Paciente Inventado",
      patientHref: "/patients/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      therapist: "Terapeuta Inventado",
      clinic: "Clinica Inventada",
      send: "24/05/2026, automático",
      answerState: "Sem resposta",
      answer: "open",
      nps: EMPTY_CELL,
      rating: EMPTY_CELL,
      comment: EMPTY_CELL,
      contact: EMPTY_CELL,
      channel: "Email",
      answeredAt: EMPTY_CELL,
    });
  });

  it("an answer the viewer reads: the scores, the comment, the contact choice and when", () => {
    const row = toSurveyListRow(entry({ outcome: "answered", answer: answer() }));
    expect(row.answer).toBe("shown");
    expect(row.answerState).toBe("Com resposta");
    expect(row.nps).toBe("9");
    expect(row.rating).toBe("4");
    expect(row.comment).toBe("Texto inventado do comentario.");
    expect(row.contact).toBe("Sim");
    // 14:30 UTC in May is 15:30 in Lisbon.
    expect(row.answeredAt).toBe("25/05/2026, 15:30");
    expect(toSurveyListRow(entry({ outcome: "answered", answer: answer({ contactConsent: false }) })).contact).toBe(
      "Não",
    );
  });

  it("a score of zero is a score, not an empty cell", () => {
    expect(toSurveyListRow(entry({ outcome: "answered", answer: answer({ nps: 0 }) })).nps).toBe("0");
  });

  it("AN ANSWER THE VIEWER MAY NOT READ: 'Com resposta', reserved, and no answer cell carries anything", () => {
    const row = toSurveyListRow(entry({ outcome: "answered", answer: null }));
    expect(row.answer).toBe("reserved");
    expect(row.answerState).toBe("Com resposta");
    for (const cell of [row.nps, row.rating, row.comment, row.contact, row.answeredAt]) {
      expect(cell).toBe(EMPTY_CELL);
    }
    // The send's own cells still show.
    expect(row.send).toBe("24/05/2026, automático");
    expect(row.channel).toBe("Email");
  });

  it("a patient who refused further surveys from the link did not answer", () => {
    const row = toSurveyListRow(entry({ outcome: "opted_out" }));
    expect(row.answer).toBe("open");
    expect(row.answerState).toBe("Sem resposta");
  });

  it("what the viewer cannot read blanks its cell and never removes the row", () => {
    const row = toSurveyListRow(entry({ patientName: null, visitStartsAt: null, therapistName: null, clinicName: null }));
    expect(row.patientName).toBe(EMPTY_CELL);
    expect(row.patientHref).toBeNull();
    expect(row.visit).toBe(EMPTY_CELL);
    expect(row.therapist).toBe(EMPTY_CELL);
    expect(row.clinic).toBe(EMPTY_CELL);
    expect(row.send).toBe("24/05/2026, automático");
  });

  it("an eliminated patient keeps the name and loses the link to a ficha that is not there", () => {
    const row = toSurveyListRow(entry({ patientDeleted: true }));
    expect(row.patientName).toBe("Paciente Inventado");
    expect(row.patientHref).toBeNull();
  });
});

describe("the month filter (copy text 52)", () => {
  it("a month is the Lisbon calendar month: its first midnight to the next month's", () => {
    expect(parseSurveyMonth("2026-05")).toEqual({
      value: "2026-05",
      from: "2026-05-01 00:00:00",
      until: "2026-06-01 00:00:00",
    });
    expect(parseSurveyMonth("2026-12")).toEqual({
      value: "2026-12",
      from: "2026-12-01 00:00:00",
      until: "2027-01-01 00:00:00",
    });
  });

  it.each([null, undefined, "", "2026", "2026-5", "2026-00", "2026-13", "26-05", "2026-05-01", " 2026-05", "2026-05 ", "abcd-ef", "1999-05", "3000-01", "2026-05'; drop table x; --"])(
    "%j is no filter at all (the whole list), never a filter that matches nothing",
    (raw) => {
      expect(parseSurveyMonth(raw)).toBeNull();
    },
  );
});

describe("what the list is built from", () => {
  const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

  it("the reserved sentence is copy text 81, character for character", () => {
    const strings = JSON.parse(read("../../../../packages/i18n/src/strings.pt.json")) as Record<string, string>;
    expect(strings["surveyList.answerReserved"]).toBe(RESERVED);
  });

  it("the query reads as the viewer, and never the codes table or the send path's context (spec A7)", () => {
    const query = read("./survey-list.ts");
    const code = query
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(code).toContain("runScoped(");
    expect(code).not.toMatch(/appointmentSurveyCodes|appointment_survey_codes|code_hash|codeHash/);
    expect(code).not.toMatch(/withReminderTenantContext|getDbAdmin|service/i);
    // Every join is LEFT: a send the viewer may read is never dropped by what
    // else they may not read.
    expect(code).not.toMatch(/\.innerJoin\(/);
    expect(code.match(/\.leftJoin\(/g)?.length).toBe(6);
  });
});
