import { describe, expect, it } from "vitest";

import { classifyNavigation } from "./timing-panel";

/**
 * THE ONE RULE THE PANEL'S HONESTY NOW RESTS ON.
 *
 * ==========================================================================
 * WHY IT IS A PURE FUNCTION AND TESTED HERE RATHER THAN ONLY IN A BROWSER
 * ==========================================================================
 * The e2e arm drives a real soft navigation and asserts the refusal, which is
 * the proof that matters. But the decision itself is a URL comparison with two
 * edge cases that a browser test cannot exercise cheaply and that would each
 * turn the panel back into a liar:
 *
 *   - the HASH. The panel carries `id="medicao"` so it can be linked to, and
 *     following that anchor changes `location.href` and nothing else. Comparing
 *     raw strings would make the panel refuse to report on the very page it had
 *     just been scrolled to - a false refusal, which trains the reader to
 *     ignore refusals.
 *   - an UNPARSEABLE url. It is neither "the same page" nor obviously another
 *     one, and the safe answer on a verdict path is to refuse.
 *
 * WHAT THE DEFECT WAS. `readClientTiming` returned a full reading whenever a
 * navigation entry existed, and after a soft navigation that entry belongs to
 * the PREVIOUS document: the previous page's TTFB, and a "Total sentido" that
 * is the age of the tab. The staff shell navigates with next/link, so a sidebar
 * click produces exactly that - and the number it produces is the same size as
 * the one this project is currently hunting.
 */
describe("classifyNavigation", () => {
  const HERE = "https://app.osteojp.pt/patients";

  it("accepts an entry that describes this exact document", () => {
    expect(classifyNavigation(HERE, HERE)).toBe("document");
  });

  it("accepts it when only the hash differs, which is what the panel's own anchor does", () => {
    expect(classifyNavigation(HERE, `${HERE}#medicao`)).toBe("document");
    expect(classifyNavigation(`${HERE}#medicao`, HERE)).toBe("document");
  });

  it("refuses when the entry belongs to another page - the sidebar-click case", () => {
    expect(classifyNavigation("https://app.osteojp.pt/dashboard", HERE)).toBe("soft-nav");
  });

  it("refuses when only the QUERY differs, because that is a different render", () => {
    // /patients and /patients?page=40 are different server responses with
    // different timings. Treating them as one would report the first load's
    // numbers for the second.
    expect(classifyNavigation(HERE, `${HERE}?page=40`)).toBe("soft-nav");
    expect(classifyNavigation(`${HERE}?location=abc`, HERE)).toBe("soft-nav");
  });

  it("refuses an unparseable url rather than calling it a match", () => {
    expect(classifyNavigation("not a url", HERE)).toBe("soft-nav");
    expect(classifyNavigation(HERE, "not a url")).toBe("soft-nav");
  });

  it("reports no-entry separately from a refusal", () => {
    // A bfcache restore has no entry at all. It is a different fact from "this
    // entry is about another page" and the panel prints a different sentence,
    // so the two must not collapse into one verdict here either.
    expect(classifyNavigation(null, HERE)).toBe("no-entry");
  });
});
