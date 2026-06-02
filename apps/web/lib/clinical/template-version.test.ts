import { describe, expect, it } from "vitest";
import {
  WRAPPER_FORM_REFS,
  currentTemplateForKey,
  isWrapperType,
  resolveCurrentTemplates,
  resolveTemplateForType,
  type VersionedTemplate,
} from "./template-version";

// Mirrors the real seed state after PR #91: two versions for osteopathy and
// physiotherapy, one for nesa. ids are stable so we can assert exactly which row
// wins. Input is key-sorted then version-sorted (how listActiveTemplates feeds it).
type Row = VersionedTemplate & { id: string; title: string };

const SEEDED: Row[] = [
  { id: "nesa-1", key: "nesa", version: 1, title: "NESA" },
  { id: "osteo-1", key: "osteopathy", version: 1, title: "Osteopatia" },
  { id: "osteo-2", key: "osteopathy", version: 2, title: "Osteopatia" },
  { id: "physio-3", key: "physiotherapy", version: 3, title: "Fisioterapia" },
  { id: "physio-4", key: "physiotherapy", version: 4, title: "Fisioterapia" },
];

describe("resolveCurrentTemplates — one entry per key (the Modelo picker)", () => {
  it("collapses each key to its highest version", () => {
    const current = resolveCurrentTemplates(SEEDED);
    expect(current.map((r) => `${r.key} v${r.version}`)).toEqual([
      "nesa v1",
      "osteopathy v2",
      "physiotherapy v4",
    ]);
    // The exact rows that win — never the superseded v1/v3.
    expect(current.map((r) => r.id)).toEqual(["nesa-1", "osteo-2", "physio-4"]);
  });

  it("never emits the superseded versions (no v1+v2 / v3+v4 duplicates)", () => {
    const ids = resolveCurrentTemplates(SEEDED).map((r) => r.id);
    expect(ids).not.toContain("osteo-1");
    expect(ids).not.toContain("physio-3");
    // Exactly one entry per distinct key.
    expect(ids.length).toBe(new Set(SEEDED.map((r) => r.key)).size);
  });

  it("preserves first-seen key order (a key-sorted input stays key-sorted)", () => {
    expect(resolveCurrentTemplates(SEEDED).map((r) => r.key)).toEqual([
      "nesa",
      "osteopathy",
      "physiotherapy",
    ]);
  });

  it("picks the max version regardless of input order", () => {
    const shuffled = [SEEDED[2], SEEDED[1], SEEDED[4], SEEDED[3], SEEDED[0]];
    const current = resolveCurrentTemplates(shuffled);
    const osteo = current.find((r) => r.key === "osteopathy");
    const physio = current.find((r) => r.key === "physiotherapy");
    expect(osteo?.version).toBe(2);
    expect(physio?.version).toBe(4);
  });

  it("is a no-op when every key already has a single version", () => {
    const single = [SEEDED[0], SEEDED[2], SEEDED[4]];
    expect(resolveCurrentTemplates(single)).toEqual(single);
  });

  it("handles an empty list", () => {
    expect(resolveCurrentTemplates([])).toEqual([]);
  });
});

describe("currentTemplateForKey — by-key resolution seam (future wiring)", () => {
  it("returns the highest-version row for a key", () => {
    expect(currentTemplateForKey(SEEDED, "osteopathy")?.id).toBe("osteo-2");
    expect(currentTemplateForKey(SEEDED, "physiotherapy")?.id).toBe("physio-4");
    expect(currentTemplateForKey(SEEDED, "nesa")?.id).toBe("nesa-1");
  });

  it("returns null for an unknown key", () => {
    expect(currentTemplateForKey(SEEDED, "massagem")).toBeNull();
  });
});

describe("resolveTemplateForType — x-form-ref wrappers reuse the physiotherapy form", () => {
  it("maps all three wrapper therapy types to physiotherapy", () => {
    expect(WRAPPER_FORM_REFS).toEqual({
      "massagem-terapeutica": "physiotherapy",
      "pilates-terapeutico": "physiotherapy",
      rpg: "physiotherapy",
    });
  });

  it("resolves each wrapper type to the CURRENT physiotherapy template (v4)", () => {
    for (const wrapper of ["massagem-terapeutica", "pilates-terapeutico", "rpg"]) {
      const resolved = resolveTemplateForType(SEEDED, wrapper);
      expect(resolved?.id).toBe("physio-4");
      expect(resolved?.key).toBe("physiotherapy");
      expect(resolved?.version).toBe(4);
    }
  });

  it("follows the form-ref to the current version even as physiotherapy bumps", () => {
    // Drop v4 → wrappers must fall back to the next-highest active physio row.
    const withoutV4 = SEEDED.filter((r) => r.id !== "physio-4");
    expect(resolveTemplateForType(withoutV4, "rpg")?.id).toBe("physio-3");
  });

  it("resolves a non-wrapper key directly (no indirection)", () => {
    expect(resolveTemplateForType(SEEDED, "osteopathy")?.id).toBe("osteo-2");
    expect(resolveTemplateForType(SEEDED, "nesa")?.id).toBe("nesa-1");
  });

  it("returns null when the target form is absent (e.g. tenant has no physio)", () => {
    const noPhysio = SEEDED.filter((r) => r.key !== "physiotherapy");
    expect(resolveTemplateForType(noPhysio, "rpg")).toBeNull();
  });

  it("returns null for an unknown, non-wrapper key", () => {
    expect(resolveTemplateForType(SEEDED, "acupuncture")).toBeNull();
  });

  it("isWrapperType flags only the three reuse types", () => {
    expect(isWrapperType("rpg")).toBe(true);
    expect(isWrapperType("massagem-terapeutica")).toBe(true);
    expect(isWrapperType("pilates-terapeutico")).toBe(true);
    expect(isWrapperType("physiotherapy")).toBe(false);
    expect(isWrapperType("osteopathy")).toBe(false);
  });
});

describe("IMMUTABILITY BOUNDARY — pinned records bypass the resolver", () => {
  // An existing clinical_record stores a specific formTemplateId. Its view/edit
  // path resolves the template BY ID (records.ts joins formTemplates on the
  // stored id), NOT through resolveCurrentTemplates. So a record authored
  // against osteopathy v1 must keep resolving to v1 even though v2 is current.
  //
  // We model the two distinct paths over the same data:
  //   - new-record picker:  resolveCurrentTemplates(...)  → current version
  //   - existing record:    lookup by pinned id           → the pinned version
  const byPinnedId = (id: string) => SEEDED.find((r) => r.id === id) ?? null;

  it("a record pinned to osteopathy v1 still resolves to v1, while the picker offers v2", () => {
    const pinned = byPinnedId("osteo-1"); // what an old record references
    expect(pinned?.version).toBe(1);

    const offeredForNewRecords = resolveCurrentTemplates(SEEDED).find(
      (r) => r.key === "osteopathy",
    );
    expect(offeredForNewRecords?.version).toBe(2);

    // The two paths disagree on version — exactly the intended boundary.
    expect(pinned?.version).not.toBe(offeredForNewRecords?.version);
  });

  it("the resolver is non-destructive: every version remains addressable by id", () => {
    // Collapsing for the picker must not remove v1/v3 from the source of truth;
    // they stay resolvable by id for the records that pinned them.
    resolveCurrentTemplates(SEEDED);
    expect(byPinnedId("osteo-1")?.version).toBe(1);
    expect(byPinnedId("physio-3")?.version).toBe(3);
  });
});
