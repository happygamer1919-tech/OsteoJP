import { describe, expect, it } from "vitest";
import { isForeignFrameEvent } from "./extension-noise";

const ev = (...frameSets: Array<Array<{ filename?: string; abs_path?: string }>>) => ({
  exception: { values: frameSets.map((frames) => ({ stacktrace: { frames } })) },
});

/**
 * OBS-02. The filter's whole design is that it FAILS OPEN, so most of these
 * assert that something is KEPT. A filter on an error channel that silently
 * drops a real error is worse than the noise it removes.
 */
describe("isForeignFrameEvent - drops only what is provably not ours", () => {
  it("drops an event whose every frame is injected extension code", () => {
    expect(isForeignFrameEvent(ev([{ filename: "https://app.osteojp.pt/executors/200.js" }]))).toBe(true);
  });

  it("drops chrome-extension frames", () => {
    expect(isForeignFrameEvent(ev([{ filename: "chrome-extension://abcdef/inject.js" }]))).toBe(true);
  });

  it("KEEPS an event with any frame under /_next/", () => {
    expect(
      isForeignFrameEvent(
        ev([{ filename: "https://app.osteojp.pt/_next/static/chunks/app/page-abc.js" }]),
      ),
    ).toBe(false);
  });

  it("KEEPS an event where extension frames sit ABOVE one of ours", () => {
    // An extension that wraps one of our callbacks puts its frame on top. The
    // event is still about our code, which is why the predicate asks whether
    // ANY frame is ours rather than looking only at the top one.
    expect(
      isForeignFrameEvent(
        ev([
          { filename: "https://app.osteojp.pt/executors/200.js" },
          { filename: "https://app.osteojp.pt/_next/static/chunks/main.js" },
        ]),
      ),
    ).toBe(false);
  });

  it("KEEPS an event with no exception values (captureMessage, transactions)", () => {
    expect(isForeignFrameEvent({})).toBe(false);
    expect(isForeignFrameEvent({ exception: { values: [] } })).toBe(false);
  });

  it("KEEPS an event with no stacktrace - cross-origin 'Script error.' has none", () => {
    expect(isForeignFrameEvent({ exception: { values: [{}] } })).toBe(false);
  });

  it("KEEPS an event whose frames carry no usable path", () => {
    expect(isForeignFrameEvent(ev([{}, { filename: "" }]))).toBe(false);
  });

  it("reads abs_path when filename is absent", () => {
    expect(isForeignFrameEvent(ev([{ abs_path: "https://x/_next/static/y.js" }]))).toBe(false);
    expect(isForeignFrameEvent(ev([{ abs_path: "https://x/evil.js" }]))).toBe(true);
  });

  it("keeps the event when ONE of several exception values is ours", () => {
    expect(
      isForeignFrameEvent(
        ev([{ filename: "https://x/executors/200.js" }], [{ filename: "https://x/_next/a.js" }]),
      ),
    ).toBe(false);
  });
});
