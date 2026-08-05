/**
 * W13-03 — the three pt-PT degradation copies. PG1.
 *
 * LOOP 3 step 8 names them exactly: the patient has NO PHONE on record, the
 * number on record is a LANDLINE, and the number is SHARED with another
 * patient. "Each states what the patient should do (telephone the clinic),
 * never a raw error."
 *
 * WHY THEY ARE TESTED AT ALL. These strings are the only thing a locked-out
 * patient ever sees, and WF-07 is deliberately fail-closed, so they will be
 * seen by real people who did nothing wrong. A raw error or an English
 * fallback there is the difference between a phone call and a lost patient.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const pt = JSON.parse(
  readFileSync(join(__dirname, "../../../../packages/i18n/src/portal/strings.pt.json"), "utf8"),
) as { auth: Record<string, string> };

const DEGRADATIONS = ["otp_no_phone", "otp_landline", "otp_shared_number"] as const;

describe("the three degradation copies exist and tell the patient what to do", () => {
  it.each(DEGRADATIONS)("%s names the clinic as the next step", (key) => {
    const s = pt.auth[key];
    expect(s).toBeTruthy();
    // Not "contains the word clinic" for its own sake: the whole requirement is
    // that a dead end is never presented without an exit.
    expect(s.toLowerCase()).toContain("clínica");
  });

  it.each(DEGRADATIONS)("%s is pt-PT prose, not an error code", (key) => {
    const s = pt.auth[key];
    expect(s).not.toMatch(/error|failed|null|undefined|\b[A-Z_]{4,}\b/);
    expect(s.length).toBeGreaterThan(30);
  });

  it("distinguishes the three causes, because the remedy differs", () => {
    // These are NOT the enumeration-sensitive refusals - those live in otp.ts
    // and patient-linkage.ts and stay identical. These are shown to a patient
    // the clinic has ALREADY identified, where being specific is the point:
    // "register a mobile" and "your number cannot receive SMS" send them to the
    // clinic with different information.
    const all = DEGRADATIONS.map((k) => pt.auth[k]);
    expect(new Set(all).size).toBe(3);
  });
});

describe("the generic refusal stays generic", () => {
  it("names no predicate, so it cannot become an enumeration oracle", () => {
    const s = pt.auth.otp_refused;
    expect(s).toBeTruthy();
    for (const leak of ["não existe", "nao existe", "vários", "varios", "já", "duplicad"]) {
      expect(s.toLowerCase()).not.toContain(leak);
    }
  });

  it("the sent confirmation reveals nothing about whether the number is known", () => {
    // "Se o número estiver registado" - conditional on purpose. The endpoint
    // answers 204 either way; the copy must not undo that.
    expect(pt.auth.otp_sent.toLowerCase()).toContain("se o número estiver registado");
  });
});
