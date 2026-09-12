/**
 * INTAKE-01 - the wire validation of the guest clinical intake.
 *
 * EVERY REFUSAL HAS AN ACCEPTANCE BESIDE IT. A validator that refused
 * everything would pass every "refuses" case in this file, so each boundary is
 * asserted from both sides.
 */
import { describe, expect, it } from "vitest";

import {
  CURRENT_INTAKE_CONSENT_VERSION,
  INTAKE_CONSENT_VERSIONS,
  isIntakeConsentVersion,
} from "@osteojp/i18n";

import { GUEST_INTAKE_WIRE_KEYS, INTAKE_TEXT_MAX_CHARS, parseGuestIntake } from "./validate";

const TODAY = { year: 2026, month: 9, day: 11 };

const valid = (over: Record<string, unknown> = {}) => ({
  dateOfBirth: "1985-03-02",
  reason: "Dor cervical",
  healthConditions: null,
  medication: null,
  fallsAccidents: null,
  surgeries: null,
  pacemaker: "nao",
  pregnancy: "nao",
  consentVersion: CURRENT_INTAKE_CONSENT_VERSION,
  ...over,
});

const ok = (over: Record<string, unknown> = {}) => parseGuestIntake(valid(over), TODAY).ok;

describe("the consent version (WF-19)", () => {
  it("the first label is the one this card shipped with, and it is never edited", () => {
    // Append-only: when the text changes a NEW label is added at the end.
    expect(INTAKE_CONSENT_VERSIONS[0]).toBe("rgpd-intake-2026-09-11");
  });

  it("the current label is the LAST one in the list", () => {
    expect(CURRENT_INTAKE_CONSENT_VERSION).toBe(
      INTAKE_CONSENT_VERSIONS[INTAKE_CONSENT_VERSIONS.length - 1],
    );
  });

  it("validates against the list, not by shape", () => {
    expect(isIntakeConsentVersion("rgpd-intake-2026-09-11")).toBe(true);
    expect(isIntakeConsentVersion("rgpd-intake-2026-09-12")).toBe(false);
    expect(isIntakeConsentVersion(undefined)).toBe(false);
  });
});

describe("a valid intake", () => {
  it("is accepted, and optional answers that were not given are NULL", () => {
    const r = parseGuestIntake(valid(), TODAY);
    expect(r).toEqual({
      ok: true,
      intake: {
        dateOfBirth: "1985-03-02",
        reason: "Dor cervical",
        healthConditions: null,
        medication: null,
        fallsAccidents: null,
        surgeries: null,
        pacemaker: "nao",
        pregnancy: "nao",
        consentVersion: "rgpd-intake-2026-09-11",
      },
    });
  });

  it("absent optional keys are NULL too", () => {
    const rest: Record<string, unknown> = { ...valid() };
    for (const k of ["healthConditions", "medication", "fallsAccidents", "surgeries"]) delete rest[k];
    const r = parseGuestIntake(rest, TODAY);
    expect(r.ok && r.intake.healthConditions).toBe(null);
  });

  it("text is trimmed, and a blank optional answer is NULL rather than whitespace", () => {
    const r = parseGuestIntake(
      valid({ reason: "  Dor  ", medication: "  Ibuprofeno ", surgeries: " \n\t " }),
      TODAY,
    );
    expect(r.ok && r.intake.reason).toBe("Dor");
    expect(r.ok && r.intake.medication).toBe("Ibuprofeno");
    expect(r.ok && r.intake.surgeries).toBe(null);
  });

  it("the output carries EXACTLY the stored keys - smuggled consentAt / consentTicked are dropped", () => {
    const r = parseGuestIntake(
      valid({ consentAt: "2020-01-01T00:00:00Z", consentTicked: false, extra: 1 }),
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.intake).sort()).toEqual([...GUEST_INTAKE_WIRE_KEYS].sort());
  });
});

describe("the two safety questions: sim or nao, both required (ruling 2)", () => {
  it.each(["pacemaker", "pregnancy"])("%s accepts sim and nao", (key) => {
    expect(ok({ [key]: "sim" })).toBe(true);
    expect(ok({ [key]: "nao" })).toBe(true);
  });

  it.each([
    { value: "nao_perguntado", why: "never-asked is storable in 0087 and NEVER from this door" },
    { value: undefined, why: "absent is refused, never stored as nao" },
    { value: null, why: "null likewise" },
    { value: "", why: "blank likewise" },
    { value: "Sim", why: "the wire is lower-case exactly" },
    { value: true, why: "a boolean is not an answer" },
    { value: false, why: "a boolean is not an answer" },
  ])("$value is refused for both ($why)", ({ value }) => {
    expect(ok({ pacemaker: value })).toBe(false);
    expect(ok({ pregnancy: value })).toBe(false);
  });
});

describe("date of birth", () => {
  it.each([
    ["1900-01-01", "0087's lower bound, inclusive"],
    ["2026-09-11", "today, in Lisbon"],
  ])("accepts %s (%s)", (dob) => {
    expect(ok({ dateOfBirth: dob })).toBe(true);
  });

  it.each([
    { dob: "1899-12-31", why: "before 0087's CHECK" },
    { dob: "2026-09-12", why: "tomorrow" },
    { dob: "2026-02-30", why: "a day that does not exist" },
    { dob: "1985-3-2", why: "unpadded" },
    { dob: "1985-03-02T00:00:00Z", why: "a timestamp" },
    { dob: 19850302, why: "not a string" },
    { dob: undefined, why: "absent - it is required" },
  ])("refuses $dob ($why)", ({ dob }) => {
    expect(ok({ dateOfBirth: dob })).toBe(false);
  });

  it("is stored canonical", () => {
    const r = parseGuestIntake(valid({ dateOfBirth: "1985-03-02" }), TODAY);
    expect(r.ok && r.intake.dateOfBirth).toBe("1985-03-02");
  });
});

describe("reason and the four optional texts", () => {
  it(`reason: ${INTAKE_TEXT_MAX_CHARS} characters accepted, one more refused`, () => {
    expect(ok({ reason: "a".repeat(INTAKE_TEXT_MAX_CHARS) })).toBe(true);
    expect(ok({ reason: "a".repeat(INTAKE_TEXT_MAX_CHARS + 1) })).toBe(false);
  });

  it("counts characters the way Postgres does - 2000 emoji are 2000, not 4000", () => {
    // char_length counts code points; a UTF-16 `.length` would say 4000 and
    // refuse a text the column accepts.
    expect(ok({ reason: "\u{1F600}".repeat(INTAKE_TEXT_MAX_CHARS) })).toBe(true);
    expect(ok({ reason: "\u{1F600}".repeat(INTAKE_TEXT_MAX_CHARS + 1) })).toBe(false);
  });

  it.each([["   "], [""], [undefined], [null], [42]])("reason %j is refused - it is required", (r) => {
    expect(ok({ reason: r })).toBe(false);
  });

  it.each(["healthConditions", "medication", "fallsAccidents", "surgeries"])(
    "%s: 2000 accepted, 2001 refused, a non-string refused",
    (key) => {
      expect(ok({ [key]: "b".repeat(INTAKE_TEXT_MAX_CHARS) })).toBe(true);
      expect(ok({ [key]: "b".repeat(INTAKE_TEXT_MAX_CHARS + 1) })).toBe(false);
      expect(ok({ [key]: 7 })).toBe(false);
      expect(ok({ [key]: ["a"] })).toBe(false);
    },
  );
});

describe("the consent version on the wire", () => {
  it("the current label is accepted", () => {
    expect(ok({ consentVersion: CURRENT_INTAKE_CONSENT_VERSION })).toBe(true);
  });

  it.each([["rgpd-intake-1999-01-01"], [""], [undefined], [null], [1]])("%j is refused", (v) => {
    expect(ok({ consentVersion: v })).toBe(false);
  });
});

describe("the object itself", () => {
  it.each([[null], [[]], ["intake"], [42], [undefined]])("%j is refused", (raw) => {
    expect(parseGuestIntake(raw, TODAY).ok).toBe(false);
  });

  it("a refusal carries NO reason, field or value - it is `{ ok: false }` and nothing else", () => {
    const r = parseGuestIntake(valid({ pacemaker: "talvez", reason: "Dor cervical" }), TODAY);
    expect(r).toEqual({ ok: false });
  });
});
