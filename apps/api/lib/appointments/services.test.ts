import { describe, expect, it } from "vitest";
import {
  BOOKABLE_SERVICE_NAMES,
  PHYSIO_WRAPPER_SERVICE_NAMES,
  effectivePriceCents,
  isBookableServiceName,
  normalizeServiceName,
} from "./services";

describe("normalizeServiceName", () => {
  it("strips accents, lowercases, and collapses whitespace", () => {
    expect(normalizeServiceName("Pilates Terapêutico")).toBe("pilates terapeutico");
    expect(normalizeServiceName("  MASSAGEM   Terapêutica ")).toBe("massagem terapeutica");
    expect(normalizeServiceName("RPG")).toBe("rpg");
  });
});

describe("isBookableServiceName (OsteoJP self-bookable set)", () => {
  it("includes the two physio wrappers (accent/case tolerant)", () => {
    expect(isBookableServiceName("Massagem Terapêutica")).toBe(true);
    expect(isBookableServiceName("massagem terapeutica")).toBe(true);
    expect(isBookableServiceName("Pilates Terapêutico")).toBe(true);
    expect(PHYSIO_WRAPPER_SERVICE_NAMES).toEqual(["massagem terapeutica", "pilates terapeutico"]);
  });

  it("includes the core consultations", () => {
    expect(isBookableServiceName("Osteopatia")).toBe(true);
    expect(isBookableServiceName("Fisioterapia")).toBe(true);
  });

  it("excludes out-of-scope / non-bookable offerings", () => {
    expect(isBookableServiceName("Formação")).toBe(false);
    expect(isBookableServiceName("NESA")).toBe(false);
    expect(isBookableServiceName("Consulta de Avaliação Desportiva")).toBe(false);
    // RPG is the RGPD consent document, not a service (JP ruling 2026-07-11).
    expect(isBookableServiceName("RPG")).toBe(false);
    expect(isBookableServiceName("rpg")).toBe(false);
    expect(PHYSIO_WRAPPER_SERVICE_NAMES).not.toContain("rpg");
  });

  it("every allowlist entry is already normalized", () => {
    for (const name of BOOKABLE_SERVICE_NAMES) {
      expect(normalizeServiceName(name)).toBe(name);
    }
  });
});

describe("effectivePriceCents (override-then-base, display-only)", () => {
  it("prefers the per-location override (parceria/protocol net price)", () => {
    expect(effectivePriceCents(5000, 4500)).toBe(4500);
  });
  it("falls back to the base catalog price", () => {
    expect(effectivePriceCents(5000, null)).toBe(5000);
  });
  it("treats a 0 override as a real (free) price, not missing", () => {
    expect(effectivePriceCents(5000, 0)).toBe(0);
  });
  it("returns null when neither is published", () => {
    expect(effectivePriceCents(null, null)).toBeNull();
  });
});
