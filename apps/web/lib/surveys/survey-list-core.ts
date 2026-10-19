// SAT-01 (spec 7.3, copy sections F and K): how one survey send reads on the
// Avaliações de satisfação list in Comunicações.
//
// Pure module: no DB, no `server-only`, no env. Every rule a member of staff
// reads off the page is a table test here rather than a claim in a component.

import { s } from "@/lib/i18n";

/** One send as the query returns it, under the viewer's own row policies. */
export type SurveyListEntry = {
  sendId: string;
  sentAt: Date;
  /** `email` or `sms`. */
  channel: string;
  /** `automatic` or `manual`. */
  origin: string;
  /** `answered`, `opted_out`, or null while the link is open. */
  outcome: string | null;
  /** Null for an automatic send, or when this viewer cannot read the sender. */
  senderName: string | null;
  patientId: string;
  /** Null when the patients policy does not show this viewer the patient. */
  patientName: string | null;
  patientDeleted: boolean;
  /** Null when the appointments policy does not show this viewer the visit. */
  visitStartsAt: Date | null;
  therapistName: string | null;
  clinicName: string | null;
  /**
   * The answer, or null: when there is none, and when there is one this viewer
   * may not read (0102's policy on answers returned no row for it).
   */
  answer: {
    nps: number;
    rating: number;
    comment: string | null;
    commentPurgedAt: Date | null;
    contactConsent: boolean;
    submittedAt: Date;
  } | null;
};

/** One row, every cell already a string, formatted on the server in Europe/Lisbon. */
export type SurveyListRowView = {
  id: string;
  visit: string;
  patientName: string;
  /** The ficha to open, or null when this viewer has no ficha to open for the row. */
  patientHref: string | null;
  therapist: string;
  clinic: string;
  send: string;
  answerState: string;
  /**
   * `open`: no answer exists. `shown`: the viewer reads it. `reserved`: an
   * answer exists and this viewer may not read it (copy text 81).
   */
  answer: "open" | "shown" | "reserved";
  nps: string;
  rating: string;
  comment: string;
  contact: string;
  channel: string;
  answeredAt: string;
};

/** A cell with nothing to say. */
export const EMPTY_CELL = "-";

/**
 * Europe/Lisbon, ON THE SERVER. A Date formatted in the browser renders in the
 * browser's zone (the rule /recuperacao settled).
 */
const DATE_FMT: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Lisbon",
};
const DATETIME_FMT: Intl.DateTimeFormatOptions = {
  ...DATE_FMT,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** 23/05/2026: the staff date of the copy file. */
export function surveyDate(d: Date): string {
  return d.toLocaleDateString("pt-PT", DATE_FMT);
}

function surveyStamp(d: Date): string {
  return d.toLocaleString("pt-PT", DATETIME_FMT);
}

/**
 * The send cell (copy text 79): the date and who sent it, or "automático".
 * Read from `origin`, not from the sender being absent: a manual send whose
 * sender this viewer cannot read is still not an automatic one.
 */
export function sendCell(entry: Pick<SurveyListEntry, "sentAt" | "origin" | "senderName">): string {
  const data = surveyDate(entry.sentAt);
  if (entry.origin === "automatic") return s["surveyList.sendAutomatic"].replace("{data}", data);
  return s["surveyList.sendByStaff"].replace("{data}", data).replace("{nome}", entry.senderName ?? EMPTY_CELL);
}

/** `Email` or `SMS` (copy text 48); a value 0102's check does not allow reads as nothing. */
export function channelCell(channel: string): string {
  if (channel === "email") return s["surveyList.channelEmail"];
  if (channel === "sms") return s["surveyList.channelSms"];
  return EMPTY_CELL;
}

/**
 * The comment cell: the comment; "Sem comentário" when the patient wrote none
 * (text 50); the retention sentence once the comment was purged (text 51).
 */
export function commentCell(answer: NonNullable<SurveyListEntry["answer"]>): string {
  if (answer.commentPurgedAt) return s["surveyList.commentPurged"];
  if (answer.comment === null || answer.comment === "") return s["surveyList.noComment"];
  return answer.comment;
}

export function toSurveyListRow(entry: SurveyListEntry): SurveyListRowView {
  // AN ANSWER EXISTS when the send says so. Whether this viewer reads it is a
  // different fact, and it is the database's: no row came back for it.
  const answered = entry.outcome === "answered";
  const answer: SurveyListRowView["answer"] = entry.answer ? "shown" : answered ? "reserved" : "open";
  const a = entry.answer;
  return {
    id: entry.sendId,
    visit: entry.visitStartsAt ? surveyDate(entry.visitStartsAt) : EMPTY_CELL,
    patientName: entry.patientName ?? EMPTY_CELL,
    // No ficha link for a patient this viewer cannot read, or one that was
    // eliminated: the address would answer "not found".
    patientHref: entry.patientName !== null && !entry.patientDeleted ? `/patients/${entry.patientId}` : null,
    therapist: entry.therapistName ?? EMPTY_CELL,
    clinic: entry.clinicName ?? EMPTY_CELL,
    send: sendCell(entry),
    answerState: answered ? s["surveyList.answered"] : s["surveyList.notAnswered"],
    answer,
    nps: a ? String(a.nps) : EMPTY_CELL,
    rating: a ? String(a.rating) : EMPTY_CELL,
    comment: a ? commentCell(a) : EMPTY_CELL,
    contact: a ? (a.contactConsent ? s["surveyList.contactYes"] : s["surveyList.contactNo"]) : EMPTY_CELL,
    channel: channelCell(entry.channel),
    answeredAt: a ? surveyStamp(a.submittedAt) : EMPTY_CELL,
  };
}

/* ================================================================== */
/* The month filter (copy text 52)                                    */
/* ================================================================== */

export type SurveyMonth = {
  /** `2026-05`, the value of the address and of the month box. */
  value: string;
  /** The first instant of the month and of the next, as Lisbon wall-clock text. */
  from: string;
  until: string;
};

/**
 * A month of the SEND, by the Lisbon calendar, or null for "every month".
 *
 * The value comes from the address, so it is whatever a person typed. Anything
 * that is not exactly four digits, a hyphen and a month from 01 to 12 is no
 * filter at all, never a filter that matches nothing: a mistyped address shows
 * the whole list rather than an empty one that reads as "nothing was sent".
 */
export function parseSurveyMonth(raw: string | null | undefined): SurveyMonth | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2999) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    value: `${year}-${pad(month)}`,
    from: `${year}-${pad(month)}-01 00:00:00`,
    until: `${next.y}-${pad(next.m)}-01 00:00:00`,
  };
}
