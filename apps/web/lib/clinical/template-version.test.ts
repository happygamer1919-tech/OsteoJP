import { describe, expect, it } from "vitest";
import {
  currentTemplateForKey,
  resolveCurrentTemplates,
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
