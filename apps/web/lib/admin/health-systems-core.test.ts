import { describe, expect, it } from "vitest";
import {
  HEALTH_SYSTEM_NAME_MAX,
  healthSystemNameKey,
  healthSystemNameProblem,
  healthSystemOptionsFor,
  normalizeHealthSystemName,
  readPriceTableEnabled,
  withPriceTableEnabled,
} from "./health-systems-core";

describe("Sistemas / SubSistemas: names", () => {
  it("normalizes whitespace the way the database index does", () => {
    expect(normalizeHealthSystemName("  ADSE  ")).toBe("ADSE");
    expect(normalizeHealthSystemName("Sub \t  Sistema\nX")).toBe("Sub Sistema X");
    expect(normalizeHealthSystemName("   ")).toBe("");
  });

  it("compares case-insensitively and whitespace-insensitively, but keeps accents", () => {
    expect(healthSystemNameKey(" adse ")).toBe(healthSystemNameKey("ADSE"));
    expect(healthSystemNameKey("SAMS  Quadros")).toBe(healthSystemNameKey("sams quadros"));
    expect(healthSystemNameKey("Médis")).not.toBe(healthSystemNameKey("Medis"));
  });

  it("refuses a blank name and one over the database bound", () => {
    // The literal is the database's (health_systems_name_length: <= 120), so a
    // change to the constant alone cannot move both sides together.
    expect(HEALTH_SYSTEM_NAME_MAX).toBe(120);
    expect(healthSystemNameProblem("x".repeat(120))).toBeNull();
    expect(healthSystemNameProblem("x".repeat(121))).toBe("too_long");
    expect(healthSystemNameProblem("")).toBe("blank");
    expect(healthSystemNameProblem(" \t ")).toBe("blank");
    expect(healthSystemNameProblem("x".repeat(HEALTH_SYSTEM_NAME_MAX))).toBeNull();
    expect(healthSystemNameProblem("x".repeat(HEALTH_SYSTEM_NAME_MAX + 1))).toBe("too_long");
    // Whitespace that normalization removes does not count against the bound.
    expect(healthSystemNameProblem(`  ${"x".repeat(HEALTH_SYSTEM_NAME_MAX)}  `)).toBeNull();
  });
});

describe("Sistemas / SubSistemas: the price-table switch", () => {
  it("reads OFF unless the stored value is literally true", () => {
    expect(readPriceTableEnabled({})).toBe(false);
    expect(readPriceTableEnabled(null)).toBe(false);
    expect(readPriceTableEnabled({ healthSystems: {} })).toBe(false);
    expect(readPriceTableEnabled({ healthSystems: { priceTableEnabled: "true" } })).toBe(false);
    expect(readPriceTableEnabled({ healthSystems: { priceTableEnabled: true } })).toBe(true);
  });

  it("writes only its own key and keeps every other settings key", () => {
    const before = { contacts: { email: "x" }, billing: { vatRate: 23 }, healthSystems: { other: 1 } };
    const after = withPriceTableEnabled(before, true);
    expect(after).toEqual({
      contacts: { email: "x" },
      billing: { vatRate: 23 },
      healthSystems: { other: 1, priceTableEnabled: true },
    });
    expect(readPriceTableEnabled(withPriceTableEnabled(after, false))).toBe(false);
  });
});

describe("Sistemas / SubSistemas: the ficha dropdown", () => {
  const all = [
    { id: "b", name: "SAMS", active: true },
    { id: "a", name: "ADSE", active: true },
    { id: "c", name: "Antigo", active: false },
  ];

  it("offers the active entries, sorted by name", () => {
    expect(healthSystemOptionsFor(all, null).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("keeps a switched-off entry the patient already names", () => {
    expect(healthSystemOptionsFor(all, "c").map((o) => o.id)).toEqual(["a", "c", "b"]);
  });
});
