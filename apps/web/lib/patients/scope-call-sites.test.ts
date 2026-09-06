/**
 * scope-call-sites.test.ts - EVERY PLACE `patientLocationScope` IS COMPOSED, AND
 * WHETHER A FIXTURE COVERS IT. COUNTED, NOT REMEMBERED.
 *
 * ==========================================================================
 * WHY A TEST AND NOT A COMMENT
 * ==========================================================================
 * PERF-16's finding was that three of the five places `lib/patients` composed
 * this predicate were covered only by `vi.mock`, and it was found by grepping
 * rather than by anybody noticing. A comment saying "there are eleven of these"
 * is true on the day it is written and silently wrong afterwards. This asserts
 * the list, so a TWELFTH call site cannot be added without somebody deciding,
 * in this file, whether a fixture reaches it.
 *
 * ==========================================================================
 * WHAT IT DOES NOT CLAIM
 * ==========================================================================
 * `COVERED` here means "a DB-gated suite drives this function through the real
 * predicate over the four visibility classes". It does not mean the call site is
 * correct, and it is not a coverage percentage. `UNCOVERED` is a statement of
 * fact carrying the reason, not a TODO that quietly never fails.
 *
 * The four classes are the ones `location-scope-classes.db.test.ts` builds:
 * reachable by an appointment, by `primary_location_id`, by both, by neither.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");

/** Every `.ts`/`.tsx` under apps/web that is not a test and not a build output. */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "test-results") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** The test files `sources` deliberately excludes, so a citation can be checked. */
function suiteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      suiteFiles(full, out);
      continue;
    }
    if (/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The call sites, as `<path>:<count>`, and each one's coverage verdict.
 *
 * `scope.ts` is the DEFINITION and is deliberately absent: it does not compose
 * the predicate into a query, it is the predicate.
 */
const EXPECTED: Record<string, { calls: number; covered: boolean; why: string }> = {
  "lib/patients/list-queries.ts": {
    calls: 2,
    covered: true,
    why: "location-scope-classes.db.test.ts - the data table and the stat strip, through scopeConditions",
  },
  "lib/patients/queries.ts": {
    calls: 3,
    covered: true,
    why: "location-scope-classes.db.test.ts - getPatient, listPatients, searchPatients (PERF-16)",
  },
  "lib/consultation/stuck-consultations.ts": {
    calls: 1,
    covered: true,
    why: "scope-classes-other-columns.db.test.ts - the predicate on consultations.patient_id",
  },
  "lib/reminders/unreachable-by-sms.ts": {
    calls: 1,
    covered: true,
    why: "scope-classes-other-columns.db.test.ts - the predicate on appointments.patient_id",
  },
  "lib/followup/scope.ts": {
    calls: 1,
    covered: false,
    why: "UNCOVERED: the recuperação window needs a contact/window fixture no class suite builds. Same column (patients.id) and same shape as the covered patients-path sites.",
  },
  "lib/followup/queries.ts": {
    calls: 2,
    covered: false,
    why: "UNCOVERED: as above - the queue and the export both need the window fixture.",
  },
  "lib/statistics/kpi-queries.ts": {
    calls: 1,
    covered: false,
    why: "UNCOVERED: needs a KPI aggregate fixture. Same column (patients.id) as the covered sites.",
  },
};

function callSites(): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of sources(WEB)) {
    const rel = file.slice(WEB.length + 1);
    if (rel === "lib/patients/scope.ts") continue;
    const n = (readFileSync(file, "utf8").match(/patientLocationScope\(/g) ?? []).length;
    if (n > 0) found[rel] = n;
  }
  return found;
}

describe("patientLocationScope - the call sites are enumerated, not remembered", () => {
  it("composes the predicate in exactly the files this file knows about", () => {
    // A NEW FILE FAILS HERE, and that is the whole point: adding a twelfth call
    // site should cost one decision - is it reached by a fixture - rather than
    // being noticed a release later.
    expect(Object.keys(callSites()).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("composes it exactly as many times per file", () => {
    // The COUNT and not just the file, because a second composition inside an
    // already-listed file is exactly how `queries.ts` came to have three that
    // nothing drove.
    const found = callSites();
    const expected = Object.fromEntries(
      Object.entries(EXPECTED).map(([f, v]) => [f, v.calls]),
    );
    expect(found).toEqual(expected);
  });

  it("says how many call sites a class fixture actually reaches", () => {
    // NOT A THRESHOLD. The numbers are written out so that moving one from
    // UNCOVERED to COVERED is a visible edit to this line, and so that a reader
    // who wants the gate's reach does not have to derive it.
    const calls = (covered: boolean) =>
      Object.values(EXPECTED)
        .filter((v) => v.covered === covered)
        .reduce((n, v) => n + v.calls, 0);
    expect({ covered: calls(true), uncovered: calls(false) }).toEqual({
      covered: 7,
      uncovered: 4,
    });
  });

  it("every COVERED entry names a suite that EXISTS", () => {
    // Written after the first version of this file claimed coverage from a suite
    // that had not been written yet. A citation nothing checks is the same
    // defect class as a comment asserting a property nothing tests, and this
    // file exists to end exactly that.
    for (const [file, v] of Object.entries(EXPECTED)) {
      if (!v.covered) continue;
      const suite = v.why.split(" ")[0]!;
      expect(suite, `${file} cites something that is not a suite file`).toMatch(/\.db\.test\.ts$/);
      const found = sources(join(WEB, "lib"))
        .concat(suiteFiles(join(WEB, "lib")))
        .some((f) => f.endsWith(suite));
      expect(found, `${file} cites ${suite}, which does not exist`).toBe(true);
    }
  });

  it("every UNCOVERED entry says WHY, so it is a finding rather than a TODO", () => {
    for (const [file, v] of Object.entries(EXPECTED)) {
      if (v.covered) continue;
      expect(v.why, `${file} is uncovered and does not say why`).toMatch(/^UNCOVERED: /);
    }
  });
});
