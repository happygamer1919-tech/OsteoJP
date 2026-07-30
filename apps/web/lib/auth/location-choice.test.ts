/**
 * PL-14 — the implicit-location decision. This is the whole owner CR in one
 * pure function, so it is tested exhaustively: single-location staff get NO
 * control, multi-location staff get a control over their OWN clinics only, and
 * a hand-typed out-of-scope location is never honoured.
 */
import { describe, expect, it } from "vitest";
import { effectiveLocationId, resolveLocationControl, scopedLocationId } from "./location-choice";

const LV = { id: "loc-lv", label: "OsteoJP (LV)" };
const CB = { id: "loc-cb", label: "OsteoJP (CB)" };
const MM = { id: "loc-mm", label: "OsteoJP (MM)" };
const ALL = [LV, CB, MM];

describe("resolveLocationControl (PL-14)", () => {
  it("one assigned location -> fixed, no control (the Lurdes case)", () => {
    expect(resolveLocationControl([LV.id], ALL)).toEqual({ kind: "fixed", location: LV });
  });

  it("several assigned locations -> a picker over ONLY those", () => {
    expect(resolveLocationControl([LV.id, CB.id], ALL)).toEqual({
      kind: "picker",
      options: [LV, CB],
    });
  });

  it("unrestricted viewer (owner / unassigned, scope null) -> the full picker", () => {
    expect(resolveLocationControl(null, ALL)).toEqual({ kind: "picker", options: ALL });
  });

  it("a tenant with a single location -> fixed even for the owner", () => {
    expect(resolveLocationControl(null, [LV])).toEqual({ kind: "fixed", location: LV });
  });

  it("a stale assignment that matches nothing falls back to the full list, never an empty control", () => {
    expect(resolveLocationControl(["loc-deactivated"], ALL)).toEqual({
      kind: "picker",
      options: ALL,
    });
  });

  it("keeps the caller's row shape (label is not the only extra field)", () => {
    const rows = [{ ...LV, isActive: true }, { ...CB, isActive: true }];
    const control = resolveLocationControl([LV.id], rows);
    expect(control).toEqual({ kind: "fixed", location: rows[0] });
  });
});

describe("effectiveLocationId (PL-14 server-side half)", () => {
  const fixed = resolveLocationControl([LV.id], ALL);
  const picker = resolveLocationControl([LV.id, CB.id], ALL);

  it("fixed ignores a hand-typed ?location= for another clinic", () => {
    expect(effectiveLocationId(fixed, CB.id)).toBe(LV.id);
  });

  it("fixed applies its location even with no request at all", () => {
    expect(effectiveLocationId(fixed, null)).toBe(LV.id);
    expect(effectiveLocationId(fixed, undefined)).toBe(LV.id);
  });

  it("picker honours a request for one of its own options", () => {
    expect(effectiveLocationId(picker, CB.id)).toBe(CB.id);
  });

  it("picker drops a request outside its options (falls back to all-of-mine)", () => {
    expect(effectiveLocationId(picker, MM.id)).toBeNull();
  });

  it("picker with no request means all-of-mine", () => {
    expect(effectiveLocationId(picker, null)).toBeNull();
    expect(effectiveLocationId(picker, "")).toBeNull();
  });
});

describe("scopedLocationId (PL-14, scope-only form)", () => {
  it("pins the single assigned location over any request", () => {
    expect(scopedLocationId([LV.id], null)).toBe(LV.id);
    expect(scopedLocationId([LV.id], CB.id)).toBe(LV.id);
  });

  it("keeps an in-scope request for multi-location staff", () => {
    expect(scopedLocationId([LV.id, CB.id], CB.id)).toBe(CB.id);
  });

  it("drops an out-of-scope request instead of honouring it", () => {
    expect(scopedLocationId([LV.id, CB.id], MM.id)).toBeNull();
  });

  it("an unrestricted viewer keeps whatever they asked for", () => {
    expect(scopedLocationId(null, MM.id)).toBe(MM.id);
    expect(scopedLocationId(null, null)).toBeNull();
  });
});
