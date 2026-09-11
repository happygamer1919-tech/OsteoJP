/**
 * SCHED-17 - every portal roster and slot query excludes shared resources.
 *
 * A SOURCE-LEVEL GATE, for the reason acceptance-event-flow.test.ts gives for its
 * own: the property is an ABSENCE (NESA is not offered to a patient), and the
 * database that would prove it by execution does not have the column until the
 * NESA migration is applied. So every `u.is_bookable = true` in store.ts must be
 * followed by `${notShared}`, and a fifth roster query added tomorrow without it
 * fails here, naming its line.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("./store.ts", import.meta.url)), "utf8");

describe("SCHED-17: the portal never offers a shared resource", () => {
  it("every `u.is_bookable = true` carries the shared-resource exclusion", () => {
    const lines = SRC.split("\n");
    const sites: number[] = [];
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("--")) return;
      if (!/\bu\.is_bookable = true\b/.test(t)) return;
      sites.push(i + 1);
      if (!/\$\{notShared\}/.test(lines.slice(i + 1, i + 3).join("\n"))) {
        offenders.push(`store.ts:${i + 1}`);
      }
    });
    // The scan is not vacuous: four queries filter on is_bookable today.
    expect(sites.length).toBeGreaterThanOrEqual(4);
    expect(offenders, "a portal roster query offers shared resources to patients").toEqual([]);
  });

  it("the exclusion is gated on the column existing, so it cannot 42703 before the migration", () => {
    expect(SRC).toMatch(/sharedResourceSchemaPresent\(getDbAdmin\(\)\)/);
    expect(SRC).toMatch(/and u\.is_shared_resource = false/);
  });
});
