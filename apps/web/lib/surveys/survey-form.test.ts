/**
 * survey-form.test.ts: SAT-01. What the survey form accepts as an answer.
 *
 * The limits are migration 0102's CHECKs. A value the table would refuse must
 * come back here as a marked field, never reach the door and fail there.
 */
import { describe, expect, it } from "vitest";
import { CURRENT_SURVEY_CONSENT_VERSION } from "@osteojp/i18n";
import { SURVEY_COMMENT_MAX, parseSurveyForm } from "./survey-form";

function form(over: Record<string, string | null> = {}): FormData {
  const base: Record<string, string | null> = {
    nps: "9",
    rating: "4",
    comment: "",
    contactConsent: null,
    consentVersion: CURRENT_SURVEY_CONSENT_VERSION,
    ...over,
  };
  const f = new FormData();
  for (const [k, v] of Object.entries(base)) if (v !== null) f.set(k, v);
  return f;
}

describe("a complete answer", () => {
  it("is read as numbers, no comment, no contact permission, and the label shown", () => {
    const parsed = parseSurveyForm(form());
    expect(parsed).toMatchObject({
      ok: true,
      answer: {
        nps: 9,
        rating: 4,
        comment: null,
        contactConsent: false,
        consentVersion: CURRENT_SURVEY_CONSENT_VERSION,
      },
    });
  });

  it("accepts both ends of both scales", () => {
    for (const nps of ["0", "10"]) expect(parseSurveyForm(form({ nps })).ok, nps).toBe(true);
    for (const rating of ["1", "5"]) expect(parseSurveyForm(form({ rating })).ok, rating).toBe(true);
  });

  it("the contact box is permission only when it was ticked", () => {
    const ticked = parseSurveyForm(form({ contactConsent: "on" }));
    expect(ticked.ok && ticked.answer.contactConsent).toBe(true);
    const unticked = parseSurveyForm(form());
    expect(unticked.ok && unticked.answer.contactConsent).toBe(false);
  });

  it("keeps a comment as written, and a blank one is no comment", () => {
    const kept = parseSurveyForm(form({ comment: "  Correu bem.  " }));
    expect(kept.ok && kept.answer.comment).toBe("  Correu bem.  ");
    for (const blank of ["", "   ", "\n\n", "\r\n \t"]) {
      const parsed = parseSurveyForm(form({ comment: blank }));
      expect(parsed.ok && parsed.answer.comment, JSON.stringify(blank)).toBeNull();
    }
  });
});

describe("a missing or impossible answer marks its own field and no other", () => {
  it("question 1", () => {
    for (const nps of [null, "", "11", "-1", "7.5", " 7", "07", "sete", "1e1"]) {
      const parsed = parseSurveyForm(form({ nps }));
      expect(parsed.ok, JSON.stringify(nps)).toBe(false);
      if (!parsed.ok) expect(parsed.state.errors).toEqual({ nps: true });
    }
  });

  it("question 2", () => {
    for (const rating of [null, "", "0", "6", "3.0", "tres"]) {
      const parsed = parseSurveyForm(form({ rating }));
      expect(parsed.ok, JSON.stringify(rating)).toBe(false);
      if (!parsed.ok) expect(parsed.state.errors).toEqual({ rating: true });
    }
  });

  it("both missing marks both", () => {
    const parsed = parseSurveyForm(form({ nps: null, rating: null }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.state.errors).toEqual({ nps: true, rating: true });
  });

  it("the state it returns holds which fields to mark and none of what was entered", () => {
    const parsed = parseSurveyForm(form({ rating: null, comment: "Texto escrito.", contactConsent: "on" }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.state).toEqual({ errors: { rating: true } });
      expect(JSON.stringify(parsed.state)).not.toContain("Texto escrito.");
    }
  });
});

describe("the comment's length is the database's: 1000 characters", () => {
  it("accepts exactly 1000 and refuses 1001", () => {
    expect(SURVEY_COMMENT_MAX).toBe(1000);
    expect(parseSurveyForm(form({ comment: "a".repeat(1000) })).ok).toBe(true);
    const over = parseSurveyForm(form({ comment: "a".repeat(1001) }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.state.errors).toEqual({ comment: true });
  });

  it("counts a line break once, as the browser's own limit does", () => {
    // 500 lines of one character: 999 characters with LF, 1498 as the CR LF a
    // browser submits. The page accepted it, so the server must.
    const typed = Array.from({ length: 500 }, () => "a").join("\r\n");
    const parsed = parseSurveyForm(form({ comment: typed }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.answer.comment).not.toContain("\r");
      expect(Array.from(parsed.answer.comment ?? "")).toHaveLength(999);
    }
  });

  it("refuses a comment over the raw bound as too long, and still accepts 1000 line breaks sent as CR LF", () => {
    const huge = parseSurveyForm(form({ comment: "a".repeat(4001) }));
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.state.errors.comment).toBe(true);
    expect(parseSurveyForm(form({ comment: "\r\n".repeat(1000) })).ok).toBe(true);
  });

  it("counts characters as Postgres does, so 1000 accented or astral characters pass", () => {
    expect(parseSurveyForm(form({ comment: "ã".repeat(1000) })).ok).toBe(true);
    // One code point, two UTF-16 units: `.length` would call this 2000.
    expect(parseSurveyForm(form({ comment: "\u{1F642}".repeat(1000) })).ok).toBe(true);
    expect(parseSurveyForm(form({ comment: "\u{1F642}".repeat(1001) })).ok).toBe(false);
  });

  it("removes NUL, which a Postgres text value cannot hold", () => {
    const parsed = parseSurveyForm(form({ comment: "a\u0000b" }));
    expect(parsed.ok && parsed.answer.comment).toBe("ab");
  });
});

describe("the consent label", () => {
  it("a label the page never rendered is a save that did not happen, not a field error", () => {
    for (const consentVersion of [null, "", "sat01-made-up", "x".repeat(65)]) {
      const parsed = parseSurveyForm(form({ consentVersion }));
      expect(parsed.ok, JSON.stringify(consentVersion)).toBe(false);
      if (!parsed.ok) expect(parsed.state.errors).toEqual({ save: true });
    }
  });
});
