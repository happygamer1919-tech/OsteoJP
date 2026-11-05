/**
 * TIER C 0114 - THE CENSUS OF CLINIC CLOSURE READERS.
 *
 * A dated closure (a holiday, a closed day) must refuse wherever the lunch
 * closure refuses: "a reader you miss is a booking the clinic did not want".
 * The design rule is that both are read through the SAME functions, so this
 * test finds every application file that reads the lunch closure (the
 * `midday_closed_*` columns, or the helpers that apply them) and holds each to
 * one of two answers:
 *   - a CLOSURE READER, which must also name the dated-closure reader its side
 *     of the app uses, or
 *   - a listed file that does NOT decide whether a slot is bookable, with the
 *     reason.
 * A new file that reads the lunch closure and is on neither list fails here by
 * name, which is the moment somebody has to decide which kind it is.
 *
 * A SECOND HALF holds the write paths: every function that refuses with
 * `checkClinicWindow` (the clinic's own hours, the complete list of booking
 * doors, see write-paths-check-clinic-hours.test.ts) also refuses with
 * `checkClinicClosure`, and the pedido confirmation does too. And on the portal
 * side every `closureOverlapExists(` call passes the closure-table flag (its
 * own test, closed-days-portal.test.ts in apps/api).
 *
 * Scope: every app (web, api, portal, admin) and every package, in TypeScript
 * and JavaScript, tests and e2e specs excluded.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");
const ROOTS = ["apps/web", "apps/api", "apps/portal", "apps/admin", "packages"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "e2e", "migrations", "migrations-pending", ".turbo", ".lane"]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(name) && !/\.(test|spec)\.[cm]?[tj]sx?$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/** What counts as reading or applying the LUNCH closure. */
export const READS_LUNCH =
  /\bmiddayClosed(?:From|To)\b|\bmidday_closed_(?:from|to)\b|\bclosureFor\s*\(|\boverlapsClosure\s*\(|\bclosureOverlapExists\s*\(|\bcheckClinicClosure\s*\(/;

/** Closure readers, and the dated-closure reader each must also name. */
const CLOSURE_READERS: Record<string, RegExp> = {
  // The refusal every booking door shares: reads both, in one function.
  "apps/web/lib/scheduling/clinic-closure-enforcement.ts": /readClosedDays\s*\(/,
  // Every staff write path, through checkClinicClosure (which reads both).
  "apps/web/lib/scheduling/actions.ts": /checkClinicClosure\s*\(/,
  // Agendar lote's engine, through checkClinicClosure.
  "apps/web/lib/scheduling/batch.ts": /checkClinicClosure\s*\(/,
  // Nova marcacao, Agendar lote's free time and the Horarios inspector.
  "apps/web/lib/scheduling/day-availability.ts": /readClosedDays\s*\(/,
  // buildDay: the free-time subtraction both closures feed.
  "apps/web/lib/scheduling/day-availability-core.ts": /closedDayIntervals\s*\(/,
  // The agenda's closure band and its disabled slots, per displayed date.
  "apps/web/app/agenda/page.tsx": /readClosedDayBands\s*\(/,
  // The portal: slot grid, therapist list, booking and reschedule guards.
  "apps/api/lib/appointments/store.ts": /closedDayOverlapExists\s*\(/,
};

/** Files that read the lunch closure without deciding whether a slot is bookable. */
const NOT_A_BOOKING_READER: Record<string, string> = {
  "apps/web/lib/scheduling/clinic-hours.ts":
    "the pure arithmetic of the lunch closure (closureFor, overlapsClosure); the dated closures' arithmetic is closed-days-core.ts, and the readers above compose both",
  "apps/web/lib/scheduling/data.ts":
    "getAgendaOptions carries each clinic's hours to the agenda page; the page reads the dated closures for the displayed dates itself (readClosedDayBands)",
  "apps/web/lib/scheduling/types.ts": "the LocationOption type's two lunch-closure fields; no read",
  "packages/db/src/schema.ts": "the column declarations; no read",
};

const readers = ROOTS.flatMap((r) => walk(join(REPO, r)))
  .filter((p) => READS_LUNCH.test(stripComments(readFileSync(p, "utf8"))))
  .map((p) => relative(REPO, p).split("\\").join("/"))
  .sort();

describe("every clinic-closure reader is accounted for", () => {
  it("the pattern sees every read shape, and not a longer name", () => {
    for (const read of [
      "middayClosedFrom: locations.middayClosedFrom",
      "l.midday_closed_from is not null",
      "closureFor(date, clinicHours)",
      "overlapsClosure(a, b, d, h)",
      "${closureOverlapExists(principal.tenantId, l, s, e, closedDays)}",
      "await checkClinicClosure(tx, {",
    ]) {
      expect(READS_LUNCH.test(read), read).toBe(true);
    }
    for (const notRead of ["middayClosedFromX", "closureForecast(", "checkClinicClosureLater"]) {
      expect(READS_LUNCH.test(notRead), notRead).toBe(false);
    }
  });

  it("the scan is not vacuous", () => {
    expect(readers.length).toBeGreaterThanOrEqual(8);
  });

  it("each reader is on exactly one list", () => {
    const unknown = readers.filter((f) => !(f in CLOSURE_READERS) && !(f in NOT_A_BOOKING_READER));
    expect(unknown, "a new clinic-closure reader: decide whether it must honour dated closures").toEqual([]);
    for (const f of Object.keys(CLOSURE_READERS)) expect(f in NOT_A_BOOKING_READER, f).toBe(false);
  });

  it("each listed file still exists and still reads the lunch closure (no stale entry hides a move)", () => {
    expect(readers).toEqual([...Object.keys(CLOSURE_READERS), ...Object.keys(NOT_A_BOOKING_READER)].sort());
  });

  it("each closure reader also reads the dated closures, in code and not in a comment", () => {
    for (const [file, dated] of Object.entries(CLOSURE_READERS)) {
      expect(stripComments(readFileSync(join(REPO, file), "utf8")), file).toMatch(dated);
    }
  });

  it("CONTROL: the stripper removes prose, so a comment naming the reader cannot satisfy the check", () => {
    const pretend = stripComments(`
      // readClosedDays( in a comment
      /* closedDayOverlapExists( in a block */
      const x = 1;
    `);
    expect(pretend).not.toMatch(/readClosedDays\s*\(|closedDayOverlapExists\s*\(/);
  });

  it("the shared readers are the ones the dated closures reach: closed-days.ts behind the schema guard", () => {
    const src = stripComments(readFileSync(join(REPO, "apps/web/lib/scheduling/closed-days.ts"), "utf8"));
    const guard = src.indexOf("locationClosedDaysSchemaPresent(");
    const query = src.indexOf(".from(locationClosedDays)");
    expect(guard).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(guard);
  });
});

/* ======================================================================== */
/* THE DOORS, ACROSS EVERY FILE OF apps/web/lib AND apps/web/app            */
/* ======================================================================== */

const WEB_ROOTS = ["apps/web/lib", "apps/web/app"];

/** Every top-level function of a source, by name, with its body. */
function functionsOf(src: string): { name: string; body: string }[] {
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
  const starts = [...src.matchAll(re)].map((m) => ({ name: m[1]!, at: m.index! }));
  return starts.map((f, i) => ({ name: f.name, body: src.slice(f.at, starts[i + 1]?.at ?? src.length) }));
}

const webFiles = WEB_ROOTS.flatMap((r) => walk(join(REPO, r))).map((p) => ({
  file: relative(REPO, p).split("\\").join("/"),
  src: stripComments(readFileSync(p, "utf8")),
}));

/** `file#function` for every function, in any web file, whose body matches. */
function doorsMatching(re: RegExp): string[] {
  return webFiles
    .flatMap(({ file, src }) => functionsOf(src).filter((f) => re.test(f.body)).map((f) => `${file}#${f.name}`))
    .sort();
}

const CLOSURE_CHECK = /checkClinicClosure\s*\(/;

/** The definitions themselves, which are not doors. */
const DEFINITIONS = new Set([
  "apps/web/lib/scheduling/clinic-closure-enforcement.ts#checkClinicClosure",
  "apps/web/lib/scheduling/clinic-closure-enforcement.ts#checkClinicWindow",
  "apps/web/lib/scheduling/clinic-closure-enforcement.ts#clinicClosurePayload",
  "apps/web/lib/scheduling/pedido-acceptance.ts#acceptedPedidoTarget",
]);

/**
 * PEDIDO ACCEPTANCE DOORS THAT DO NOT CHECK CLOSURES YET, PINNED BY NAME.
 * lib/scheduling/pedido-acceptance.ts lists four doors that accept a portal
 * pedido. Two live under lib/reminders, the reminder path that must not change
 * while the reminder sweep runs in shadow (strategy R9). They are deferred, not
 * forgotten: this list must equal the doors that skip the check EXACTLY, so a
 * fifth door that skips it fails here, and so does fixing one of these two
 * without taking it off the list. Until both check closures, converting the
 * interim "Feriado" person blocks into closures (owner answer C6) must wait:
 * a Feriado time_off block refuses at all four doors today, a closure at two.
 */
const DEFERRED_ACCEPTANCE_DOORS: Record<string, string> = {
  "apps/web/lib/reminders/inbound-store.ts#resolveReviewItem": "reminder path, after the sweep switch (R9)",
  "apps/web/lib/reminders/inbound-reply.ts#applyInboundReply": "reminder path, after the sweep switch (R9)",
};

describe("every door, in every web file, refuses a closure", () => {
  it("the function splitter finds functions (not vacuous)", () => {
    expect(functionsOf("export async function a() {}\nfunction b() {}\nexport function c() {}").map((f) => f.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(webFiles.length).toBeGreaterThan(200);
  });

  it("every function that checks the clinic's hours also checks its closures", () => {
    const doors = doorsMatching(/checkClinicWindow\s*\(/).filter((d) => !DEFINITIONS.has(d));
    expect(doors.length).toBeGreaterThanOrEqual(5);
    const skipping = doors.filter((d) => {
      const [file, name] = d.split("#");
      const fn = functionsOf(webFiles.find((w) => w.file === file)!.src).find((f) => f.name === name)!;
      return !CLOSURE_CHECK.test(fn.body);
    });
    expect(skipping, "a door checks the clinic's hours but not its closures").toEqual([]);
  });

  it("every function that ACCEPTS a portal pedido checks closures, but for the two pinned deferred doors", () => {
    const acceptors = doorsMatching(/acceptedPedidoTarget\s*\(/).filter((d) => !DEFINITIONS.has(d));
    expect(acceptors.length).toBeGreaterThanOrEqual(4);
    const skipping = acceptors.filter((d) => {
      const [file, name] = d.split("#");
      const fn = functionsOf(webFiles.find((w) => w.file === file)!.src).find((f) => f.name === name)!;
      return !CLOSURE_CHECK.test(fn.body);
    });
    expect(skipping).toEqual(Object.keys(DEFERRED_ACCEPTANCE_DOORS).sort());
    for (const reason of Object.values(DEFERRED_ACCEPTANCE_DOORS)) expect(reason).toMatch(/R9/);
  });

  it("the drawer and the Pedidos queue are acceptance doors that DO check (they are not on the deferred list)", () => {
    const acceptors = doorsMatching(/acceptedPedidoTarget\s*\(/);
    expect(acceptors).toContain("apps/web/lib/scheduling/actions.ts#updateAppointment");
    expect(acceptors).toContain("apps/web/lib/scheduling/actions.ts#confirmAppointmentRequest");
  });

  it("every caller of buildDay is the one availability read, which passes the dated closures", () => {
    const callers = doorsMatching(/\bbuildDay\s*\(/).filter((d) => !d.endsWith("#buildDay"));
    expect(callers).toEqual(["apps/web/lib/scheduling/day-availability.ts#getTherapistAvailability"]);
    const src = webFiles.find((w) => w.file === "apps/web/lib/scheduling/day-availability.ts")!.src;
    expect(src).toMatch(/buildDay\(date, templates, bookedRows, blockRows, clinicHours, closedDays\)/);
  });

  it("every web file that reads a lunch-closure helper is on the reader census above", () => {
    const users = webFiles.filter(({ src }) => READS_LUNCH.test(src)).map((w) => w.file);
    for (const f of users) expect(f in CLOSURE_READERS || f in NOT_A_BOOKING_READER, f).toBe(true);
  });
});

describe("every staff booking door refuses a closure", () => {
  const ACTIONS = stripComments(readFileSync(join(__dirname, "actions.ts"), "utf8"));
  const BATCH = stripComments(readFileSync(join(__dirname, "batch.ts"), "utf8"));

  function bodyOf(fn: string, src: string): string {
    const start = src.indexOf(`export async function ${fn}(`);
    if (start === -1) throw new Error(`${fn} is not an exported function`);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nexport ");
    return end === -1 ? rest : rest.slice(0, end);
  }

  /** Every exported function of actions.ts that checks the clinic's hours. */
  const hourCheckers = [...ACTIONS.matchAll(/export async function (\w+)\(/g)]
    .map((m) => m[1]!)
    .filter((fn) => /checkClinicWindow\s*\(/.test(bodyOf(fn, ACTIONS)));

  it("finds the booking doors (not vacuous)", () => {
    expect(hourCheckers.length).toBeGreaterThanOrEqual(4);
  });

  for (const fn of ["createAppointment", "cloneAppointment", "updateAppointment", "rescheduleAppointment"]) {
    it(`${fn} is one of them`, () => expect(hourCheckers).toContain(fn));
  }

  it("each door that checks the clinic's hours also checks its closures", () => {
    for (const fn of hourCheckers) expect(bodyOf(fn, ACTIONS), fn).toMatch(/checkClinicClosure\s*\(/);
  });

  it("the pedido confirmation checks the closures (a pedido made before a closure was entered)", () => {
    expect(bodyOf("confirmAppointmentRequest", ACTIONS)).toMatch(/checkClinicClosure\s*\(/);
  });

  it("Agendar lote's engine checks the closures per slot and refuses the whole batch", () => {
    const body = bodyOf("batchSchedule", BATCH);
    expect(body).toMatch(/checkClinicClosure\s*\(/);
    expect(body).toMatch(/throw new ClinicClosedRefused\(/);
    expect(ACTIONS).toMatch(/e instanceof ClinicClosedRefused/);
    expect(ACTIONS).toMatch(/error:\s*"clinic_closed",\s*clinicClosure:\s*e\.closure/);
  });

  it("every clinic_closed refusal carries its payload through clinicClosurePayload, so no door drops a dated closure's reason", () => {
    const sites = [...ACTIONS.matchAll(/error:\s*"clinic_closed",\s*clinicClosure:\s*([^\n}]+)/g)].map((m) => m[1]!.trim());
    expect(sites.length).toBeGreaterThanOrEqual(6);
    for (const s of sites) expect(s).toMatch(/^(clinicClosurePayload\(cl\)|e\.closure),?$/);
  });

  it("no door puts the closure check inside the allowConflict gate (a closure is never overridable)", () => {
    for (const fn of hourCheckers) {
      const body = bodyOf(fn, ACTIONS);
      const gate = body.search(/if\s*\(\s*!\s*(?:input\.)?allowConflict\s*\)/);
      if (gate === -1) continue;
      expect(body.search(/checkClinicClosure\s*\(/), fn).toBeLessThan(gate);
    }
  });
});
