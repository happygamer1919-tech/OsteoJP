import { describe, expect, it } from "vitest";
import { newBookingPrefill } from "./new-booking-location";

// AGENDA-NEW-LOC-01: which clinic a hand-opened Nova marcação starts on.
const CB = { id: "loc-cb", label: "OsteoJP (CB)" };
const LV = { id: "loc-lv", label: "OsteoJP (LV)" };

describe("newBookingPrefill (AGENDA-NEW-LOC-01)", () => {
  it("the agenda filtered to LV, LV bookable: the drawer starts on LV", () => {
    expect(newBookingPrefill(LV.id, [CB, LV])).toEqual({ serviceId: null, locationId: LV.id });
  });

  it("the agenda filtered to CB: CB, even when CB is not the first bookable", () => {
    expect(newBookingPrefill(CB.id, [LV, CB])).toEqual({ serviceId: null, locationId: CB.id });
  });

  it("Todas as localizações (no filter): no prefill, the first-bookable default stands", () => {
    expect(newBookingPrefill(null, [CB, LV])).toBeUndefined();
    expect(newBookingPrefill(undefined, [CB, LV])).toBeUndefined();
    expect(newBookingPrefill("", [CB, LV])).toBeUndefined();
  });

  it("a filter clinic this viewer cannot book into: no prefill (STAFF-01, STAFF-02)", () => {
    expect(newBookingPrefill(LV.id, [CB])).toBeUndefined();
  });

  it("no bookable clinic at all: no prefill", () => {
    expect(newBookingPrefill(LV.id, [])).toBeUndefined();
  });

  it("never carries a service: the clinic is the only thing the filter says", () => {
    expect(newBookingPrefill(LV.id, [LV])?.serviceId).toBeNull();
  });
});
