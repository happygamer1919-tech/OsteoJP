// AGENDA-MOBILE-WEEK - the service colour on the phone's week grid (Q-B6-3).
//
// Three properties, each with a control: the colour is a FUNCTION of the id
// (stable, not per render), different services are SPREAD across the palette
// (a hash that returned one colour for everything would pass stability), and
// every class names a token that EXISTS (Tailwind generates nothing for a token
// it does not know, and a block with no fill looks like a styling bug, not a
// missing token).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SERVICE_COLORS, SERVICE_COLOR_NONE, serviceColor } from "./service-color";
import { THERAPIST_COLORS, therapistColor } from "./therapist-color";

const THEME = readFileSync(new URL("../../../../packages/ui/theme.css", import.meta.url), "utf8");

describe("serviceColor", () => {
  it("is deterministic: the same service id always gets the same colour", () => {
    const id = "00000000-0000-0000-0000-00000000a201";
    expect(serviceColor(id)).toBe(serviceColor(id));
    expect(serviceColor(id).key).toBe(serviceColor(`${id}`.slice(0)).key);
  });

  it("a row with no service is the neutral colour, never a hue", () => {
    expect(serviceColor(null)).toBe(SERVICE_COLOR_NONE);
    expect(serviceColor(undefined)).toBe(SERVICE_COLOR_NONE);
    expect(serviceColor("")).toBe(SERVICE_COLOR_NONE);
    // CONTROL: a real id is NOT the neutral colour.
    expect(serviceColor("svc-1")).not.toBe(SERVICE_COLOR_NONE);
  });

  it("spreads different services across the palette rather than collapsing them", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const used = new Set(ids.map((id) => serviceColor(id).key));
    // Seven hues; sixty ids that differ only in their tail must reach most of
    // them. A constant hash would give 1.
    expect(used.size).toBeGreaterThanOrEqual(5);
  });

  it("hashes exactly as the therapist colour does (one FNV-1a in the codebase)", () => {
    // Both palettes have seven entries, so the same id lands on the same INDEX.
    // This pins that the service colour reuses the therapist hash rather than a
    // second, drifting copy of it.
    expect(SERVICE_COLORS).toHaveLength(THERAPIST_COLORS.length);
    for (const id of ["a", "b", "00000000-0000-0000-0000-00000000a203", "svc-nesa"]) {
      expect(SERVICE_COLORS.indexOf(serviceColor(id))).toBe(THERAPIST_COLORS.indexOf(therapistColor(id)));
    }
  });

  it("every class names a colour token that exists in packages/ui/theme.css", () => {
    const tokens = [...SERVICE_COLORS, SERVICE_COLOR_NONE].flatMap((c) =>
      [c.fill, c.stripe, c.swatch].map((cls) => cls.replace(/^(bg|border-l)-/, "")),
    );
    expect(tokens.length).toBe(24);
    for (const t of tokens) {
      expect(THEME, `--color-${t} is defined`).toContain(`--color-${t}:`);
    }
    // CONTROL: the check can fail. A token the theme does not define is absent.
    expect(THEME).not.toContain("--color-v2-notarealhue-100:");
  });
});
