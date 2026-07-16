import { describe, it, expect } from "vitest";
import {
  activeBaseServiceOptions,
  canHardDeletePack,
  filterPacksByStatus,
  parsePackStatusFilter,
  type PackStatusFilter,
} from "./pack-filters";
import type { PackView } from "./packs";
import type { ServiceView } from "./services";

/**
 * W8-01b filter split (W6-01b parity): filters INCLUDE inactive; creation
 * dropdowns show ACTIVE only. Plus the UI reference guard for pack delete.
 */

const pack = (id: string, isActive: boolean): PackView => ({
  id,
  name: `Pacote ${id}`,
  baseServiceId: "svc-1",
  locationId: null,
  sessionCount: 10,
  priceCents: 39000,
  currency: "EUR",
  isActive,
});

const service = (id: string, isActive: boolean): ServiceView => ({
  id,
  name: `Serviço ${id}`,
  durationMin: 60,
  priceCents: 5000,
  currency: "EUR",
  isActive,
  contraindicationSensitive: false,
});

describe("parsePackStatusFilter", () => {
  it("defaults to 'all' (includes inactive) for unknown/absent values", () => {
    const cases: Array<string | undefined> = [undefined, "", "bogus", "todos"];
    for (const c of cases) expect(parsePackStatusFilter(c)).toBe<PackStatusFilter>("all");
  });
  it("passes through 'active' and 'inactive'", () => {
    expect(parsePackStatusFilter("active")).toBe("active");
    expect(parsePackStatusFilter("inactive")).toBe("inactive");
  });
});

describe("filterPacksByStatus — filter INCLUDES inactive (W6-01b)", () => {
  const packs = [pack("a", true), pack("b", false), pack("c", true)];

  it("'all' includes inactive packs", () => {
    expect(filterPacksByStatus(packs, "all").map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("'inactive' surfaces ONLY archived packs (restorable)", () => {
    expect(filterPacksByStatus(packs, "inactive").map((p) => p.id)).toEqual(["b"]);
  });
  it("'active' hides archived packs", () => {
    expect(filterPacksByStatus(packs, "active").map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("activeBaseServiceOptions — creation dropdown ACTIVE only (W6-01b)", () => {
  it("excludes archived services from the base-service creation options", () => {
    const services = [service("s1", true), service("s2", false), service("s3", true)];
    expect(activeBaseServiceOptions(services).map((s) => s.id)).toEqual(["s1", "s3"]);
  });
});

describe("canHardDeletePack — UI reference guard", () => {
  it("blocks hard delete when the pack has patient instances (archive-only)", () => {
    expect(canHardDeletePack(new Set(["p1"]), "p1")).toBe(false);
  });
  it("allows hard delete for a zero-instance pack", () => {
    expect(canHardDeletePack(new Set(["p1"]), "p2")).toBe(true);
    expect(canHardDeletePack(new Set(), "p2")).toBe(true);
  });
});
