/**
 * BLOQUEIOS DE REPETICAO SEMANAL - the patient portal honours weekly rules.
 *
 * A SOURCE-LEVEL GATE, for SCHED-17's reason (shared-resource-exclusion.test.ts):
 * the database that would prove it by execution has no weekly table until the
 * pending migration is applied, and CI's database never has it while the file
 * is pending. What can be pinned without it:
 *   - EVERY call of timeOffOverlapExists passes the weekly flag, and every
 *     function that calls it asks weeklyBlocksOn() first. The four calls today
 *     are the slot grid (listOpenSlots), the assignment (listAvailableTherapists),
 *     the confirm guard (createBooking) and the reschedule guard
 *     (hasWindowConflict). A fifth added without the flag does not compile, and
 *     one added in a function that never asks fails here.
 *   - The weekly fragment's SQL keeps its shape: the weekly table, one row per
 *     Lisbon date of the window, the weekday from `extract(dow ...)` (0 =
 *     Sunday, the table's convention), and both ends converted AT TIME ZONE
 *     Europe/Lisbon, half-open.
 *   - The table is only named behind the presence probe.
 * The DB-gated proof of the same fragment is owed (see the pull request).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(fileURLToPath(new URL("./store.ts", import.meta.url)), "utf8");
const CODE = SRC.split("\n")
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/**") || t.startsWith("--"));
  })
  .join("\n");

/** The body of a top-level `function name(` or object method `async name(`. */
function bodyOf(name: string): string {
  const start = CODE.search(new RegExp(`(?:function |async )${name}\\(`));
  if (start < 0) return "";
  const open = CODE.indexOf("{", CODE.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === "{") depth++;
    else if (CODE[i] === "}" && --depth === 0) return CODE.slice(start, i + 1);
  }
  return "";
}

describe("every portal time_off check also checks weekly rules", () => {
  // Every USE sits inside a template literal as `${timeOffOverlapExists(...)}`,
  // on one line; the definition is the only other occurrence.
  const calls = [...CODE.matchAll(/\$\{timeOffOverlapExists\((.*)\)\}/g)].map((m) => m[1]!);
  const occurrences = [...CODE.matchAll(/\btimeOffOverlapExists\(/g)].length;

  it("no call escapes the scan: every occurrence but the definition is a template use", () => {
    expect(occurrences).toBe(calls.length + 1);
  });

  it("there are exactly the four known call sites (grid, assignment, confirm, reschedule)", () => {
    expect(calls).toHaveLength(4);
  });

  it("each passes `weekly` as its last argument", () => {
    for (const args of calls) expect(args.trim().endsWith(", weekly")).toBe(true);
  });

  it("each function that calls it asks weeklyBlocksOn() itself", () => {
    for (const fn of ["listOpenSlots", "listAvailableTherapists", "createBooking", "hasWindowConflict"]) {
      const body = bodyOf(fn);
      expect(body, `${fn} not found`).not.toBe("");
      expect(body).toMatch(/timeOffOverlapExists\(/);
      expect(body).toMatch(/const weekly = await weeklyBlocksOn\(\);/);
    }
  });

  it("the time_off fragment ORs in the weekly fragment only when the flag is on", () => {
    const body = bodyOf("timeOffOverlapExists");
    expect(body).toMatch(/weekly\s*\?\s*sql`\(\$\{timeOff\} or \$\{weeklyBlockOverlapExists\(tenantId, practitioner, startsAt, endsAt\)\}\)`\s*:\s*timeOff/);
  });
});

describe("the weekly fragment's SQL", () => {
  const body = bodyOf("weeklyBlockOverlapExists");

  it("reads the weekly table, scoped to the tenant and the therapist", () => {
    expect(body).toMatch(/from therapist_weekly_blocks w/);
    expect(body).toMatch(/w\.tenant_id = \$\{tenantId\}/);
    expect(body).toMatch(/w\.user_id = \$\{pref\(practitioner\)\}/);
  });

  it("walks every Lisbon date of the window, one day at a time", () => {
    expect(body).toMatch(
      /generate_series\(\s*\(\(\$\{s\}\) at time zone \$\{LISBON\}\)::date,\s*\(\(\$\{e\}\) at time zone \$\{LISBON\}\)::date,\s*interval '1 day'\s*\) as wd\(day\)/,
    );
  });

  it("matches the weekday the way a template is matched (0 = Sunday)", () => {
    expect(body).toMatch(/w\.weekday = extract\(dow from wd\.day\)::int/);
  });

  it("builds each date's span in Lisbon wall clock and overlaps it half-open", () => {
    expect(body).toMatch(/\(\(wd\.day::date \+ w\.start_time\) at time zone \$\{LISBON\}\) < \(\$\{e\}\)/);
    expect(body).toMatch(/\(\(wd\.day::date \+ w\.end_time\)\s+at time zone \$\{LISBON\}\) > \(\$\{s\}\)/);
    expect(CODE).toMatch(/const LISBON = "Europe\/Lisbon";/);
  });

  it("the table is named only behind the presence probe", () => {
    expect(bodyOf("weeklyBlocksOn")).toMatch(/weeklyBlocksSchemaPresent\(getDbAdmin\(\)\)/);
    const mentions = [...CODE.matchAll(/therapist_weekly_blocks/g)].length;
    expect(mentions).toBe(1);
  });
});
