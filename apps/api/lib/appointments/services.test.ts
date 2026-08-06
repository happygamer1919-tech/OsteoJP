/**
 * services.test.ts — what survives the allowlist's deletion.
 *
 * W13-04 (Decision B) removed `BOOKABLE_SERVICE_NAMES`, `isBookableServiceName`
 * and `PHYSIO_WRAPPER_SERVICE_NAMES`, and the tests that pinned them went with
 * them. Which services a patient may book is now a COLUMN, so the question is a
 * database question and it is asked in `store.ts` — see
 * `internal-only-refusal.test.ts` for the guard that matters.
 *
 * WHAT IS DELIBERATELY NOT RE-CREATED HERE: any list of service names. Every
 * test of the old rule used fixture names built to satisfy it, which is exactly
 * why a catalog where only one of four names existed passed CI for months.
 *
 * `normalizeServiceName` stays and is still tested: it is a string utility, not
 * the rule, and migration 0057's SQL backfill is written to agree with it
 * (proved against a real database in `patient-bookable.db.test.ts`).
 */
import { describe, expect, it } from "vitest";

import { effectivePriceCents, normalizeServiceName } from "./services";

describe("normalizeServiceName", () => {
  it("strips accents, lowercases and collapses whitespace", () => {
    expect(normalizeServiceName("Pilates Terapêutico")).toBe("pilates terapeutico");
    expect(normalizeServiceName("  MASSAGEM   Terapêutica ")).toBe("massagem terapeutica");
    expect(normalizeServiceName("RPG")).toBe("rpg");
  });

  it("is idempotent — normalizing an already-normalized name changes nothing", () => {
    for (const name of ["osteopatia", "fisioterapia", "massagem terapeutica"]) {
      expect(normalizeServiceName(name)).toBe(name);
    }
  });

  it("leaves an EM DASH and a feminine ordinal alone, which is not a defect", () => {
    // Recorded because it cost a script rewrite. Production writes
    // "Pilates — Aula Individual" with an em dash and "1.ª consulta" with a
    // feminine ordinal; neither is a combining diacritic, so NFD-stripping does
    // not touch them. Anything comparing hand-typed names against real ones has
    // to carry the real spelling — which is the argument for the column.
    expect(normalizeServiceName("Pilates — Aula Individual")).toBe("pilates — aula individual");
    expect(normalizeServiceName("1.ª consulta")).toBe("1.ª consulta");
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
