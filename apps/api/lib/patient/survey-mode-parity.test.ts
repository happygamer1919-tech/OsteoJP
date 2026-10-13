/**
 * SAT-01: the survey switch has two homes, and they must be one file.
 *
 * WHY THIS TEST EXISTS. `apps/web/lib/reminders/survey-mode.ts` decides whether
 * the satisfaction survey exists in a deployment and for which patient. The
 * staff screens and both sends read it there. The patient's own switch is
 * served by this application, which is a separate Next application with a
 * separate build and may not import the other's source, so
 * `lib/patient/survey-mode.ts` here is a copy.
 *
 * THE FAILURE IT PREVENTS IS SILENT. Loosen one copy (trim the value, accept
 * `ON`) and nothing breaks at build time: the portal would simply show a
 * patient a switch for a survey the staff application still treats as off, or
 * the reverse.
 *
 * SO THE COPY IS BYTE FOR BYTE, comments included, and this test compares the
 * bytes. A change to the rule is made in both files in the same commit, or this
 * is red. It reads the other application's source from disk on purpose: if that
 * file is moved or renamed, this fails rather than passing on a stale
 * assumption.
 *
 * THE TWO DEPLOYMENTS STILL NEED THE SAME VALUES. This test holds the rule
 * equal; it cannot hold SURVEY_SEND_MODE and SURVEY_CANARY_PATIENT_IDS equal
 * between the two Vercel projects. Whoever sets one sets the other.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const HERE = join(__dirname, "survey-mode.ts");
const WEB = join(__dirname, "..", "..", "..", "web", "lib", "reminders", "survey-mode.ts");

describe("the survey switch module is shared with the staff application", () => {
  it("both files are where this test expects them", () => {
    expect(existsSync(HERE)).toBe(true);
    expect(existsSync(WEB)).toBe(true);
  });

  it("the copy is the original, byte for byte", () => {
    const here = readFileSync(HERE);
    const web = readFileSync(WEB);
    // Not a vacuous pass: the file is the switch, not an empty stub.
    expect(here.toString("utf8")).toContain("export function surveyAppliesTo");
    expect(here.equals(web)).toBe(true);
  });
});
