/**
 * creation-paths-write-care-team.test.ts - CARE-02c: EVERY APPOINTMENT INSERT
 * HAS A CARE-TEAM VERDICT.
 *
 * The owner's check is that a booking puts its therapist on the patient's care
 * team at EVERY place an appointment is written. The defect that would break it
 * is an ABSENCE: an eighth insert site added tomorrow that writes appointments
 * and no care-team row, with nothing failing anywhere. A unit test of the seven
 * known sites cannot see an eighth. So this is the same inverted gate
 * creation-paths-emit-reminders.test.ts keeps for reminders: it scans the tree
 * for every appointment INSERT and requires each one to be registered here with
 * a verdict, and it checks that every "writes" verdict is still true of the
 * source.
 *
 * THE VERDICTS
 *   writes        the function passes its own transaction to
 *                 addBookedTherapistsToCareTeam and notifies after commit.
 *                 Both halves are measured against the runScoped call's own
 *                 span: the write INSIDE it, the notice AFTER it closes. A
 *                 notice sent from inside the callback would go out for a
 *                 booking that then rolls back.
 *   by_design     the importer and the dev seed: historical rows and fixtures,
 *                 not bookings. Whether imported history should populate care
 *                 teams is carried to the owner as a question.
 *   not_written   the patient portal: a pedido is not an accepted booking, it
 *                 runs as the service role with no staff actor, and the owner
 *                 has not ruled whether acceptance adds the therapist.
 *
 * WHAT A "writes" VERDICT DOES NOT PROMISE. Which rows are written depends on
 * the ACTOR, as `patient_care_team_insert` says: owner and reception write
 * every therapist the booking names; a therapist (since 0098, CARE-02a) writes
 * their own row only; an admin writes nothing. That is a per-ACTOR rule, pinned
 * against both migrations in care-team-core.test.ts, not a per-site one, so it
 * is not a verdict here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** apps/web/lib/scheduling -> repo root. */
const ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SCAN_ROOTS = ["apps", "packages"] as const;
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "build", "coverage", ".git"]);

/** The insert shape the reminder register scans for, in both spellings the tree uses. */
const INSERT_RE = /\.insert\(\s*(?:schema\.)?appointments\s*\)/;
const FN_RE = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
const METHOD_RE = /^\s{2,6}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/;
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
      sites.push({ file: path.relative(ROOT, abs).split(path.sep).join("/"), line: i + 1, fn });
    }
  }
  return sites;
}

type Verdict =
  | { kind: "writes"; why: string }
  | { kind: "by_design"; why: string }
  | { kind: "not_written"; question: string; why: string };

/** Keyed `<file>#<function>`, so a new function in a listed file still fails the gate. */
const PATHS: Record<string, Verdict> = {
  "apps/web/lib/scheduling/actions.ts#createAppointment": {
    kind: "writes",
    why: "Staff booking: the first occurrence and the recurrence children (sites 2 and 3), one call for all created rows.",
  },
  "apps/web/lib/scheduling/actions.ts#cloneAppointment": {
    kind: "writes",
    why: "Marcar novamente (site 4). A clone is a real booking.",
  },
  "apps/web/lib/scheduling/batch.ts#batchSchedule": {
    kind: "writes",
    why: "Agendar lote and Marcacao recorrente (site 5). One call for the rows actually booked.",
  },
  "apps/api/lib/appointments/store.ts#createBooking": {
    kind: "not_written",
    question: "Q-CARE-02C-PORTAL",
    why: "The patient portal (site 1). A pedido is a request the clinic has not accepted, the service role has no staff actor for 0091's policy, and the pedido already notifies the therapist.",
  },
  "packages/db/src/migration/upsert.ts#insertChunk": {
    kind: "by_design",
    why: "The Fisiozero importer's bulk path (site 6): historical rows, owner-run. Carried as Q-CARE-02C-IMPORT.",
  },
  "packages/db/src/migration/upsert.ts#importAppointment": {
    kind: "by_design",
    why: "The importer's single-row path (site 7). Same reason as insertChunk.",
  },
  "packages/db/seed/appointments-dev.ts#seed": {
    kind: "by_design",
    why: "Dev and e2e fixtures. Never runs against production.",
  },
};

/** One top-level function's text, declaration to the closing `}` in column 0, comments stripped. */
function functionBody(relFile: string, fn: string): string {
  const lines = fs.readFileSync(path.join(ROOT, relFile), "utf8").split("\n");
  const start = lines.findIndex(
    (l) => !isComment(l) && new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${fn}\\b`).test(l),
  );
  if (start === -1) return "";
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines
    .slice(start, end === -1 ? lines.length : end + 1)
    .filter((l) => !isComment(l))
    .join("\n");
}

/**
 * Where the transaction is, in a function body: from `runScoped` to the `)` that
 * closes its call. Parentheses are counted outside string and template literals
 * and outside trailing comments, so a "(" in a message or a note cannot move the
 * end. Everything between `start` and `end` runs inside the callback, before the
 * commit; everything after `end` runs once runScoped has returned, which is after
 * the commit. Null when the body opens no transaction or the count never closes.
 */
function txSpan(body: string): { start: number; end: number } | null {
  const start = body.search(/\brunScoped\b/);
  if (start === -1) return null;
  const open = body.indexOf("(", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < body.length; i++) {
    const c = body[i]!;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < body.length && body[i] !== c; i++) if (body[i] === "\\") i++;
      continue;
    }
    if (c === "/" && body[i + 1] === "/") {
      while (i < body.length && body[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && body[i + 1] === "*") {
      const close = body.indexOf("*/", i + 2);
      i = close === -1 ? body.length : close + 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { start, end: i };
  }
  return null;
}

/** The ordering faults of one "writes" function, empty when it is right. */
function txOrderFaults(key: string, body: string, notifyRe: RegExp): string[] {
  const span = txSpan(body);
  if (span === null) return [`${key}: no runScoped transaction found`];
  const faults: string[] = [];
  const writeAt = body.search(/addBookedTherapistsToCareTeam\(/);
  if (writeAt === -1 || writeAt < span.start || writeAt > span.end) {
    faults.push(`${key}: the care-team write is not inside the runScoped transaction`);
  }
  const notifies = [...body.matchAll(new RegExp(notifyRe.source, "g"))].map((m) => m.index!);
  if (notifies.length === 0) {
    faults.push(`${key}: no longer notifies the added therapists after commit`);
  } else if (notifies.some((at) => at < span.end)) {
    faults.push(`${key}: notifies the added therapists BEFORE the commit (inside or ahead of runScoped)`);
  }
  return faults;
}

const NOTIFY_RE = /emitCareTeamNotices\(|emitCareTeamAddedNotifications\(/;

describe("CARE-02c: every appointment insert has a care-team verdict", () => {
  const sites = insertSites();

  it("finds the insert sites at all (the scanner is not silently empty)", () => {
    // Seven sites named on the card, plus the dev seed.
    expect(sites.length).toBeGreaterThanOrEqual(7);
    expect(sites.some((s) => s.file === "apps/web/lib/scheduling/batch.ts")).toBe(true);
    expect(sites.some((s) => s.file === "apps/api/lib/appointments/store.ts")).toBe(true);
  });

  it("REGISTERS every insert site: an unlisted one fails here, naming itself", () => {
    const unknown = sites.filter((s) => !(`${s.file}#${s.fn}` in PATHS));
    expect(
      unknown.map((s) => `${s.file}:${s.line} in ${s.fn}()`),
      "A new appointment insert was added and has no care-team verdict in " +
        "creation-paths-write-care-team.test.ts. Either pass its transaction to " +
        "addBookedTherapistsToCareTeam and notify after commit, or record here why it does not.",
    ).toEqual([]);
  });

  it("keeps no entry for a path that no longer inserts", () => {
    const live = new Set(sites.map((s) => `${s.file}#${s.fn}`));
    expect(Object.keys(PATHS).filter((k) => !live.has(k))).toEqual([]);
  });

  it("every WRITES verdict passes its own transaction to the writer and notifies after commit", () => {
    const broken: string[] = [];
    for (const [key, v] of Object.entries(PATHS)) {
      if (v.kind !== "writes") continue;
      const [file, fn] = key.split("#") as [string, string];
      const body = functionBody(file, fn);
      if (body === "") {
        broken.push(`${key}: function not found`);
        continue;
      }
      // The transaction variable is `tx` at every staff site: the call must be
      // INSIDE the insert's transaction, which is what makes the row commit or
      // roll back with the booking.
      if (!/addBookedTherapistsToCareTeam\(\s*tx,/.test(body)) {
        broken.push(`${key}: no longer calls addBookedTherapistsToCareTeam(tx, ...)`);
      }
      // The write inside the transaction, every notice after it has closed.
      broken.push(...txOrderFaults(key, body, NOTIFY_RE));
      // The write must come after the insert it follows, or it reads no rows.
      const insertAt = body.search(INSERT_RE);
      const writeAt = body.search(/addBookedTherapistsToCareTeam\(/);
      if (insertAt === -1 || writeAt < insertAt) {
        broken.push(`${key}: the care-team write does not follow the appointment insert`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("the ordering check itself: a notice inside the callback fails, one after it passes", () => {
    const shape = (inside: string, after: string): string =>
      [
        "async function f() {",
        "  const r = await runScoped(actor, async (tx) => {",
        '    log("a stray ( in a string");',
        "    await tx.insert(appointments).values(v); // and one ( in a note",
        "    added = await addBookedTherapistsToCareTeam(tx, actor, ids);",
        inside,
        "    return out;",
        "  });",
        after,
        "}",
      ].join("\n");
    const notice = "    await emitCareTeamNotices(actor, added);";
    expect(txOrderFaults("good", shape("", notice), NOTIFY_RE)).toEqual([]);
    expect(txOrderFaults("inside", shape(notice, ""), NOTIFY_RE)).toEqual([
      "inside: notifies the added therapists BEFORE the commit (inside or ahead of runScoped)",
    ]);
    expect(txOrderFaults("none", shape("", ""), NOTIFY_RE)).toEqual([
      "none: no longer notifies the added therapists after commit",
    ]);
    const outside = shape("", notice).replace(
      "    added = await addBookedTherapistsToCareTeam(tx, actor, ids);\n",
      "",
    ) + "\nadded = await addBookedTherapistsToCareTeam(tx, actor, ids);";
    expect(txOrderFaults("outside", outside, NOTIFY_RE)).toEqual([
      "outside: the care-team write is not inside the runScoped transaction",
    ]);
  });

  it("A RESCHEDULE TO A NEW TERAPEUTA writes too: only the moved rows, only the Terapeuta slot", () => {
    const body = functionBody("apps/web/lib/scheduling/actions.ts", "rescheduleAppointment");
    expect(body.length).toBeGreaterThan(2000);
    expect(body).toMatch(/a\.practitionerId !== input\.practitionerId/);
    expect(body).toMatch(/addBookedTherapistsToCareTeam\(tx, actor, movedToNewTherapist, \{\s*slots: "primary",?\s*\}\)/);
    expect(body).toContain("emitCareTeamNotices(actor, careTeamAdded)");
    // The notice after the commit, the write inside the transaction.
    expect(txOrderFaults("rescheduleAppointment", body, NOTIFY_RE)).toEqual([]);
    // After the UPDATE, so the read-back sees the new Terapeuta.
    expect(body.indexOf("addBookedTherapistsToCareTeam(")).toBeGreaterThan(
      body.indexOf(".update(appointments)"),
    );
  });

  it("the portal insert says, at the site, why it writes no care-team row", () => {
    const src = fs.readFileSync(path.join(ROOT, "apps/api/lib/appointments/store.ts"), "utf8");
    expect(src).toContain("CARE-02c: THIS INSERT WRITES NO CARE-TEAM ROW");
  });
});
