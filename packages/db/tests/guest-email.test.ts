import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_EMAIL_MAX, GUEST_EMAIL_PATTERN, parseGuestEmail } from "../src/guest-email";

/**
 * The public form's optional email (0101, strategy ruling R40): the one rule the
 * portal and the API both call.
 *
 * THE FIRST TEST IS THE ONE THAT MATTERS. A request whose address this rule
 * admits must be convertible into a patient by the staff app, whose own rule is
 * in apps/web/lib/patients/validation.ts. So the two are compared from SOURCE,
 * not by a copy that could drift with them.
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
});
