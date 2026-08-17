import { describe, it, expect } from "vitest";

import { bookingDeepLink, pressAction } from "./guest-convert-handoff";

/**
 * GUEST-06 — the two client rules of the convert.
 *
 * These exist because the component they came out of cannot be driven: this repo
 * renders with `renderToStaticMarkup` and has no DOM harness, so a branch inside
 * an `onClick` and a URL built inline are both unreachable from a test. Pulling
 * them into functions is what makes the assertions below possible at all.
 */

describe("pressAction - a flagged row asks before it converts", () => {
  it("converts directly when NOTHING matches", () => {
    // The ordinary case, and the one that must stay one press: reception should
    // not answer a question that has no alternatives.
    expect(pressAction(0)).toEqual({ kind: "convert_new" });
  });

  it("ASKS when one patient matches", () => {
    expect(pressAction(1)).toEqual({ kind: "ask" });
  });

  it("ASKS when several match, which is the case that must never guess", () => {
    // 0062: resolvePatientByProvenPhone REFUSES on several rather than picking.
    expect(pressAction(3)).toEqual({ kind: "ask" });
    expect(pressAction(50)).toEqual({ kind: "ask" });
  });

  it("ASKS on a negative count rather than treating it as 'no matches'", () => {
    // Unreachable through the product today. It is asserted because the failure
    // direction is what matters: `possiblePatientMatches !== 0` and
    // `possiblePatientMatches > 0` read identically and differ exactly here, and
    // the second one converts silently on a corrupted prop.
    expect(pressAction(-1)).toEqual({ kind: "ask" });
  });
});

describe("bookingDeepLink - the four param names the agenda reads back", () => {
  const link = bookingDeepLink("p-1", {
    serviceId: "svc-1",
    locationId: "loc-lv",
    date: "2026-08-21",
  });

  it("targets the agenda's create drawer", () => {
    expect(link.startsWith("/agenda?")).toBe(true);
  });

  it.each([
    ["novaMarcacaoPaciente", "p-1"],
    ["novaMarcacaoServico", "svc-1"],
    ["novaMarcacaoLocal", "loc-lv"],
    ["date", "2026-08-21"],
  ])("carries %s", (key, value) => {
    // ASSERTED LITERALLY, BY NAME. These four strings are a contract with
    // agenda/page.tsx, which reads them off `searchParams`. A rename on either
    // side does not throw and does not blank the screen - the drawer opens on
    // its defaults, which looks exactly like a working booking form. Nothing
    // else in the system would report it.
    const params = new URL(link, "https://x").searchParams;
    expect(params.get(key)).toBe(value);
  });

  it("opens the DAY view, because reception is placing one appointment on a known date", () => {
    expect(new URL(link, "https://x").searchParams.get("view")).toBe("day");
  });

  it("carries NO time, because the guest never chose one", () => {
    // GUEST-04 Option A: the stored window encodes a date and a PERIOD. A time
    // in this link would be an invention, rendered in the field reception is
    // there to decide - the same class of false precision the queue's
    // "Preferência" label exists to prevent.
    const params = new URL(link, "https://x").searchParams;
    expect(params.get("time")).toBeNull();
    expect(link).not.toContain("09:00");
  });

  it("escapes values rather than concatenating them into the query", () => {
    const odd = bookingDeepLink("p&x=1", {
      serviceId: "s 1",
      locationId: "l#1",
      date: "2026-08-21",
    });
    const params = new URL(odd, "https://x").searchParams;
    expect(params.get("novaMarcacaoPaciente")).toBe("p&x=1");
    expect(params.get("novaMarcacaoServico")).toBe("s 1");
    expect(params.get("novaMarcacaoLocal")).toBe("l#1");
  });
});
