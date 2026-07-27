import { describe, expect, it } from "vitest";
import {
  THERAPIST_COLORS,
  THERAPIST_PALETTE,
  isTherapistPaletteColor,
  paletteColorByKey,
  therapistColor,
} from "./therapist-color";

// W9-05 - CB QA item 7: give each therapist a deterministic colour. These tests
// pin the two properties that matter: DETERMINISM (same id -> same colour every
// render) and that the palette stays on AA-checked -700 tokens (never a raw hex,
// so tokens.test.ts and the canonical palette are untouched).

const ID_A = "a821521d-b67d-4a99-ac35-319c9e95fe6a";
const ID_B = "d6058656-bafd-4a9e-a6da-ec5d69ca93f6";
const ID_C = "67fa6324-6503-449d-8ef5-fd61956da25d";

describe("therapistColor - determinism", () => {
  it("returns the SAME colour for the same id across calls (stable, not random)", () => {
    const first = therapistColor(ID_A);
    for (let i = 0; i < 50; i++) {
      expect(therapistColor(ID_A)).toEqual(first);
    }
  });

  it("is a pure function of the id, independent of call order", () => {
    const a1 = therapistColor(ID_A);
    therapistColor(ID_B);
    therapistColor(ID_C);
    expect(therapistColor(ID_A)).toEqual(a1);
  });

  it("gives distinct therapists distinct colours where the palette allows", () => {
    // Three ids, seven hues: they should not all collapse to one colour.
    const keys = new Set([ID_A, ID_B, ID_C].map((id) => therapistColor(id).key));
    expect(keys.size).toBeGreaterThan(1);
  });
});

describe("therapistColor - palette integrity (AA, no hex drift)", () => {
  it("only ever returns an entry from the fixed palette", () => {
    for (const id of [ID_A, ID_B, ID_C, "", "x", "0", "zzzzzzzz"]) {
      expect(THERAPIST_COLORS).toContainEqual(therapistColor(id));
    }
  });

  it("every palette entry uses a -700 token only (documented AA on light surfaces)", () => {
    for (const c of THERAPIST_COLORS) {
      expect(c.fill).toMatch(/-700$/);
    }
  });

  it("carries no raw hex - reuses existing tokens, so canonical hexes never drift", () => {
    for (const c of THERAPIST_COLORS) {
      expect(c.fill).not.toMatch(/#|rgb|oklch/);
    }
  });

  it("leads with the two non-service hues (teal, purple) so early therapists never collide with a service tint", () => {
    expect(THERAPIST_COLORS[0].key).toBe("teal");
    expect(THERAPIST_COLORS[1].key).toBe("purple");
  });

  it("falls back to a defined colour for a null/empty id, never crashing", () => {
    expect(therapistColor(null)).toEqual(THERAPIST_COLORS[0]);
    expect(therapistColor(undefined)).toEqual(THERAPIST_COLORS[0]);
    expect(therapistColor("")).toEqual(THERAPIST_COLORS[0]);
  });
});

describe("THERAPIST_PALETTE - assignable per-person colours (W12-40)", () => {
  it("paletteColorByKey resolves a known key to its token entry", () => {
    const violet = paletteColorByKey("violet");
    expect(violet?.fill).toBe("bg-v2-violet-700");
    expect(violet?.text).toBe("text-v2-violet-700");
  });

  it("paletteColorByKey returns null for null / empty / unknown (→ FNV fallback)", () => {
    expect(paletteColorByKey(null)).toBeNull();
    expect(paletteColorByKey(undefined)).toBeNull();
    expect(paletteColorByKey("")).toBeNull();
    expect(paletteColorByKey("not-a-colour")).toBeNull();
  });

  it("isTherapistPaletteColor is the setStaffColor allowlist", () => {
    expect(isTherapistPaletteColor("gray")).toBe(true);
    expect(isTherapistPaletteColor("violet")).toBe(true);
    expect(isTherapistPaletteColor("mauve")).toBe(false);
  });

  it("includes the W12-40 gray token (Samuel), labelled Cinzento", () => {
    const gray = THERAPIST_PALETTE.find((c) => c.key === "gray");
    expect(gray?.fill).toBe("bg-v2-gray-700");
    expect(gray?.text).toBe("text-v2-gray-700");
    expect(gray?.label).toBe("Cinzento");
  });

  it("carries no raw hex and mirrors fill→text on the same token", () => {
    for (const c of THERAPIST_PALETTE) {
      expect(c.fill).not.toMatch(/#|rgb|oklch/);
      expect(c.text).toBe(c.fill.replace(/^bg-/, "text-"));
    }
  });
});
