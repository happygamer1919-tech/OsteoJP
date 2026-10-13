/**
 * survey-code.test.ts: SAT-01. THE SURVEY CODE AND THE CONFIRM CODE SHARE ONE
 * KEY AND CANNOT STAND IN FOR EACH OTHER, IN EITHER DIRECTION.
 *
 * The ruling: the survey code is keyed on the confirm-code secret with a
 * `survey:` prefix, and no new secret. What that must not buy is a code of one
 * kind being accepted as the other. This file proves the half that is
 * arithmetic: the two hashes of one code differ, and the only input that could
 * make them equal is refused on both sides before it is hashed. The half that
 * is the database's (a live code of each kind presented at the other's door)
 * is in survey-page.db.test.ts.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONFIRM_CODE_SECRET_VAR,
  generateConfirmCode,
  hashConfirmCode,
  isWellFormedConfirmCode,
} from "@/lib/reminders/confirm-code";
import {
  SURVEY_CODE_DOMAIN,
  SURVEY_CODE_LENGTH,
  generateSurveyCode,
  hashSurveyCode,
  isWellFormedSurveyCode,
} from "./survey-code";

const SECRET = "survey-code-test-key";
const env = { [CONFIRM_CODE_SECRET_VAR]: SECRET };

describe("the survey code's shape", () => {
  it("is eight base64url characters, the confirm code's shape", () => {
    expect(SURVEY_CODE_LENGTH).toBe(8);
    for (let i = 0; i < 200; i++) {
      const code = generateSurveyCode();
      expect(code).toMatch(/^[A-Za-z0-9_-]{8}$/);
      expect(isWellFormedSurveyCode(code)).toBe(true);
    }
  });

  it("refuses every other shape", () => {
    for (const bad of ["", "ABCDEFG", "ABCDEFGHI", "ABCD EFG", "ABCDEFG:", "ABCDEFG/", "survey:ABCDEFGH"]) {
      expect(isWellFormedSurveyCode(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("the stored hash", () => {
  it("is the HMAC of `survey:` plus the code, under the confirm-code key, and no other key", () => {
    const code = "Ab3_dE-9";
    const expected = createHmac("sha256", SECRET).update(`survey:${code}`).digest("hex");
    expect(SURVEY_CODE_DOMAIN).toBe("survey:");
    expect(hashSurveyCode(code, env)).toBe(expected);
    expect(hashSurveyCode(code, env)).toMatch(/^[0-9a-f]{64}$/);
    // CONTROL: the key matters. The same code under another key is another hash.
    expect(hashSurveyCode(code, { [CONFIRM_CODE_SECRET_VAR]: "another-key" })).not.toBe(expected);
  });

  it("throws without the key, and names the variable, never a value", () => {
    expect(() => hashSurveyCode("Ab3_dE-9", {})).toThrow(CONFIRM_CODE_SECRET_VAR);
    expect(() => hashSurveyCode("Ab3_dE-9", { [CONFIRM_CODE_SECRET_VAR]: "   " })).toThrow();
  });
});

describe("a survey code is never a confirm code, and a confirm code is never a survey code", () => {
  it("one code hashes to two different values, one per kind", () => {
    // The same eight characters presented at the two doors are looked up under
    // two different hashes, so a row of one kind is never found by the other.
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateConfirmCode();
      const asConfirm = hashConfirmCode(code, env);
      const asSurvey = hashSurveyCode(code, env);
      expect(asSurvey).not.toBe(asConfirm);
      seen.add(asConfirm);
      seen.add(asSurvey);
    }
    // CONTROL: the comparison can see equality. 500 codes, 1000 distinct hashes.
    expect(seen.size).toBe(1000);
  });

  it("DIRECTION 1: the one string whose confirm hash equals a survey hash is not a confirm code", () => {
    // HMAC(key, "survey:" + code) is, by construction, the confirm hash of the
    // fifteen characters "survey:XXXXXXXX". The premise is asserted, so the
    // refusal below is a refusal of the input that matters.
    const code = generateSurveyCode();
    const collider = `${SURVEY_CODE_DOMAIN}${code}`;
    expect(hashConfirmCode(collider, env)).toBe(hashSurveyCode(code, env));
    // It has the wrong length and a character outside the alphabet, so every
    // path that takes a confirm code from outside refuses it before hashing.
    expect(isWellFormedConfirmCode(collider)).toBe(false);
    expect(collider).toHaveLength(15);
    expect(collider).toContain(":");
    // And no generated confirm code can ever be that string.
    for (let i = 0; i < 500; i++) expect(generateConfirmCode()).not.toContain(":");
  });

  it("DIRECTION 2: no survey input hashes to a confirm hash, because only `survey:` plus a code is ever hashed", () => {
    // For a survey hash to equal the confirm hash of a real confirm code, the
    // hashed text would have to BE that eight-character code. This module puts
    // `survey:` in front of everything it hashes and refuses anything that is
    // not a well-formed code, so the hashed text is always fifteen characters.
    const confirm = generateConfirmCode();
    const confirmHash = hashConfirmCode(confirm, env);
    expect(hashSurveyCode(confirm, env)).not.toBe(confirmHash);
    // The inputs that would undo the prefix are refused, not hashed.
    for (const attempt of ["", `${SURVEY_CODE_DOMAIN}${confirm}`, confirm.slice(0, 1), `${confirm}${confirm}`]) {
      expect(() => hashSurveyCode(attempt, env), JSON.stringify(attempt)).toThrow(/not a well-formed code/);
    }
  });

  it("the refusal never prints the value it refused", () => {
    const secretLooking = "survey:Zz9_zZ-0";
    let message = "";
    try {
      hashSurveyCode(secretLooking, env);
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("Zz9_zZ-0");
  });
});
