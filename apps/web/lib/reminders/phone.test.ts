import { describe, expect, it } from "vitest";
import { normalizePhonePT } from "./phone";

// Table-driven proof of normalizePhonePT. Valid rows cover every accepted
// input shape (bare subscriber, +351, 00351, bare 351, separator noise);
// invalid rows cover garbage, wrong lengths, non-PT country codes, and
// non-subscriber leading digits.

describe("normalizePhonePT — valid PT formats normalize to E.164", () => {
  const VALID: ReadonlyArray<[input: string, expected: string]> = [
    // bare 9-digit subscriber
    ["912345678", "+351912345678"],
    ["212345678", "+351212345678"], // geographic (landline)
    // spaces / dashes / dots / parentheses stripped
    ["912 345 678", "+351912345678"],
    ["9 1 2 3 4 5 6 7 8", "+351912345678"],
    ["912-345-678", "+351912345678"],
    ["912.345.678", "+351912345678"],
    ["(912) 345 678", "+351912345678"],
    // already E.164
    ["+351912345678", "+351912345678"],
    ["+351 912 345 678", "+351912345678"],
    ["+351-212-345-678", "+351212345678"],
    // international 00 prefix
    ["00351912345678", "+351912345678"],
    ["00351 912 345 678", "+351912345678"],
    // country code without + or 00
    ["351912345678", "+351912345678"],
    ["351 212 345 678", "+351212345678"],
  ];

  for (const [input, expected] of VALID) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(normalizePhonePT(input)).toBe(expected);
    });
  }
});

describe("normalizePhonePT — anything else is rejected (null)", () => {
  const INVALID: ReadonlyArray<[label: string, input: string]> = [
    ["empty string", ""],
    ["whitespace only", "   "],
    ["letters", "not-a-phone"],
    ["digits with letters", "912345678 ext 2"],
    ["too short", "91234567"],
    ["too long", "9123456789"],
    ["+351 with 8-digit subscriber", "+35191234567"],
    ["+351 with 10-digit subscriber", "+3519123456789"],
    ["00351 with bad length", "0035191234567"],
    ["non-PT country code (UK)", "+441234567890"],
    ["non-PT country code (ES)", "0034912345678"],
    ["subscriber starting with 1", "112345678"],
    ["subscriber starting with 8", "812345678"],
    ["+351 subscriber starting with 3", "+351312345678"],
    ["double plus", "++351912345678"],
    ["plus in the middle", "00+351912345678"],
    ["bare country code only", "351"],
    ["00351 only", "00351"],
  ];

  for (const [label, input] of INVALID) {
    it(`${label}: ${JSON.stringify(input)} → null`, () => {
      expect(normalizePhonePT(input)).toBeNull();
    });
  }
});
