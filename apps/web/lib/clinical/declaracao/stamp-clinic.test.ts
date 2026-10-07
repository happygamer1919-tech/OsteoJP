import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { signatureStampBytesForLocation } from "./signature-stamp-asset";
import { resolveStampClinicKey, stampClinicCity } from "./stamp-clinic";

// R45 (strategy, 2026-10-06). The clinic's rows are named "OsteoJP (LV)" and
// "OsteoJP (CB)"; before this resolver those names matched no carimbo, and no
// test used one. Every name below is a location NAME, never a person's.

const same = (a: Uint8Array | null, b: Uint8Array | null): boolean =>
  a !== null && b !== null && Buffer.from(a).equals(Buffer.from(b));

describe("resolveStampClinicKey - the plain name, as before", () => {
  it.each([
    ["Linda-a-Velha", "linda-a-velha"],
    ["linda a velha", "linda-a-velha"],
    ["  LINDA-A-VELHA ", "linda-a-velha"],
    ["Castelo Branco", "castelo-branco"],
    ["CASTELO BRANCO", "castelo-branco"],
  ])("%s -> %s", (name, key) => {
    expect(resolveStampClinicKey(name)).toBe(key);
  });
});

describe("resolveStampClinicKey - the brand and a short code", () => {
  it.each([
    ["OsteoJP (LV)", "linda-a-velha"],
    ["OsteoJP (CB)", "castelo-branco"],
    // Case and surrounding spaces are tolerated, as in the portal's rule.
    ["osteojp (lv)", "linda-a-velha"],
    ["OSTEOJP (cb)", "castelo-branco"],
    ["  OsteoJP (LV)  ", "linda-a-velha"],
    [" OsteoJP(CB) ", "castelo-branco"],
  ])("%s -> %s", (name, key) => {
    expect(resolveStampClinicKey(name)).toBe(key);
  });

  it("each short code is its OWN clinic: LV is never Castelo Branco, CB never Linda-a-Velha", () => {
    expect(resolveStampClinicKey("OsteoJP (LV)")).not.toBe(resolveStampClinicKey("OsteoJP (CB)"));
    expect(resolveStampClinicKey("OsteoJP (LV)")).toBe(resolveStampClinicKey("Linda-a-Velha"));
    expect(resolveStampClinicKey("OsteoJP (CB)")).toBe(resolveStampClinicKey("Castelo Branco"));
  });
});

describe("resolveStampClinicKey - null for every location with no carimbo", () => {
  it.each([
    // The third location: named, and no carimbo asset.
    "OsteoJP (Montemor-o-Novo)",
    "OsteoJP (MN)",
    "Montemor-o-Novo",
    // Not one of the clinics.
    "Clínica Central",
    "Consultório B (E2E)",
    "OsteoJP",
    "OsteoJP LV",
    "osteojp-lv",
    "LV",
    // A normalised key that is also an Object.prototype member is not a clinic.
    "constructor",
  ])("%s", (name) => {
    expect(resolveStampClinicKey(name)).toBeNull();
  });

  it.each([null, undefined, "", "   "])("no name (%j)", (name) => {
    expect(resolveStampClinicKey(name)).toBeNull();
  });

  // THE BRAND ANCHOR. A name that only ENDS in a known code is somebody's room.
  // Handing it the clinic's carimbo would stamp a declaration for a place that
  // is not the clinic.
  it.each([
    "Sala de testes (LV)",
    "Teste (cb)",
    "(LV)",
    "OsteoJP (LV) antiga",
    "Antiga OsteoJP (CB)",
    "OsteoJP Sala (LV)",
  ])("the code without the whole convention: %s", (name) => {
    expect(resolveStampClinicKey(name)).toBeNull();
  });
});

describe("every key the resolver returns is a clinic with its own carimbo and a city", () => {
  const lv = resolveStampClinicKey("OsteoJP (LV)");
  const cb = resolveStampClinicKey("OsteoJP (CB)");

  it("a returned key always has carimbo bytes, and the two clinics' differ", () => {
    expect(lv).not.toBeNull();
    expect(cb).not.toBeNull();
    const lvBytes = signatureStampBytesForLocation(lv);
    const cbBytes = signatureStampBytesForLocation(cb);
    expect(lvBytes?.length ?? 0).toBeGreaterThan(0);
    expect(cbBytes?.length ?? 0).toBeGreaterThan(0);
    expect(same(lvBytes, cbBytes)).toBe(false);
  });

  it("the city is the one already recorded for that key", () => {
    expect(stampClinicCity("linda-a-velha")).toBe("Linda-a-Velha");
    expect(stampClinicCity("castelo-branco")).toBe("Castelo Branco");
    expect(stampClinicCity("montemor-o-novo")).toBeNull();
    expect(stampClinicCity("constructor")).toBeNull();
  });
});
