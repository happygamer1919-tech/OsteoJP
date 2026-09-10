/**
 * creation-paths-emit-reminders.test.ts — OBS-05's SECOND HALF: CLOSE THE CLASS.
 *
 * ==========================================================================
 * WHY A SOURCE SCAN AND NOT MORE UNIT TESTS
 * ==========================================================================
 * The defect this file exists for is an ABSENCE. `batchScheduleAppointments`
 * committed real appointment rows and never emitted `appointment/scheduled`, so
 * no reminder run was ever created and the patient got nothing. Nothing failed:
 * there was no run to fail, no error, no log, no row anywhere that could be
 * queried for it. A unit test proves the paths it names still work; it cannot
 * notice a path nobody thought to name, and that is precisely the shape of this
 * bug - the SAME shape as `W14-portal-bookings-emit-no-reminder-events`, which
 * had already happened once through a different door.
 *
 * So the gate is inverted. It enumerates every place in the tree that INSERTS an
 * appointment row and requires each one to be accounted for HERE, with a verdict.
 * A new creation path added tomorrow fails this test on the day it is written,
 * naming itself, whether or not its author knew Stream E exists.
 *
 * ==========================================================================
 * "ACCOUNTED FOR" IS NOT "EMITS"
 * ==========================================================================
 * Three of the seven paths deliberately do not emit, and collapsing that into a
 * pass/fail boolean would either fail the suite forever or force somebody to
 * silence it. Each entry therefore carries WHY, and two different kinds of why
 * live here on purpose:
 *
 *   BY DESIGN   - the importer and the dev seed. Historical rows and fixtures
 *                 must not page real patients about visits in the past.
 *   KNOWN GAP   - the patient portal booking path, which is an OPEN DEFECT with
 *                 a card. It is listed so it stays visible and countable, not so
 *                 it is excused. When that card ships, the entry moves to
 *                 `emitter` and this test starts enforcing it.
 *
 * The distinction is the whole value of the file: a reader can tell, in one
 * place, which silences were chosen and which are owed.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** apps/web/lib/scheduling -> repo root. */
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const SCAN_ROOTS = ["apps", "packages"] as const;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".git",
]);

/**
 * Drizzle's appointment insert, in both spellings the tree uses
 * (`insert(appointments)` and `insert(schema.appointments)`).
 *
 * WHY A RAW-SQL PATTERN IS NOT ALSO MATCHED, AND IT WAS CHECKED RATHER THAN
 * ASSUMED. A `sql\`insert into appointments ...\`` in a TS source would slip
 * past this regex, so the tree was grepped for that spelling: there are ZERO in
 * apps/ and packages/ TypeScript. The only raw-SQL appointment inserts anywhere
 * are in .mjs SCRIPTS - three perf seeders and one simulation - which are not
 * application creation paths and cannot run in production. If a raw-SQL insert
 * is ever added to a TS source, add its pattern here; until then a second regex
 * would be a rule with nothing to enforce.
 */
const INSERT_RE = /\.insert\(\s*(?:schema\.)?appointments\s*\)/;

/** A top-level `function name(` / `export async function name(`. */
const FN_RE = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
/** An object METHOD (`async createBooking(principal, args) {`), which is how the API store is written. */
const METHOD_RE = /^\s{2,6}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/;
/** Words METHOD_RE would otherwise capture out of ordinary control flow. */
const NOT_A_NAME = new Set([
  "if", "for", "while", "switch", "catch", "return", "await", "async",
  "function", "const", "let", "var", "do", "else", "try", "typeof", "new", "throw",
]);

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  for (const top of SCAN_ROOTS) {
    const dir = path.join(ROOT, top);
    if (fs.existsSync(dir)) walk(dir);
  }
  return out;
}

type Site = { file: string; line: number; fn: string };

/** Every appointment INSERT in production source, with the function it sits in. */
function insertSites(): Site[] {
  const sites: Site[] = [];
  for (const abs of sourceFiles()) {
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (isComment(lines[i]!) || !INSERT_RE.test(lines[i]!)) continue;
      let fn = "(top level)";
      for (let j = i; j >= 0; j--) {
        if (isComment(lines[j]!)) continue;
        const m = lines[j]!.match(FN_RE) ?? lines[j]!.match(METHOD_RE);
        if (m && !NOT_A_NAME.has(m[1]!)) {
          fn = m[1]!;
          break;
        }
      }
      sites.push({
        file: path.relative(ROOT, abs).split(path.sep).join("/"),
        line: i + 1,
        fn,
      });
    }
  }
  return sites;
}

type Verdict =
  /** The path emits. `emitter` names the function that calls the enqueue. */
  | { kind: "emits"; emitter: { file: string; fn: string }; why: string }
  /** It deliberately does not, and the reason is a design decision. */
  | { kind: "by_design"; why: string }
  /** It does not, and that is an OPEN DEFECT with a card. */
  | { kind: "known_gap"; card: string; why: string };

/**
 * THE REGISTER. Keyed `<file>#<function>` so a NEW function inside a file that
 * already appears here still fails the gate - the old shape (a set of file
 * paths) would have let a second creation path hide inside actions.ts.
 */
const PATHS: Record<string, Verdict> = {
  "apps/web/lib/scheduling/actions.ts#createAppointment": {
    kind: "emits",
    emitter: { file: "apps/web/lib/scheduling/actions.ts", fn: "createAppointment" },
    why: "Staff booking, single and recurring. Enqueues every created occurrence post-commit.",
  },
  "apps/web/lib/scheduling/actions.ts#cloneAppointment": {
    kind: "emits",
    emitter: { file: "apps/web/lib/scheduling/actions.ts", fn: "cloneAppointment" },
    why: "Marcar novamente. One new standalone appointment, one enqueue.",
  },
  "apps/web/lib/scheduling/batch.ts#batchSchedule": {
    kind: "emits",
    // THE EMITTER IS THE CALLER, and that separation is why this went unnoticed
    // for so long: the engine and the emit live in different files, so reading
    // either one alone shows nothing missing.
    emitter: {
      file: "apps/web/lib/scheduling/actions.ts",
      fn: "batchScheduleAppointments",
    },
    why: "Agendar lote / Marcação recorrente. The engine commits; its server action emits for result.booked. OBS-05.",
  },
  "apps/api/lib/appointments/store.ts#createBooking": {
    kind: "known_gap",
    card: "W14-portal-bookings-emit-no-reminder-events",
    why:
      "The PATIENT PORTAL booking path. It commits an appointment and emits nothing, so a patient who books their own visit gets no reminder. Open defect, not a decision. When its card ships, change this entry to `emits` and the gate will hold the fix in place.",
  },
  "packages/db/src/migration/upsert.ts#insertChunk": {
    kind: "by_design",
    why:
      "The Fisiozero importer's bulk path. Imported appointments are historical rows being copied into the database, not bookings being made; emitting would schedule reminders for visits that already happened.",
  },
  "packages/db/src/migration/upsert.ts#importAppointment": {
    kind: "by_design",
    why: "The importer's single-row path. Same reason as insertChunk.",
  },
  "packages/db/seed/appointments-dev.ts#seed": {
    kind: "by_design",
    why: "Dev/e2e fixtures. Never runs against production and must not emit into a real pipeline.",
  },
};

/** The body of a top-level function, declaration line to the closing `}` in column 0. */
function functionBody(relFile: string, fn: string): string {
  const abs = path.join(ROOT, relFile);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const start = lines.findIndex(
    (l) => !isComment(l) && new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${fn}\\b`).test(l),
  );
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "}") {
      end = i;
      break;
    }
  }
  return lines.slice(start, end + 1).join("\n");
}

describe("every appointment creation path is accounted for", () => {
  const sites = insertSites();

  it("finds the creation paths at all (the scanner itself is not silently empty)", () => {
    // A scan that matches nothing would pass every assertion below by vacuity,
    // which is the classic way a guard like this dies without anyone noticing.
    expect(sites.length).toBeGreaterThanOrEqual(7);
    expect(sites.some((s) => s.file === "apps/web/lib/scheduling/batch.ts")).toBe(true);
  });

  it("REGISTERS every insert site — an unlisted creation path fails here, naming itself", () => {
    const unknown = sites
      .map((s) => ({ key: `${s.file}#${s.fn}`, s }))
      .filter(({ key }) => !(key in PATHS));

    expect(
      unknown.map(({ s }) => `${s.file}:${s.line} in ${s.fn}()`),
      "A new appointment creation path was added and is not registered in " +
        "creation-paths-emit-reminders.test.ts. Every path that inserts an " +
        "appointment must either call enqueueRemindersAfterCommit or say in the " +
        "register why it does not. This is OBS-05: the batch path committed rows " +
        "and emitted nothing, and no test could see it because nothing failed.",
    ).toEqual([]);
  });

  it("does not keep entries for paths that no longer exist", () => {
    const live = new Set(sites.map((s) => `${s.file}#${s.fn}`));
    const stale = Object.keys(PATHS).filter((k) => !live.has(k));
    expect(stale, "Registered creation paths that no longer insert an appointment").toEqual([]);
  });

  it("EMITS means the named emitter really reaches enqueueRemindersAfterCommit", () => {
    const broken: string[] = [];
    for (const [key, v] of Object.entries(PATHS)) {
      if (v.kind !== "emits") continue;
      const body = functionBody(v.emitter.file, v.emitter.fn);
      if (body === "") {
        broken.push(`${key}: emitter ${v.emitter.file}#${v.emitter.fn} not found`);
        continue;
      }
      if (!body.includes("enqueueRemindersAfterCommit(")) {
        broken.push(
          `${key}: emitter ${v.emitter.file}#${v.emitter.fn} no longer calls enqueueRemindersAfterCommit`,
        );
      }
    }
    expect(broken).toEqual([]);
  });

  it("the BATCH path emits — the OBS-05 regression guard, stated on its own", () => {
    const body = functionBody(
      "apps/web/lib/scheduling/actions.ts",
      "batchScheduleAppointments",
    );
    expect(body).toContain("enqueueRemindersAfterCommit(");
    // And it must be inside afterCommit, or a burst above the occurrence ceiling
    // would report `fail(...)` for appointments that are already committed.
    expect(body).toContain("afterCommit(");
    // Only the slots that actually booked. A partial-success batch must not
    // enqueue for the ones it refused.
    expect(body).toContain("result.booked");
  });

  it("every non-emitting path states a reason, and a KNOWN GAP names its card", () => {
    for (const [key, v] of Object.entries(PATHS)) {
      expect(v.why.length, `${key} has no reason`).toBeGreaterThan(40);
      if (v.kind === "known_gap") {
        expect(v.card, `${key} is a known gap with no card id`).toMatch(/^[A-Z]/);
      }
    }
  });

  it("the known gaps are exactly the ones we have agreed to carry", () => {
    // A second silent creation path cannot be parked here quietly: adding one to
    // the register is also a change to this list.
    const gaps = Object.entries(PATHS)
      .filter(([, v]) => v.kind === "known_gap")
      .map(([k]) => k);
    expect(gaps).toEqual(["apps/api/lib/appointments/store.ts#createBooking"]);
  });
});
