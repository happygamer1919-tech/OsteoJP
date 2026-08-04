/**
 * The token landing page may render date, time and location. Nothing else.
 *
 * Counsel section 7 (docs/rgpd-token-flow.md) permits exactly those three plus
 * the offered action. The reasoning generalises past the service name that
 * prompted it: several service names in this clinic identify a treatment type,
 * and a page whose contents vary by service leaks by omission - so no service
 * name is shown for ANY appointment. A practitioner name carries the same
 * inference wherever practitioners specialise, and it WAS rendered on this page
 * until W13-01.
 *
 * WHY A SOURCE GUARD RATHER THAN A RENDER TEST. The page is an async server
 * component reading a live tenant context; rendering it under vitest would mean
 * mocking the database, the locale resolver and the RSC runtime, and the result
 * would prove that the mocks agree with each other. What actually needs locking
 * is narrower and checkable: the set of ReminderAppointmentData fields this file
 * is allowed to reach for. This is the same technique - and the same
 * comment-stripping discipline - as
 * apps/api/lib/appointments/write-paths.test.ts.
 *
 * PROVEN TO FAIL: re-add `data.practitionerName` to page.tsx and the first case
 * goes red. That is checked in the last case here, which runs the same matcher
 * over a synthetic line to prove the matcher itself is not vacuous - a guard
 * that cannot fail is worse than none, because it reads as protection.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = join(__dirname, "page.tsx");

/**
 * Fields loadReminderData exposes that this page must NEVER render. Contact
 * details and the patient's own name are on the list for the same reason as the
 * clinical ones: anyone holding the link can read the page, including someone
 * looking at a shared phone's lock screen.
 */
const FORBIDDEN = [
  "practitionerName",
  "serviceName",
  "patientName",
  "patientEmail",
  "patientPhone",
  "patientId",
] as const;

/** Strip // and /* *\/ comments. The file DISCUSSES practitionerName at length -
 *  counting prose as a render would train people to dismiss this test, which is
 *  the only way a guard like this really dies. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** A read of `data.<field>` — how the page would actually surface one. */
const readsField = (src: string, field: string): boolean =>
  new RegExp(String.raw`\bdata\.${field}\b`).test(src);

describe("the token landing page renders only what counsel permits", () => {
  const code = stripComments(readFileSync(PAGE, "utf8"));

  it.each(FORBIDDEN)("never reads data.%s", (field) => {
    expect(readsField(code, field)).toBe(false);
  });

  it("does render the three permitted fields", () => {
    // The inverse assertion matters as much: a page that showed nothing would
    // pass every check above and be useless to the patient it exists for.
    expect(readsField(code, "startsAt")).toBe(true);
    expect(readsField(code, "locationName")).toBe(true);
  });

  it("performs no write on render - execution belongs to the confirm POST", () => {
    // Counsel section 7: opening a link performs nothing. If this page ever
    // called the redeemer directly, a mail scanner following the URL would spend
    // the patient's one action for them.
    expect(code).not.toMatch(/redeemActionToken\s*\(/);
  });

  it("the matcher is not vacuous - it detects the defect it exists to catch", () => {
    // The exact line that was on this page before W13-01.
    const regressed = `          value={data.practitionerName}`;
    expect(readsField(stripComments(regressed), "practitionerName")).toBe(true);
    // And it is not fooled by the same text inside a comment.
    expect(
      readsField(stripComments(`// value={data.practitionerName}`), "practitionerName"),
    ).toBe(false);
  });
});
