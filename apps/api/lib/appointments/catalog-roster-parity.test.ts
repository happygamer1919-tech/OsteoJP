/**
 * catalog-roster-parity.test.ts - Q-R (strategy ruling 2026-10-22): the patient
 * catalog lists a service at a clinic only when the therapist step would name
 * somebody for it there. HELD BY SOURCE EQUALITY.
 *
 * The roster's user predicate lives inline in `listBookableTherapists`, because
 * the frozen gate test scripts/staff-11-jp-one-clinic-check.test.mjs reads it
 * there. `getCatalog` carries a copy of it. This file fails if the two differ in
 * anything but the two bindings the catalog needs: `l.id` for `${locationId}`
 * and `sql\`s.id\`` for `serviceId`. Whitespace is ignored; every other byte of
 * the predicate must match, from `where u.tenant_id` to the end of the WHERE.
 *
 * catalog-hides-unstaffed-services.db.test.ts compares the two ANSWERS pair by
 * pair on a real database; this compares the two TEXTS, so it also covers a
 * change no fixture there happens to exercise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STORE = readFileSync(join(__dirname, "store.ts"), "utf8");

function method(src: string, start: string, end: string): string {
  const from = src.indexOf(start);
  if (from < 0) throw new Error(`${start} not found in store.ts`);
  const to = src.indexOf(end, from);
  if (to < 0) throw new Error(`${end} not found after ${start}`);
  return src.slice(from, to);
}

/** From `where u.tenant_id` up to `stop` (exclusive), whitespace collapsed. */
function predicate(body: string, stop: string): string {
  const from = body.indexOf("where u.tenant_id");
  if (from < 0) throw new Error("no `where u.tenant_id` in the slice");
  const to = body.indexOf(stop, from);
  if (to < 0) throw new Error(`no ${stop} after the predicate`);
  return body.slice(from, to).replace(/\s+/g, " ").trim();
}

/** The roster: its whole WHERE, up to its ORDER BY. */
function rosterPredicate(src: string): string {
  return predicate(
    method(src, "async listBookableTherapists", "async priorCompletedServiceId"),
    "order by u.full_name",
  );
}

/**
 * The catalog's copy: the WHERE of its `exists (select 1 from users u ...)`, up
 * to the end of the query, less the closing paren of that exists, with its two
 * bindings put back to the roster's names.
 */
function catalogPredicate(src: string): string {
  const body = method(src, "async getCatalog", "async getBookableService");
  const text = predicate(body.slice(body.indexOf("select 1 from users u")), "`)) as unknown");
  if (!text.endsWith(" )")) throw new Error("the catalog copy no longer ends with its exists paren");
  return text
    .slice(0, -2)
    .replace("av.location_id = l.id", "av.location_id = ${locationId}")
    .replace("sql`s.id`)}", "serviceId)}");
}

describe("Q-R: the catalog asks the therapist step's own question", () => {
  it("the catalog's user predicate equals the roster's, but for the clinic and service bindings", () => {
    const roster = rosterPredicate(STORE);
    expect(roster.length).toBeGreaterThan(200); // not two empty strings
    expect(catalogPredicate(STORE)).toBe(roster);
  });

  it("the roster still carries every term the catalog copies (not vacuous)", () => {
    const roster = rosterPredicate(STORE);
    for (const term of [
      "u.is_active = true",
      "u.is_bookable = true",
      "${notShared}",
      "av.location_id = ${locationId}",
      "av.is_active = true",
      "av.valid_from is null",
      "av.valid_until is null",
      "deliversServiceExists(",
    ]) {
      expect(roster).toContain(term);
    }
  });

  describe("negative arms: a one-sided edit fails the equality", () => {
    /** Apply `edit` to the getCatalog method only. */
    const inCatalog = (s: string, edit: (body: string) => string): string => {
      const from = s.indexOf("async getCatalog");
      const to = s.indexOf("async getBookableService", from);
      return s.slice(0, from) + edit(s.slice(from, to)) + s.slice(to);
    };
    /** Apply `edit` to the listBookableTherapists method only. */
    const inRoster = (s: string, edit: (body: string) => string): string => {
      const from = s.indexOf("async listBookableTherapists");
      const to = s.indexOf("async priorCompletedServiceId", from);
      return s.slice(0, from) + edit(s.slice(from, to)) + s.slice(to);
    };
    const edits: Array<[string, (s: string) => string]> = [
      [
        "the catalog drops the validity window",
        (s) => inCatalog(s, (b) => b.replace(/\n\s*and \(av\.valid_until is null[^\n]*/, "")),
      ],
      ["the catalog drops is_bookable", (s) => inCatalog(s, (b) => b.replace("and u.is_bookable = true", ""))],
      [
        "the catalog gains a term after the mapping",
        (s) => inCatalog(s, (b) => b.replace("sql`s.id`)}", "sql`s.id`)}\n and u.full_name <> ''")),
      ],
      [
        "the roster gains a term the catalog lacks",
        (s) => inRoster(s, (b) => b.replace("order by u.full_name", "and u.full_name <> ''\n      order by u.full_name")),
      ],
      [
        "the roster's clinic binding changes",
        (s) => inRoster(s, (b) => b.replace("av.location_id = ${locationId}", "av.location_id is not null")),
      ],
    ];
    for (const [name, edit] of edits) {
      it(name, () => {
        const mutated = edit(STORE);
        expect(mutated).not.toBe(STORE); // the edit applied
        let differs: boolean;
        try {
          differs = catalogPredicate(mutated) !== rosterPredicate(mutated);
        } catch {
          differs = true; // a slice that no longer parses also fails the real arm
        }
        expect(differs).toBe(true);
      });
    }
  });
});
