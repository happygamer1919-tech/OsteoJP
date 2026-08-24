import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeClinicalAudit: vi.fn(), clientIp: vi.fn() }));

import {
  TERMS_VERSION,
  TEXTED_TERMS_VERSIONS,
  TEXTLESS_TERMS_VERSIONS,
} from "./terms-acceptance";

/**
 * LE-terms-version-label-collision-guard.
 *
 * ==========================================================================
 * THE MACHINE HALF OF A HUMAN INSTRUCTION
 * ==========================================================================
 * The owner is telling JP not to label his document "2026-08". That is the
 * right instruction and it is the kind people forget, so this is the half that
 * does not.
 *
 * WHAT GOES WRONG IF IT IS FORGOTTEN. Acceptances have been recorded under
 * "2026-08" with NO document text ever existing for it. A returned document
 * bearing that label retroactively turns every one of those rows into a claim
 * that the patient accepted text that did not exist when the box was ticked -
 * and migration 0058 REVOKEs UPDATE/DELETE/TRUNCATE, so the rows CANNOT BE
 * CORRECTED afterwards.
 *
 * ==========================================================================
 * WHY THIS DOES NOT GUARD `TERMS_VERSION` CHANGES, WHICH IS THE OBVIOUS SHAPE
 * ==========================================================================
 * "Fail if TERMS_VERSION is set to an already-used label" WOULD NEVER FIRE FOR
 * THE CASE THAT MATTERS. "2026-08" is already the value: a document arriving
 * under that name needs NO CODE CHANGE, so the collision would land in total
 * silence behind a clean diff and a green build.
 *
 * The event that CAN be watched is somebody declaring that a label now has
 * text. That is what these assertions sit on.
 */
describe("a terms label may never gain text after acceptances were recorded without it", () => {
  it("the two lists NEVER intersect - this is the guard", () => {
    // THE ONE THAT MATTERS. Adding "2026-08" to TEXTED turns this red, with
    // the reasoning attached, at the exact moment somebody would otherwise
    // bind JP's text to a label patients already accepted blind.
    const collisions = TEXTED_TERMS_VERSIONS.filter((v) =>
      (TEXTLESS_TERMS_VERSIONS as readonly string[]).includes(v),
    );
    expect(
      collisions,
      `A label cannot gain text after the fact. ${JSON.stringify(collisions)} was ` +
        `accepted by patients while NO text existed for it, and 0058 makes those rows ` +
        `uncorrectable. RELABEL THE DOCUMENT - do not edit these lists.`,
    ).toEqual([]);
  });

  it("TERMS_VERSION is in exactly one list, so its state is never ambiguous", () => {
    // A label in neither is untracked, and untracked is how it slips into
    // TEXTED later without anybody noticing which kind it was.
    const inTextless = (TEXTLESS_TERMS_VERSIONS as readonly string[]).includes(TERMS_VERSION);
    const inTexted = TEXTED_TERMS_VERSIONS.includes(TERMS_VERSION);
    expect(
      [inTextless, inTexted].filter(Boolean).length,
      `TERMS_VERSION "${TERMS_VERSION}" must appear in EXACTLY ONE of ` +
        `TEXTLESS_TERMS_VERSIONS or TEXTED_TERMS_VERSIONS.`,
    ).toBe(1);
  });

  it("records the CURRENT state of the world: 2026-08 has no text", () => {
    // A positive control. Every other assertion here is of the form "these do
    // not overlap", and two empty lists satisfy all of them perfectly while
    // recording nothing at all.
    expect(TEXTLESS_TERMS_VERSIONS).toContain("2026-08");
    expect(TERMS_VERSION).toBe("2026-08");
  });

  it("records the label JP's document will carry, and it is NOT 2026-08", () => {
    // OWNER RULING 2026-08-24: JP confirmed version 1, the discretionary
    // wording, and the label is "condicoes-v1-2026". Asserted by NAME rather
    // than by length, because "TEXTED has one entry" would stay green if the
    // entry were "2026-08" - the exact collision this file exists to refuse.
    expect(TEXTED_TERMS_VERSIONS).toEqual(["condicoes-v1-2026"]);
    expect(TEXTED_TERMS_VERSIONS).not.toContain("2026-08");
  });

  it("TERMS_VERSION has NOT yet been moved to the new label", () => {
    // The switch is its own card and waits for JP's text to land. Moving it
    // early would record acceptances against a label whose document nobody can
    // produce - the same defect one step to the left. This assertion goes red
    // the day somebody moves it, which is when that card should be doing it.
    expect(TERMS_VERSION).toBe("2026-08");
    expect(TEXTLESS_TERMS_VERSIONS).toContain(TERMS_VERSION);
  });

  it("neither list carries a blank or untrimmed label", () => {
    // 0058 already CHECKs btrim(terms_version) <> '' at the table. This is the
    // same rule one layer up, so a blank is refused before it can be written
    // rather than by a constraint violation at insert time.
    for (const v of [...TEXTLESS_TERMS_VERSIONS, ...TEXTED_TERMS_VERSIONS]) {
      expect(v).toBe(v.trim());
      expect(v).not.toBe("");
    }
  });

  it("neither list repeats a label", () => {
    // A duplicate inside TEXTLESS would make the intersection check pass while
    // the ledger described the same label twice with no agreement about it.
    for (const list of [TEXTLESS_TERMS_VERSIONS, TEXTED_TERMS_VERSIONS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
