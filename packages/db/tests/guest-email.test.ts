import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_EMAIL_MAX, GUEST_EMAIL_PATTERN, GUEST_EMAIL_UNSAFE, parseGuestEmail } from "../src/guest-email";
import CASES from "./fixtures/guest-email-cases.json";

/**
 * The public form's optional email (0101, strategy ruling R40): the one rule the
 * portal and the API both call.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS. A request whose address this rule
 * admits must be convertible into a patient by the staff app, whose own rule is
 * in apps/web/lib/patients/validation.ts. So the two are compared from SOURCE,
 * not by a copy that could drift with them.
 *
 * THE PUBLIC PATH IS STRICTER, NEVER LOOSER (review of 2026-10-05). The value
 * comes from anybody on the internet, so on top of the staff rule it refuses
 * control and format characters, look-alikes of "@" and ".", and the characters
 * a mail header gives a meaning to. `fixtures/guest-email-cases.json` is the ONE
 * table of values: this file, the API route's suite and the portal's suite all
 * read it, so the client, the server action and the route are held to the same
 * answers.
 */
describe("the guest email rule", () => {
  it("IS THE STAFF APP'S RULE: the same pattern and the same length bound, read from its source", () => {
    const src = readFileSync(join(__dirname, "..", "..", "..", "apps", "web", "lib", "patients", "validation.ts"), "utf8");
    const pattern = /^const EMAIL_RE = \/(.+)\/;$/m.exec(src);
    expect(pattern?.[1], "apps/web/lib/patients/validation.ts no longer declares EMAIL_RE on one line").toBeDefined();
    expect(GUEST_EMAIL_PATTERN.source).toBe(pattern![1]);
    expect(GUEST_EMAIL_PATTERN.flags).toBe("");
    const bound = /optionalText\(v, "email", (\d+)\)/.exec(src);
    expect(Number(bound?.[1])).toBe(GUEST_EMAIL_MAX);
  });

  it("absent, null, empty and whitespace-only all mean NO email, which is not an error", () => {
    for (const none of [undefined, null, "", "   ", "\t\n"]) {
      expect(parseGuestEmail(none)).toEqual({ ok: true, email: null });
    }
  });

  it("admits an ordinary address and trims it", () => {
    expect(parseGuestEmail("guest@example.invalid")).toEqual({ ok: true, email: "guest@example.invalid" });
    expect(parseGuestEmail("  guest@example.invalid \n")).toEqual({ ok: true, email: "guest@example.invalid" });
    expect(parseGuestEmail("First.Last+tag@sub.example.invalid")).toEqual({ ok: true, email: "First.Last+tag@sub.example.invalid" });
  });

  it("NFC: a decomposed spelling and a composed one of the same address are ONE stored string", () => {
    const composed = "a\u00e7\u00e3o.caf\u00e9@exemplo.invalid";
    const decomposed = composed.normalize("NFD");
    // THE PREMISE: the two really are different strings that draw the same.
    expect(decomposed).not.toBe(composed);
    expect(decomposed.length).toBeGreaterThan(composed.length);
    expect(parseGuestEmail(decomposed)).toEqual({ ok: true, email: composed });
    expect(parseGuestEmail(composed)).toEqual({ ok: true, email: composed });
    // Whatever is stored IS in NFC, for every admitted value of the table.
    for (const c of CASES) {
      const r = parseGuestEmail(c.value);
      if (r.ok && r.email !== null) expect(r.email, c.why).toBe(r.email.normalize("NFC"));
    }
  });

  it("the bound is counted on what is STORED: a decomposed value over 320 that composes to 320 passes, and one that composes to 321 does not", () => {
    const tail = "@example.invalid";
    const composed = (n: number): string => `${"\u00e9".repeat(n - tail.length)}${tail}`;
    const typed = composed(GUEST_EMAIL_MAX).normalize("NFD");
    expect(typed.length).toBeGreaterThan(GUEST_EMAIL_MAX);
    expect(parseGuestEmail(typed)).toEqual({ ok: true, email: composed(GUEST_EMAIL_MAX) });
    expect(parseGuestEmail(composed(GUEST_EMAIL_MAX + 1).normalize("NFD"))).toEqual({ ok: false });
  });

  it("the length bound is 320, counted after the trim: 320 passes and 321 does not", () => {
    const at = (n: number): string => `${"a".repeat(n - "@example.invalid".length)}@example.invalid`;
    expect(at(GUEST_EMAIL_MAX)).toHaveLength(320);
    expect(parseGuestEmail(at(GUEST_EMAIL_MAX))).toEqual({ ok: true, email: at(GUEST_EMAIL_MAX) });
    expect(parseGuestEmail(at(GUEST_EMAIL_MAX + 1))).toEqual({ ok: false });
    expect(parseGuestEmail(`  ${at(GUEST_EMAIL_MAX)}  `)).toEqual({ ok: true, email: at(GUEST_EMAIL_MAX) });
  });

  it("refuses every malformed value, and a refusal carries nothing of what it was given", () => {
    const bad: unknown[] = [
      "guest", "guest@", "@example.invalid", "guest@example", "guest@@example.invalid", "guest@example@invalid.pt",
      "guest name@example.invalid", "guest@exam ple.invalid", "guest@example.invalid extra", "guest@.", "a@b.",
    ];
    for (const value of bad) {
      const r = parseGuestEmail(value);
      expect(r, JSON.stringify(value)).toEqual({ ok: false });
      expect(Object.keys(r)).toEqual(["ok"]);
    }
  });

  it("refuses a value that is not a string rather than coercing it", () => {
    for (const value of [1, 0, true, false, {}, [], ["guest@example.invalid"], { email: "guest@example.invalid" }]) {
      expect(parseGuestEmail(value), JSON.stringify(value)).toEqual({ ok: false });
    }
  });

  const staffRule = (): RegExp => {
    const src = readFileSync(join(__dirname, "..", "..", "..", "apps", "web", "lib", "patients", "validation.ts"), "utf8");
    return new RegExp(/^const EMAIL_RE = \/(.+)\/;$/m.exec(src)![1]!);
  };

  it("THE TABLE: every case reads as the table says, and a refusal carries nothing", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
    expect(CASES.filter((c) => c.ok).length).toBeGreaterThanOrEqual(12);
    for (const c of CASES) {
      const r = parseGuestEmail(c.value);
      if (c.ok) expect(r, c.why).toEqual({ ok: true, email: c.stored });
      else {
        expect(r, c.why).toEqual({ ok: false });
        expect(Object.keys(r), c.why).toEqual(["ok"]);
      }
    }
  });

  it("NEVER LOOSER THAN THE STAFF RULE: everything the public rule admits, the staff rule admits", () => {
    const staff = staffRule();
    let admitted = 0;
    for (const c of CASES) {
      const r = parseGuestEmail(c.value);
      if (!r.ok || r.email === null) continue;
      admitted += 1;
      expect(staff.test(r.email), c.why).toBe(true);
      expect(r.email.length, c.why).toBeLessThanOrEqual(GUEST_EMAIL_MAX);
    }
    expect(admitted).toBeGreaterThanOrEqual(12);
  });

  it("STRICTER THAN THE STAFF RULE WHERE IT MUST BE: the staff rule admits these, the public rule does not", () => {
    // THE PREMISE of the extra set: each of these is a value the staff pattern lets through.
    const staff = staffRule();
    for (const value of ["a\u0000b@c.pt", "gu\u0085est@c.pt", "a\u200bb@c.pt", "a\u202eb@c.pt", "a\uff20b@c.pt", "a@b\uff0ept.c", "x<a@b.pt>", "a,b@c.pt"]) {
      expect(staff.test(value), JSON.stringify(value)).toBe(true);
      expect(parseGuestEmail(value), JSON.stringify(value)).toEqual({ ok: false });
    }
  });

  it("EVERY control and format character of Unicode is refused, each one, wherever it stands inside the value", () => {
    // Every code point, so the claim is not about a sample. The category is asked of the
    // engine by a SEPARATE expression from the rule's own.
    const isCcOrCf = /^[\p{Cc}\p{Cf}]$/u;
    let controls = 0;
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue; // surrogates: the next test
      const ch = String.fromCodePoint(cp);
      if (!isCcOrCf.test(ch)) continue;
      controls += 1;
      expect(parseGuestEmail(`a${ch}b@example.invalid`).ok, `U+${cp.toString(16)} in the local part`).toBe(false);
      expect(parseGuestEmail(`ab@exa${ch}mple.invalid`).ok, `U+${cp.toString(16)} in the domain`).toBe(false);
    }
    // 65 controls (Cc) and well over a hundred format characters: the loop measured something.
    expect(controls).toBeGreaterThanOrEqual(200);
  });

  it("every lone surrogate, every private use character and every noncharacter is refused", () => {
    let n = 0;
    const refused = (ch: string, what: string): void => {
      n += 1;
      expect(parseGuestEmail(`a${ch}b@example.invalid`).ok, what).toBe(false);
    };
    for (let cu = 0xd800; cu <= 0xdfff; cu += 1) refused(String.fromCharCode(cu), `lone surrogate ${cu.toString(16)}`);
    for (let cp = 0xe000; cp <= 0xf8ff; cp += 1) refused(String.fromCodePoint(cp), `private use ${cp.toString(16)}`);
    for (const cp of [0xf0000, 0xffffd, 0x100000, 0x10fffd]) refused(String.fromCodePoint(cp), `private use ${cp.toString(16)}`);
    for (let cp = 0xfdd0; cp <= 0xfdef; cp += 1) refused(String.fromCodePoint(cp), `noncharacter ${cp.toString(16)}`);
    for (let plane = 0; plane <= 16; plane += 1) {
      refused(String.fromCodePoint(plane * 0x10000 + 0xfffe), `noncharacter of plane ${plane}`);
      refused(String.fromCodePoint(plane * 0x10000 + 0xffff), `noncharacter of plane ${plane}`);
    }
    expect(n).toBe(2048 + 6400 + 4 + 32 + 34);
    // THE CONTROL: a well-formed pair is a character like any other.
    expect(parseGuestEmail("a\u{1F600}b@example.invalid").ok).toBe(true);
  });

  it("EVERY character whose compatibility form holds a full stop or an at sign is refused, and the two requested by review are among them", () => {
    // Every code point: the claim is that NO look-alike of this kind is left, not that a list was typed in.
    const found: number[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      if (ch === "." || ch === "@") continue;
      const compat = ch.normalize("NFKC");
      if (!compat.includes(".") && !compat.includes("@") && !compat.includes("\u3002")) continue;
      found.push(cp);
      expect(parseGuestEmail(`a${ch}b@example.invalid`).ok, `U+${cp.toString(16)} in the local part`).toBe(false);
      expect(parseGuestEmail(`ab@exa${ch}mple.invalid`).ok, `U+${cp.toString(16)} in the domain`).toBe(false);
    }
    // 36 in Unicode 16 and 17. A later version that adds one fails the loop above, not this line.
    expect(found.length).toBeGreaterThanOrEqual(36);
    for (const cp of [0xfe52, 0x2024, 0xff0e, 0xff61, 0x3002, 0xff20, 0xfe6b, 0x2026, 0x2488, 0x1f100]) expect(found, `U+${cp.toString(16)}`).toContain(cp);
    // Drawn as a dot on the baseline, though no compatibility form says so.
    for (const cp of [0x0701, 0x0702, 0xa60e, 0x10a50, 0x1d16d]) {
      expect(parseGuestEmail(`ab@exa${String.fromCodePoint(cp)}mple.invalid`).ok, `U+${cp.toString(16)}`).toBe(false);
    }
    // LEFT ACCEPTED ON PURPOSE: raised dots, and digits of a living script that some fonts draw as a dot.
    for (const cp of [0x00b7, 0x0387, 0x2027, 0x2219, 0x22c5, 0x30fb, 0x0660, 0x06f0]) {
      expect(parseGuestEmail(`a${String.fromCodePoint(cp)}b@example.invalid`).ok, `U+${cp.toString(16)}`).toBe(true);
    }
  });

  it("the look-alikes and the mail-header characters are refused one by one, and ordinary punctuation is not", () => {
    for (const ch of ["\ufffd", "\ufffc", "\uff20", "\ufe6b", "\u3002", "\uff0e", "\uff61", "(", ")", "<", ">", "[", "]", ":", ";", ",", "\\", '"']) {
      expect(parseGuestEmail(`a${ch}b@example.invalid`).ok, `U+${ch.codePointAt(0)!.toString(16)}`).toBe(false);
      expect(GUEST_EMAIL_UNSAFE.test(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(true);
    }
    for (const ch of "+-_'!#$%&*/=?^`{|}~.") {
      expect(parseGuestEmail(`a${ch}b@example.invalid`).ok, ch).toBe(true);
    }
    // Letters of any script, and a combining mark, are not "unsafe".
    for (const ch of ["\u00e9", "\u00e7", "\u0301", "\u7528", "\u0430", "\u05d0"]) {
      expect(GUEST_EMAIL_UNSAFE.test(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(false);
    }
  });
});
