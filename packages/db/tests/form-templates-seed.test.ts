import { describe, expect, it } from "vitest";
import { loadFormTemplates, type LoadResult } from "../seed/form-templates";

// Loader behavior over the REAL seed directory — no database required. The
// seed/form-templates/ dir holds genuine templates (osteopathy, physiotherapy,
// nesa) AND three schema-less pointer-wrappers (massagem-terapeutica,
// pilates-terapeutico, rpg) that declare `x-form-ref: "physiotherapy"`.
//
// The wrappers used to ABORT the packaged seed (validateSeed threw on the
// missing `schema`). This asserts the loader now runs clean over all files,
// skipping wrappers (not seeding them) and upserting only the real templates.

const WRAPPER_KEYS = ["massagem-terapeutica", "pilates-terapeutico", "rpg"];

/** Minimal chainable fake of the Drizzle surface upsertOne touches. Every
 *  select misses, so every real template takes the insert path; inserted rows
 *  are recorded so we can prove wrappers are NEVER written. */
function fakeDb() {
  const inserted: Array<Record<string, unknown>> = [];
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] as unknown[] }) }),
    }),
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        inserted.push(row);
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };
  return { db, inserted };
}

describe("loadFormTemplates — schema-less pointer-wrappers are skipped, not aborted", () => {
  async function run(): Promise<{ results: LoadResult[]; inserted: Array<Record<string, unknown>> }> {
    const { db, inserted } = fakeDb();
    // Default dir = the real seed/form-templates/. No `dir` override.
    const results = await loadFormTemplates(db, "00000000-0000-0000-0000-000000000001", {
      log: () => {},
    });
    return { results, inserted };
  }

  it("runs clean over every file (does not throw on the wrappers)", async () => {
    await expect(run()).resolves.toBeDefined();
  });

  it("skips exactly the three x-form-ref wrappers", async () => {
    const { results } = await run();
    const skipped = results.filter((r) => r.action === "skipped").map((r) => r.key).sort();
    expect(skipped).toEqual([...WRAPPER_KEYS].sort());
  });

  it("upserts the real templates and never writes a wrapper as a template", async () => {
    const { results, inserted } = await run();
    const insertedKeys = inserted.map((row) => row.key as string);

    // Real templates were upserted (insert path here since selects miss).
    expect(insertedKeys).toEqual(expect.arrayContaining(["osteopathy", "physiotherapy", "nesa"]));
    // No wrapper key was ever seeded into form_templates.
    for (const wrapper of WRAPPER_KEYS) {
      expect(insertedKeys).not.toContain(wrapper);
    }
    // Every non-skipped result is a genuine upsert outcome.
    const nonSkipped = results.filter((r) => r.action !== "skipped");
    for (const r of nonSkipped) {
      expect(["inserted", "updated", "unchanged"]).toContain(r.action);
      expect(WRAPPER_KEYS).not.toContain(r.key);
    }
  });
});
