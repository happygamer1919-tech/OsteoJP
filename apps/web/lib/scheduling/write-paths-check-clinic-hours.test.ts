/**
 * write-paths-check-clinic-hours.test.ts — AGENDA-2100: EVERY DOOR PAYS THE
 * CLINIC'S HOURS.
 *
 * ==========================================================================
 * WHY A SOURCE SCAN, AND IT IS THE SAME ARGUMENT OBS-05 MAKES NEXT DOOR
 * ==========================================================================
 * The defect class here is an ABSENCE: a write path that never asks whether the
 * building is open. That is exactly what M2 found - `batchScheduleAppointments`
 * checked neither the therapist's hours nor the clinic's, so Agendar lote could
 * write 21:30 at a clinic that shuts at 20:00, silently and with nothing on
 * screen. A behavioural test proves the paths it names; it cannot notice the
 * path nobody named, and the sixth door added next month is the same bug again.
 *
 * So this gate enumerates the entry points and requires each to be ACCOUNTED
 * FOR, with a verdict - the shape `creation-paths-emit-reminders.test.ts`
 * established for the same reason.
 *
 * ==========================================================================
 * COMMENTS ARE STRIPPED FIRST
 * ==========================================================================
 * `actions.ts` now DESCRIBES this rule at length, naming `checkClinicWindow` in
 * prose beside every call. A scan over raw text would match the description and
 * pass on code that deleted the call. bookable-parity.test.ts pins that same
 * hazard with a stripper self-test; this file borrows it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const ACTIONS = stripComments(readFileSync(join(__dirname, "actions.ts"), "utf8"));
const BATCH = stripComments(readFileSync(join(__dirname, "batch.ts"), "utf8"));

/**
 * The entry points that CREATE or MOVE an appointment, from M2's walk of the
 * tree. Each carries what it is, so a reader can tell a deliberate silence from
 * an owed one.
 *
 * NOT LISTED, and each for a reason that is a fact about the code rather than a
 * preference:
 *   - drag and resize: THE AGENDA HAS NEITHER. Grepped for `draggable`,
 *     `onDragStart`, `DndContext` and `resizable` across apps/web/app/agenda:
 *     zero hits. A time is changed through the drawer, which is
 *     `rescheduleAppointment` below.
 *   - the SMS review queue: `markRescheduleRequestHandled` STAMPS the request
 *     and deliberately does not move the booking ("reception moves appointments
 *     in the agenda, where the conflict checks, the slot lock and the audit
 *     trail live"). It writes no appointment row, so it has no window to check.
 *   - the portal's two write paths: they are SQL, in apps/api, and are pinned by
 *     portal-clinic-hours-parity.test.ts instead.
 */
const WRITE_PATHS = [
  { fn: "createAppointment", what: "Nova marcação, and every recurrence occurrence", src: ACTIONS },
  { fn: "cloneAppointment", what: "Marcar novamente", src: ACTIONS },
  { fn: "updateAppointment", what: "the Estado path, including bringing a Cancelada back", src: ACTIONS },
  { fn: "rescheduleAppointment", what: "Reagendar, every target of a series", src: ACTIONS },
  // AGENDA-2100: Agendar lote checks inside the ENGINE's own transaction, which
  // is the transaction that writes the rows, and throws ClinicHoursRefused for
  // the action to map. So the call lives in batch.ts and the error code in
  // actions.ts - both are asserted below.
  { fn: "batchSchedule", what: "Agendar lote (the engine)", src: BATCH },
] as const;

/** The body of one exported function, up to the next top-level export. */
function bodyOf(fn: string, src: string = ACTIONS): string {
  const start = src.indexOf(`export async function ${fn}(`);
  if (start === -1) throw new Error(`${fn} is not an exported function in the source given`);
  const rest = src.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("AGENDA-2100: every write path checks the clinic's hours", () => {
  it("finds all five entry points, so the assertions below cannot pass over nothing", () => {
    // VACUOUS-PASS GUARD. A renamed action would otherwise make every `toMatch`
    // below run against an empty string and go green.
    for (const p of WRITE_PATHS) {
      expect(bodyOf(p.fn, p.src).length, `${p.fn} body`).toBeGreaterThan(200);
    }
  });

  for (const p of WRITE_PATHS) {
    it(`${p.fn} (${p.what}) calls checkClinicWindow`, () => {
      expect(bodyOf(p.fn, p.src)).toMatch(/checkClinicWindow\s*\(/);
    });

    it(`${p.fn} surfaces the refusal as outside_clinic_hours, never as conflict`, () => {
      // The code must not be overridable: `conflict` is what "Guardar mesmo
      // assim" clears, and the ruling puts the clinic's hours outside it.
      //
      // The engine THROWS a typed refusal instead of returning an ActionResult,
      // so for that one the code is asserted where it is produced: the action's
      // catch, which maps it by instance.
      const body = bodyOf(p.fn, p.src);
      if (p.src === ACTIONS) {
        expect(body).toMatch(/error:\s*"outside_clinic_hours"/);
      } else {
        expect(body).toMatch(/throw new ClinicHoursRefused\(/);
        expect(ACTIONS).toMatch(/e instanceof ClinicHoursRefused/);
        expect(ACTIONS).toMatch(/error:\s*"outside_clinic_hours",\s*clinicWindow:\s*e\.window/);
      }
    });
  }

  it("the four paths that already refused the midday closure still do", () => {
    // Regression: the new check is a NEIGHBOUR of the closure check, never a
    // replacement. 0085's rule must survive this card untouched.
    for (const fn of [
      "createAppointment",
      "cloneAppointment",
      "updateAppointment",
      "rescheduleAppointment",
    ]) {
      expect(bodyOf(fn), fn).toMatch(/checkClinicClosure\s*\(/);
    }
  });

  it("no write path puts the clinic-hours check inside the allowConflict gate", () => {
    // The gate opens with `if (!input.allowConflict) {` / `if (!allowConflict) {`.
    // Everything after that line in a body is reachable only when the override
    // is absent, so a check that landed there would be pressable past.
    for (const p of WRITE_PATHS) {
      const body = bodyOf(p.fn, p.src);
      const gate = body.search(/if\s*\(\s*!\s*(?:input\.)?allowConflict\s*\)/);
      if (gate === -1) continue; // batch has no override at all
      const call = body.search(/checkClinicWindow\s*\(/);
      expect(call, `${p.fn}: the clinic-hours check must precede the allowConflict gate`)
        .toBeLessThan(gate);
    }
  });

  it("the stripper really removes prose, or every assertion above is theatre", () => {
    const pretend = stripComments(`
      // this comment mentions checkClinicWindow( and error: "outside_clinic_hours"
      /* and so does this block, at length: checkClinicWindow( */
      export async function createAppointment() { return 1; }
    `);
    expect(pretend).not.toMatch(/checkClinicWindow\s*\(/);
  });
});
