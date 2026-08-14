import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({ applyAlternatingWeeksAction: vi.fn() }));

import { AlternatingWeeksPanel } from "./AlternatingWeeksPanel";

/**
 * ITEM 5 - THE PANEL MUST RENDER WITH NO PROVIDER ABOVE IT.
 *
 * The first draft of this panel called `useToast`, which THROWS unless a
 * <ToastProvider> is an ancestor. The agenda has one; /horarios does not. So the
 * panel threw during render and reproduced the exact STAFF-05 symptom - a black
 * "Application error" page - on the very surface STAFF-05 had just fixed.
 *
 * It was caught by e2e/horarios-renders-per-role.spec.ts, the spec STAFF-05
 * added for this failure mode, which is the system working. But a browser is an
 * expensive way to learn that a component needs a context nobody gives it, and
 * the feedback arrived ten minutes after the push.
 *
 * THIS FILE RENDERS THE PANEL WITH NOTHING AROUND IT. Any hook that requires a
 * provider throws here, in milliseconds, at the moment the import is written.
 */
const LOCATIONS = [
  { id: "loc-cb", name: "Castelo Branco" },
  { id: "loc-lv", name: "Linda-a-Velha" },
];

describe("AlternatingWeeksPanel - renders standalone", () => {
  it("renders with NO provider of any kind above it", () => {
    // The assertion is that this call does not throw. Kept explicit rather than
    // implied by a later expect(), so the failure names the real problem.
    expect(() =>
      renderToStaticMarkup(
        <AlternatingWeeksPanel therapistId="t-1" therapistName="JP" locations={LOCATIONS} />,
      ),
    ).not.toThrow();
  });

  it("offers the entry point when the tenant has two clinics", () => {
    const html = renderToStaticMarkup(
      <AlternatingWeeksPanel therapistId="t-1" therapistName="JP" locations={LOCATIONS} />,
    );
    expect(html).toContain("alt-weeks-open");
  });

  it("NEGATIVE ARM: renders NOTHING when the tenant has one clinic", () => {
    // An alternating pattern is unexpressable with one location, so the control
    // is absent rather than present-and-refused.
    const html = renderToStaticMarkup(
      <AlternatingWeeksPanel
        therapistId="t-1"
        therapistName="JP"
        locations={[LOCATIONS[0]!]}
      />,
    );
    expect(html).toBe("");
  });

  it("NEGATIVE ARM: renders nothing with no clinics at all", () => {
    const html = renderToStaticMarkup(
      <AlternatingWeeksPanel therapistId="t-1" therapistName="JP" locations={[]} />,
    );
    expect(html).toBe("");
  });
});
