import { describe, expect, it } from "vitest";

import { NOTE_PREVIEW_MAX_CHARS, noteExcerpt } from "./preview";

/**
 * The excerpt rule, pinned in both directions.
 *
 * THE ASSERTIONS THAT MATTER ARE THE ABSENCES. "No notes means render nothing,
 * not an empty affordance" is a rule about what the row does NOT draw, and a
 * function that returned `""` for a blank note would satisfy every positive
 * assertion here while putting an empty box on fifty rows.
 */
describe("noteExcerpt", () => {
  it("returns null for every shape of nothing", () => {
    // Four different absences that must all collapse to the same answer, so a
    // caller has ONE case to handle rather than four.
    for (const nothing of [null, undefined, "", "   ", "\n\n\t "]) {
      expect(noteExcerpt(nothing as string | null | undefined), String(JSON.stringify(nothing))).toBeNull();
    }
  });

  it("returns a short note unchanged and NOT truncated", () => {
    const r = noteExcerpt("Ligou a cancelar. Volta a contactar.");
    expect(r).toEqual({ text: "Ligou a cancelar. Volta a contactar.", truncated: false });
  });

  it("flattens newlines to single spaces so a row stays one row", () => {
    const r = noteExcerpt("Ligou a cancelar.\n\nDisse que\ttelefona ele.");
    expect(r?.text).toBe("Ligou a cancelar. Disse que telefona ele.");
    expect(r?.text).not.toContain("\n");
  });

  it("does not truncate a note of EXACTLY the limit", () => {
    // The boundary, from the other side: an off-by-one here would put an
    // ellipsis on a note that is complete, which is a claim that there is more.
    const exact = "a".repeat(NOTE_PREVIEW_MAX_CHARS);
    expect(noteExcerpt(exact)).toEqual({ text: exact, truncated: false });
  });

  it("truncates one character over the limit, and SAYS it truncated", () => {
    const over = "a".repeat(NOTE_PREVIEW_MAX_CHARS + 1);
    const r = noteExcerpt(over);
    expect(r?.truncated).toBe(true);
    expect(r!.text.length).toBeLessThanOrEqual(NOTE_PREVIEW_MAX_CHARS);
  });

  it("cuts at a word boundary when one is close enough", () => {
    const words = `${"palavra ".repeat(40)}fim`;
    const r = noteExcerpt(words);
    expect(r?.truncated).toBe(true);
    // A boundary cut never ends mid-word and never ends in a space.
    expect(r!.text.endsWith("palavra")).toBe(true);
    expect(r!.text.endsWith(" ")).toBe(false);
  });

  it("falls back to the HARD cut when the only boundary is too early", () => {
    // A note that is one enormous token after a short first word: cutting at
    // the boundary would throw away almost the whole excerpt, so the rule is a
    // preference and not an obligation.
    const r = noteExcerpt(`ok ${"x".repeat(NOTE_PREVIEW_MAX_CHARS * 2)}`);
    expect(r?.truncated).toBe(true);
    expect(r!.text.length).toBe(NOTE_PREVIEW_MAX_CHARS);
    expect(r!.text.startsWith("ok x")).toBe(true);
  });

  it("never reports `truncated` from the text length alone", () => {
    // The two answers of the same length, one cut and one not. A caller that
    // derived the flag from `text.length === NOTE_PREVIEW_MAX_CHARS` would get
    // the first of these wrong.
    const exact = noteExcerpt("b".repeat(NOTE_PREVIEW_MAX_CHARS));
    const cut = noteExcerpt(`ok ${"x".repeat(NOTE_PREVIEW_MAX_CHARS * 2)}`);
    expect(exact!.text.length).toBe(NOTE_PREVIEW_MAX_CHARS);
    expect(cut!.text.length).toBe(NOTE_PREVIEW_MAX_CHARS);
    expect(exact!.truncated).toBe(false);
    expect(cut!.truncated).toBe(true);
  });
});
