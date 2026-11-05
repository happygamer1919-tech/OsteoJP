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

/* ------------------------------------------------------------------------ */
/* A SMALL FUNCTION FINDER. It finds function declarations (any depth),      */
/* `const x = (async) (...) =>` / `= function (...)` expressions, and class  */
/* or object methods, each with its body found by BRACE MATCHING (strings    */
/* and template literals skipped), never by "up to the next function". A     */
/* call to a door marker is then attributed to the OUTERMOST function that   */
/* contains it, and a call inside no found function is reported, so a shape  */
/* the finder does not know fails loudly instead of being attributed to the  */
/* function above it.                                                        */
/* ------------------------------------------------------------------------ */

type Fn = { name: string; start: number; end: number; body: string };

const NOT_A_METHOD = new Set([
  "if", "for", "while", "switch", "catch", "return", "function", "else", "do", "with",
  "new", "typeof", "await", "yield", "throw", "case", "void", "delete", "in", "of",
]);

/** Index just past the string or template literal starting at `i`. */
function skipLiteral(src: string, i: number): number {
  const q = src[i]!;
  let k = i + 1;
  while (k < src.length) {
    const c = src[k]!;
    if (c === "\\") {
      k += 2;
      continue;
    }
    if (q === "`" && c === "$" && src[k + 1] === "{") {
      k = matchClose(src, k + 1) + 1;
      continue;
    }
    if (c === q) return k + 1;
    if (q !== "`" && c === "\n") return k + 1;
    k++;
  }
  return k;
}

/** Index of the bracket closing the one at `open` ("(", "{" or "["). */
function matchClose(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack = [pairs[src[open]!]!];
  let k = open + 1;
  while (k < src.length && stack.length > 0) {
    const c = src[k]!;
    if (c === "'" || c === '"' || c === "`") {
      k = skipLiteral(src, k);
      continue;
    }
    if (c in pairs) stack.push(pairs[c]!);
    else if (c === stack[stack.length - 1]) stack.pop();
    if (stack.length === 0) return k;
    k++;
  }
  return src.length - 1;
}

/**
 * The end (exclusive) of the function whose parameter list opens at `paren`,
 * or null when what follows the parameters is not a function body (a call, an
 * overload signature).
 */
function bodyEnd(src: string, paren: number, arrow: boolean): number | null {
  let k = matchClose(src, paren) + 1;
  const firstAfter = src.slice(k).match(/^\s*(\S)/)?.[1];
  if (firstAfter === undefined) return null;
  if (arrow ? !(firstAfter === ":" || src.slice(k).trimStart().startsWith("=>")) : !(firstAfter === ":" || firstAfter === "{")) {
    return null;
  }
  let angle = 0;
  while (k < src.length) {
    const c = src[k]!;
    if (src.startsWith("=>", k)) {
      if (arrow && angle === 0) {
        k += 2;
        while (/\s/.test(src[k] ?? "")) k++;
        if (src[k] === "{") return matchClose(src, k) + 1;
        // An expression body: up to the end of the statement at depth 0.
        while (k < src.length && src[k] !== ";" && !(src[k] === "\n" && /^\n\s*(export|const|let|function|async|\})/.test(src.slice(k)))) {
          if ("({[".includes(src[k]!)) k = matchClose(src, k);
          else if (`'"\``.includes(src[k]!)) {
            k = skipLiteral(src, k);
            continue;
          }
          k++;
        }
        return k;
      }
      k += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      k = skipLiteral(src, k);
      continue;
    }
    if (c === "<") angle++;
    else if (c === ">") angle = Math.max(0, angle - 1);
    else if (c === "(" || c === "[") k = matchClose(src, k);
    else if (c === ";" && angle === 0) return null;
    else if (c === "{" && angle === 0) {
      const close = matchClose(src, k);
      const next = src.slice(close + 1).match(/^\s*(=>|\S)/)?.[1];
      // A type literal in a return type is followed by the body, an arrow or
      // a type operator; a body is followed by the next statement.
      if (next === "{" || next === "=>" || next === "|" || next === "&") {
        k = close + 1;
        continue;
      }
      if (arrow) {
        k = close + 1;
        continue;
      }
      return close + 1;
    }
    k++;
  }
  return null;
}

/** Every function the finder recognises in a (comment-stripped) source. */
function functionsOf(src: string): Fn[] {
  const shapes: { re: RegExp; arrow: boolean }[] = [
    // function declarations and named function expressions, at any depth
    { re: /(?:^|[\s;{}(,=])(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(?:<[^>()]*>)?\s*(\()/g, arrow: false },
    // const x = (async) (...) => ...   /   const x = (async) <T>(...) => ...
    { re: /(?:^|[\s;{}])(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*(?:async\s*)?(?:<[^>()]*>)?\s*(\()/g, arrow: true },
    // const x = (async) function (...) { ... }
    { re: /(?:^|[\s;{}])(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*(?:async\s+)?function\s*\*?\s*\w*\s*(?:<[^>()]*>)?\s*(\()/g, arrow: false },
    // class and object-literal methods
    { re: /\n[ \t]+(?:(?:public|private|protected|static|async|override|readonly|get|set)\s+)*(\w+)\s*(?:<[^>()]*>)?\s*(\()/g, arrow: false },
  ];
  const out: Fn[] = [];
  const seen = new Set<number>();
  for (const { re, arrow } of shapes) {
    for (const m of src.matchAll(re)) {
      const name = m[1]!;
      if (re === shapes[3]!.re && NOT_A_METHOD.has(name)) continue;
      const paren = m.index! + m[0].length - 1;
      if (seen.has(paren)) continue;
      const end = bodyEnd(src, paren, arrow);
      if (end === null) continue;
      seen.add(paren);
      const start = m.index! + (m[0].length - m[0].trimStart().length);
      out.push({ name, start, end, body: src.slice(start, end) });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/**
 * For every call of `marker` in `src`: the OUTERMOST found function containing
 * it (the door), or an orphan when no found function contains it.
 */
function doorsIn(file: string, src: string, marker: RegExp): { doors: Map<string, Fn>; orphans: number[] } {
  const fns = functionsOf(src);
  const doors = new Map<string, Fn>();
  const orphans: number[] = [];
  const re = new RegExp(marker.source, "g");
  for (const m of src.matchAll(re)) {
    const at = m.index!;
    const containing = fns.filter((f) => f.start <= at && at < f.end);
    if (containing.length === 0) {
      orphans.push(src.slice(0, at).split("\n").length);
      continue;
    }
    const outer = containing.reduce((o, f) => (f.start < o.start || (f.start === o.start && f.end > o.end) ? f : o));
    doors.set(`${file}#${outer.name}`, outer);
  }
  return { doors, orphans };
}

const webFiles = WEB_ROOTS.flatMap((r) => walk(join(REPO, r))).map((p) => ({
  file: relative(REPO, p).split("\\").join("/"),
  src: stripComments(readFileSync(p, "utf8")),
}));

/** Every door of `marker` across the web files, and every orphan call. */
function scan(marker: RegExp): { doors: Map<string, Fn>; orphans: string[] } {
  const doors = new Map<string, Fn>();
  const orphans: string[] = [];
  for (const { file, src } of webFiles) {
    const r = doorsIn(file, src, marker);
    for (const [k, v] of r.doors) doors.set(k, v);
    for (const line of r.orphans) orphans.push(`${file}:${line}`);
  }
  return { doors, orphans };
}

/** `file#function` for every door, in any web file, of this marker. */
function doorsMatching(re: RegExp): string[] {
  return [...scan(re).doors.keys()].sort();
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
  it("the finder sees declarations, arrow and function expressions, and methods, each with its own body", () => {
    const src = [
      "export async function a(x: { y: string }): Promise<{ z: number }> { return { z: 1 }; }",
      "function b() { const inner = () => 1; return inner(); }",
      "export const c = async (tx: unknown): Promise<void> => { await go(tx); };",
      "const d = function (q) { return q; };",
      "class K {",
      "  async e(p: string): Promise<string> { return p; }",
      "  static f() { if (x) { g(); } }",
      "}",
      "foo(1);",
    ].join("\n");
    const names = functionsOf(src).map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["a", "b", "inner", "c", "d", "e", "f"]));
    expect(names).not.toContain("foo");
    expect(names).not.toContain("if");
    const c = functionsOf(src).find((f) => f.name === "c")!;
    expect(c.body).toContain("await go(tx)");
    expect(c.body).not.toContain("function (q)");
    expect(webFiles.length).toBeGreaterThan(200);
  });

  it("PLANTED OFFENDER (red): an arrow-function door is found as itself, not credited to the function above it", () => {
    const fixture = [
      "export async function earlier(tx: unknown) {",
      "  await checkClinicClosure(tx, a);",
      "}",
      "export const acceptViaArrow = async (tx: unknown) => {",
      "  return acceptedPedidoTarget(a.id, a.startsAt, a.practitionerId);",
      "};",
      "class Q {",
      "  async acceptViaMethod(tx: unknown): Promise<unknown> {",
      "    return acceptedPedidoTarget(b.id, b.startsAt, b.practitionerId);",
      "  }",
      "}",
    ].join("\n");
    const { doors, orphans } = doorsIn("fixture.ts", fixture, /acceptedPedidoTarget\s*\(/);
    const skipping = [...doors].filter(([, f]) => !CLOSURE_CHECK.test(f.body)).map(([k]) => k).sort();
    expect(skipping).toEqual(["fixture.ts#acceptViaArrow", "fixture.ts#acceptViaMethod"]);
    expect(orphans).toEqual([]);
  });

  it("PLANTED ORPHAN (red): a door call in a shape the finder does not know is reported, never attributed", () => {
    const fixture = ["export async function earlier() { await checkClinicClosure(tx, a); }", "const t = acceptedPedidoTarget(a.id, s, p);"].join("\n");
    expect(doorsIn("fixture.ts", fixture, /acceptedPedidoTarget\s*\(/).orphans).toEqual([2]);
  });

  it("CLEAN TREE (green): no door call in any web file sits outside a found function", () => {
    expect(scan(/acceptedPedidoTarget\s*\(/).orphans).toEqual([]);
    expect(scan(/checkClinicWindow\s*\(/).orphans).toEqual([]);
  });

  it("every function that checks the clinic's hours also checks its closures", () => {
    const { doors } = scan(/checkClinicWindow\s*\(/);
    const live = [...doors].filter(([k]) => !DEFINITIONS.has(k));
    expect(live.length).toBeGreaterThanOrEqual(5);
    const skipping = live.filter(([, f]) => !CLOSURE_CHECK.test(f.body)).map(([k]) => k);
    expect(skipping, "a door checks the clinic's hours but not its closures").toEqual([]);
  });

  it("every function that ACCEPTS a portal pedido checks closures, but for the two pinned deferred doors", () => {
    const { doors } = scan(/acceptedPedidoTarget\s*\(/);
    const live = [...doors].filter(([k]) => !DEFINITIONS.has(k));
    expect(live.length).toBeGreaterThanOrEqual(4);
    const skipping = live.filter(([, f]) => !CLOSURE_CHECK.test(f.body)).map(([k]) => k).sort();
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
