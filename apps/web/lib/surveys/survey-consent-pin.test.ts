/**
 * survey-consent-pin.test.ts: SAT-01. THE SURVEY'S TEXT IS PINNED TO ITS LABEL,
 * AND THE STRINGS ARE THE APPROVED COPY.
 *
 * WHAT THE LABEL IS. Every answer stores `consent_version`, the label of the
 * page text the patient was shown (packages/i18n/src/survey-consent.ts): the
 * three questions with their scale ends, the sentence saying who reads the
 * answers (text 7) and the contact permission sentence (text 17).
 *
 * THE HAZARD, the same one intake-consent-pin.test.ts guards: the texts are
 * i18n strings, so one can be EDITED UNDER an unchanged label, and every
 * earlier answer then claims a wording nobody saw. So the texts are pinned by
 * sha256, per locale, to the current label. To change a text: add a NEW label
 * at the end of SURVEY_CONSENT_VERSIONS, add its two hashes here, and never
 * edit an old label's entry.
 *
 * A LABEL IS AT MOST 64 CHARACTERS (spec 3.6, note A5): migration 0102's CHECK.
 * A longer label would be refused by the database on every answer.
 *
 * THE SECOND HALF checks the page's strings against the copy file, character
 * for character: the Portuguese is JP's approved text and the English its
 * published translation, and neither is this lane's to reword.
 *
 * NEGATIVE CONTROLS at the bottom prove the pin can fail.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SURVEY_CONSENT_VERSION,
  SURVEY_CONSENT_TEXT_KEYS,
  SURVEY_CONSENT_VERSIONS,
  SURVEY_CONSENT_VERSION_MAX_LENGTH,
  getStrings,
  isSurveyConsentVersion,
  type Locale,
  type StringKey,
  type SurveyConsentVersion,
} from "@osteojp/i18n";

/**
 * One entry per label, ever. A label whose text has been superseded keeps its
 * entry: it records what that label meant. Typed over the labels, so a new
 * label without hashes does not compile.
 */
const PINNED: Record<SurveyConsentVersion, Record<Locale, string>> = {
  "sat01-survey-2026-10-02": {
    pt: "039e5c7332c7032eded01f95e23b8c19405d14f1f504ebf3cdf80df37d5d968c",
    en: "65ad6b4cc93f9d2ef256e3d041e892ae979e9acc568b372bb7ee3e704122585f",
  },
};

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** The pinned texts of one locale, joined by a line break in the listed order. */
function shownText(locale: Locale): string {
  const s = getStrings(locale);
  return SURVEY_CONSENT_TEXT_KEYS.map((key) => s[key]).join("\n");
}

describe("the survey's text is pinned to CURRENT_SURVEY_CONSENT_VERSION", () => {
  it("every pinned hash is a real sha256, and every label has one", () => {
    for (const label of SURVEY_CONSENT_VERSIONS) {
      const pin = PINNED[label];
      expect(pin, `no pin for ${label}`).toBeDefined();
      expect(pin.pt).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.en).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it.each(["pt", "en"] as const)("the %s text is whole and hashes to the current label", (locale) => {
    const s = getStrings(locale);
    // Refuse an empty text before hashing it: the hash of "" is a real hash.
    for (const key of SURVEY_CONSENT_TEXT_KEYS) expect(s[key].trim().length, key).toBeGreaterThan(5);
    expect(sha256(shownText(locale))).toBe(PINNED[CURRENT_SURVEY_CONSENT_VERSION][locale]);
  });

  it("the pinned list holds the three questions, who reads the answers, and the contact sentence", () => {
    expect([...SURVEY_CONSENT_TEXT_KEYS]).toEqual([
      "survey.page.whoReads",
      "survey.page.q1",
      "survey.page.q1Low",
      "survey.page.q1High",
      "survey.page.q2",
      "survey.page.q2Low",
      "survey.page.q2High",
      "survey.page.q3",
      "survey.page.contactConsent",
    ]);
  });

  it("the current label is the LAST one, and the list accepts only its own labels", () => {
    expect(CURRENT_SURVEY_CONSENT_VERSION).toBe(
      SURVEY_CONSENT_VERSIONS[SURVEY_CONSENT_VERSIONS.length - 1],
    );
    for (const label of SURVEY_CONSENT_VERSIONS) expect(isSurveyConsentVersion(label)).toBe(true);
    for (const other of ["", "sat01-survey", `${CURRENT_SURVEY_CONSENT_VERSION} `, null, 7]) {
      expect(isSurveyConsentVersion(other), JSON.stringify(other)).toBe(false);
    }
  });

  it("no label is blank or longer than the 64 characters the database accepts (A5)", () => {
    expect(SURVEY_CONSENT_VERSION_MAX_LENGTH).toBe(64);
    for (const label of SURVEY_CONSENT_VERSIONS) {
      expect(label.trim(), "a label is never blank").toBe(label);
      expect(label.length, label).toBeGreaterThan(0);
      expect(label.length, label).toBeLessThanOrEqual(SURVEY_CONSENT_VERSION_MAX_LENGTH);
    }
    expect(new Set(SURVEY_CONSENT_VERSIONS).size).toBe(SURVEY_CONSENT_VERSIONS.length);
  });
});

describe("NEGATIVE CONTROLS: the pin fails on the edits it exists to catch", () => {
  const current = PINNED[CURRENT_SURVEY_CONSENT_VERSION];

  it("a one-word edit of text 7 under the same label changes the hash", () => {
    const edited = shownText("pt").replace("incluindo o seu terapeuta", "excluindo o seu terapeuta");
    expect(edited).not.toBe(shownText("pt"));
    expect(sha256(edited)).not.toBe(current.pt);
  });

  it("a whitespace-only edit changes the hash too", () => {
    expect(sha256(`${shownText("en")} `)).not.toBe(current.en);
  });

  it("the pt pin does not match the en text (the locales are pinned separately)", () => {
    expect(sha256(shownText("en"))).not.toBe(current.pt);
  });
});

// ---------------------------------------------------------------------------
// THE STRINGS ARE THE COPY FILE'S, CHARACTER FOR CHARACTER.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const COPY = readFileSync(
  join(HERE, "..", "..", "..", "..", "docs", "design", "SAT-01-copy-pt.md"),
  "utf8",
).split("\n");

/** Copy text number to string key: texts 4 to 31, the page's whole section (19 and 20 are the opt-out, S8). */
const KEY_OF_TEXT: Record<number, StringKey> = {
  4: "survey.page.title",
  5: "survey.page.visitLine",
  6: "survey.page.instruction",
  7: "survey.page.whoReads",
  8: "survey.page.q1",
  9: "survey.page.q1Low",
  10: "survey.page.q1High",
  11: "survey.page.q2",
  12: "survey.page.q2Low",
  13: "survey.page.q2High",
  14: "survey.page.q3",
  15: "survey.page.q3Hint",
  16: "survey.page.healthNote",
  17: "survey.page.contactConsent",
  18: "survey.page.submit",
  19: "survey.page.optOut",
  20: "survey.page.optOutNote",
  21: "survey.page.errorSummary",
  22: "survey.page.q1Error",
  23: "survey.page.q2Error",
  24: "survey.page.commentError",
  25: "survey.page.saveError",
  26: "survey.page.answeredTitle",
  27: "survey.page.answeredBody",
  28: "survey.page.optedOutTitle",
  29: "survey.page.optedOutBody",
  30: "survey.page.invalidTitle",
  31: "survey.page.invalidBody",
};

/** The Portuguese text under heading `**n. ...**`: its one quoted line. */
function approvedPt(n: number): string {
  const heading = COPY.findIndex((line) => line.startsWith(`**${n}. `));
  if (heading === -1) throw new Error(`copy text ${n} has no heading`);
  const quote = COPY.findIndex((line, i) => i > heading && line.startsWith("> "));
  if (quote === -1 || COPY[quote + 1]?.startsWith(">")) throw new Error(`copy text ${n} is not one line`);
  return COPY[quote]!.slice(2);
}

/** The English text in row `| n | ... |` of the translation table. */
function publishedEn(n: number): string {
  const row = COPY.find((line) => line.startsWith(`| ${n} | `));
  if (!row) throw new Error(`copy text ${n} has no English row`);
  return row.slice(`| ${n} | `.length).replace(/ \|$/, "");
}

/** The copy file writes the date placeholder as the message templates do. */
const asStringKey = (text: string): string => text.replace("{{appointment_date}}", "{date}");

describe("the page's strings are the approved copy, character for character", () => {
  const numbers = Object.keys(KEY_OF_TEXT).map(Number);

  it("covers texts 4 to 31, and nothing else", () => {
    expect(numbers).toEqual(Array.from({ length: 28 }, (_, i) => i + 4));
  });

  it.each(numbers)("text %i, in Portuguese and in English", (n) => {
    const key = KEY_OF_TEXT[n]!;
    const pt = asStringKey(approvedPt(n));
    const en = asStringKey(publishedEn(n));
    expect(pt.length, "the reader found a text").toBeGreaterThan(5);
    expect(en.length, "the reader found a text").toBeGreaterThan(5);
    expect(getStrings("pt")[key]).toBe(pt);
    expect(getStrings("en")[key]).toBe(en);
  });

  it("CONTROL: the reader reads the file, it does not echo the strings", () => {
    expect(approvedPt(7)).toBe(
      "As respostas são identificadas e lidas pela equipa da clínica onde foi atendido, incluindo o seu terapeuta.",
    );
    expect(publishedEn(18)).toBe("Submit answers");
    expect(approvedPt(5)).toBe("Consulta de {{appointment_date}}");
  });

  it("no em or en dash in any survey string", () => {
    for (const locale of ["pt", "en"] as const) {
      const s = getStrings(locale);
      for (const key of [
        ...Object.values(KEY_OF_TEXT),
        ...Object.values(STAFF_KEY_OF_TEXT),
        ...Object.values(NEW_KEY_OF_TEXT),
      ]) {
        expect(s[key], key).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });

  it("THE OPT-OUT IS NOT PART OF WHAT AN ANSWER WAS GIVEN UNDER: its texts are outside the label", () => {
    // Texts 19 and 20 say nothing about what an answer means or who reads it,
    // so adding them changed no label and no pinned hash.
    const pinned = SURVEY_CONSENT_TEXT_KEYS as readonly string[];
    expect(pinned).not.toContain("survey.page.optOut");
    expect(pinned).not.toContain("survey.page.optOutNote");
    // Nor is its failure sentence (text 84, 2026-10-14).
    expect(pinned).not.toContain("survey.page.optOutSaveError");
  });
});

/** The patient ficha's section (copy section G): its title, the switch and the note under it when off. */
const STAFF_KEY_OF_TEXT: Record<number, StringKey> = {
  58: "patients.surveySwitchTitle",
  59: "patients.surveySwitchLabel",
  60: "patients.surveySwitchOffNote",
};

describe("the ficha's survey switch strings are the copy file's, character for character", () => {
  it.each(Object.keys(STAFF_KEY_OF_TEXT).map(Number))("text %i, in Portuguese and in English", (n) => {
    const key = STAFF_KEY_OF_TEXT[n]!;
    const pt = approvedPt(n);
    const en = publishedEn(n);
    expect(pt.length, "the reader found a text").toBeGreaterThan(5);
    expect(en.length, "the reader found a text").toBeGreaterThan(5);
    expect(getStrings("pt")[key]).toBe(pt);
    expect(getStrings("en")[key]).toBe(en);
  });
});

/**
 * Copy section M, written by strategy on 2026-10-14: the opt-out's failure
 * (84, patient), a month with no sends (86) and no clinic (87) in the list,
 * and the ficha's empty list for anyone but the owner (88). Text 85 is the
 * portal's and is pinned with the portal's own strings
 * (apps/portal/app/portal/account/AccountView.render.test.tsx).
 */
const NEW_KEY_OF_TEXT: Record<number, StringKey> = {
  84: "survey.page.optOutSaveError",
  86: "surveyList.emptyMonth",
  87: "surveyList.noClinic",
  88: "patients.surveyRowsNoneVisible",
};

describe("the texts of 2026-10-14 are the copy file's, character for character", () => {
  it.each(Object.keys(NEW_KEY_OF_TEXT).map(Number))("text %i, in Portuguese and in English", (n) => {
    const key = NEW_KEY_OF_TEXT[n]!;
    const pt = approvedPt(n);
    const en = publishedEn(n);
    expect(pt.length, "the reader found a text").toBeGreaterThan(5);
    expect(en.length, "the reader found a text").toBeGreaterThan(5);
    expect(getStrings("pt")[key]).toBe(pt);
    expect(getStrings("en")[key]).toBe(en);
  });

  it("text 85 is the portal's own string, in Portuguese and in English", () => {
    const portal = (locale: "pt" | "en"): { account: Record<string, string> } =>
      JSON.parse(
        readFileSync(
          join(HERE, "..", "..", "..", "..", "packages", "i18n", "src", "portal", `strings.${locale}.json`),
          "utf8",
        ),
      );
    expect(approvedPt(85).length).toBeGreaterThan(5);
    expect(portal("pt").account.survey_save_error).toBe(approvedPt(85));
    expect(portal("en").account.survey_save_error).toBe(publishedEn(85));
  });

  it("CONTROL: the reader reads section M", () => {
    expect(approvedPt(88)).toBe("Nenhuma avaliação de satisfação visível para si.");
    expect(publishedEn(86)).toBe("No survey sent this month.");
  });
});
