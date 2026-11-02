/**
 * BLOQUEIOS DE REPETICAO SEMANAL - THE CENSUS OF time_off READERS.
 *
 * A weekly rule must block wherever a time_off row blocks: "a reader you miss
 * is a booking the clinic did not want". This test finds every application
 * file that READS time_off (drizzle `.from(timeOff)`, or SQL `from time_off`)
 * and holds each to one of two answers:
 *   - an AVAILABILITY reader, which must also name the weekly reader its side
 *     of the app uses (readWeeklyBlockRows on staff, weeklyBlockOverlapExists
 *     on the portal), or
 *   - a listed NON-availability reader, with the reason it does not decide
 *     whether a slot is free.
 * A new file that reads time_off and is on neither list fails here by name,
 * which is the moment somebody has to decide which kind it is.
 *
 * Scope: application code (apps/web/app, apps/web/lib, apps/api/app,
 * apps/api/lib), tests excluded. The owner-run data-op SQL under scripts/ and
 * packages/db/scripts reads time_off to count and verify rows, never to book,
 * and is out of scope by construction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");
const ROOTS = ["apps/web/app", "apps/web/lib", "apps/api/app", "apps/api/lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const READS = /\.from\(\s*timeOff\s*\)|\bfrom\s+(?:public\.)?time_off\b/i;

/** Availability readers, and the weekly reader each must also call. */
const AVAILABILITY_READERS: Record<string, RegExp> = {
  // findScheduleConflicts: the staff conflict check ("Guardar mesmo assim").
  "apps/web/lib/scheduling/conflict.ts": /readWeeklyBlockRows\(/,
  // readBlockRows: Nova marcacao's availability, Agendar lote, the Horarios
  // inspector, and the agenda's hatched band (listTherapistBlocksAndHours).
  "apps/web/lib/scheduling/day-availability.ts": /readWeeklyBlockRows\(/,
  // timeOffOverlapExists: the portal slot grid, assignment, confirm, reschedule.
  "apps/api/lib/appointments/store.ts": /weeklyBlockOverlapExists\(/,
};

/** Readers that do not decide whether a slot is free, and why. */
const NOT_AVAILABILITY: Record<string, string> = {
  "apps/web/lib/admin/time-off.ts":
    "the time_off editor's own list (Bloquear horario) and the delete's ownership lookup",
  "apps/web/lib/admin/weekly-blocks.ts":
    "the Bloqueios page's lists, which read time_off AND the weekly table side by side",
};

describe("every time_off reader is accounted for", () => {
  const readers = ROOTS.flatMap((r) => walk(join(REPO, r)))
    .filter((p) => READS.test(readFileSync(p, "utf8")))
    .map((p) => relative(REPO, p).split("\\").join("/"))
    .sort();

  it("the scan is not vacuous", () => {
    expect(readers.length).toBeGreaterThanOrEqual(5);
  });

  it("each reader is on exactly one list", () => {
    const unknown = readers.filter((f) => !(f in AVAILABILITY_READERS) && !(f in NOT_AVAILABILITY));
    expect(unknown, "a new time_off reader: decide whether it must honour weekly rules").toEqual([]);
  });

  it("each listed reader still exists and still reads time_off (no stale entry hides a move)", () => {
    expect(readers).toEqual([...Object.keys(AVAILABILITY_READERS), ...Object.keys(NOT_AVAILABILITY)].sort());
  });

  it("each availability reader also reads the weekly rules", () => {
    for (const [file, weekly] of Object.entries(AVAILABILITY_READERS)) {
      expect(readFileSync(join(REPO, file), "utf8"), file).toMatch(weekly);
    }
  });
});
