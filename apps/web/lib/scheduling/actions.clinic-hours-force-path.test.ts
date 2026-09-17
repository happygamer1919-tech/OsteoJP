import { vi, describe, it, expect, beforeEach } from "vitest";

/**
 * actions.clinic-hours-force-path.test.ts — AGENDA-2100 B7: WHAT "GUARDAR MESMO
 * ASSIM" CAN AND CANNOT REACH AT THE END OF THE CLINIC'S DAY.
 *
 * ==========================================================================
 * THE DISPATCH'S PREMISE IS WRONG IN ONE PLACE, AND THIS FILE IS WHERE IT IS
 * WRITTEN DOWN
 * ==========================================================================
 * B7 F3 asks for: clinic closes 21:00, the therapist's Horários end 20:00,
 * "staff create at 20:00 with allowConflict ACCEPTED; without it refused as
 * today". The first half does not hold, and it does not hold for a reason that
 * predates this card by a month.
 *
 * `checkAvailability` (RB-03, 2026-08-20) sits OUTSIDE the `allowConflict` gate
 * exactly as the clinic rules do — its own header says so: "an override that
 * reinstates the exact defect is not an override, it is a bypass". So a booking
 * the THERAPIST's hours do not cover is refused whether or not the override is
 * set, and `allowConflict` cannot buy a 20:00 start from a therapist who stops
 * at 20:00.
 *
 * And a 20:00 start is never covered by a template ending 20:00 for arithmetic
 * reasons, not policy ones: `evaluateAvailability` measures the WHOLE window
 * (`endMin = startMin + duration`) against `isRangeCovered`, so 20:00-21:00
 * needs cover to 21:00. There is no duration for which a start AT the
 * template's end is inside it.
 *
 * ==========================================================================
 * WHICH REFUSAL WINS IS ITSELF THE FACT WORTH PINNING
 * ==========================================================================
 * Availability is checked BEFORE the clinic window on every path. So at a
 * clinic closing 21:00 with a therapist ending 20:00, a 20:15 attempt comes
 * back `outside_availability`, NOT `outside_clinic_hours` — the therapist's
 * hours are the narrower fact and they are read first. Reception is told to
 * extend the therapist's Horários, which is the action that would actually make
 * the booking possible; being told "the clinic closes at 21:00" would send them
 * to a screen that is already correct.
 *
 * Both codes are proven here against the SAME clinic, separated only by the
 * therapist's template, so the ordering is stated by the suite rather than
 * inherited from whichever arm happened to be written.
 *
 * It drives `cloneAppointment` for the same reason
 * actions.clinic-hours-enforced.test.ts does: that path's fake transaction is
 * the established one, and the clone is where a missing clinic rule has bitten
 * before.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@osteojp/auth", () => ({
  assertCan: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAppointmentAudit: vi.fn(async () => {}) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("./conflict", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./conflict")>()),
  findConflictsForWindow: vi.fn(async () => []),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { findConflictsForWindow } from "./conflict";
import { cloneAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockFindConflicts = vi.mocked(findConflictsForWindow);
const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

/** 2026-09-10 is a THURSDAY (weekday 4). Lisbon is UTC+1 in September. */
const WEEKDAY = 4;

/** The therapist's Horários as B7 F3 states them: the day ends at 20:00. */
const ENDS_20 = {
  weekday: WEEKDAY,
  startTime: "07:00:00",
  endTime: "20:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
};

/**
 * A template that cannot refuse anything this suite books. It exists so the
 * clinic-hours arms below are refused by the rule they name and not by the
 * therapist — the same device actions.clinic-hours-enforced.test.ts uses, and
 * for the same reason: without it, every "clinic refuses" assertion would pass
 * on an `outside_availability` that never reached the clinic check.
 */
const WIDE = { ...ENDS_20, endTime: "23:00:00" };

/** 09:00-10:00 Lisbon on an earlier day: the clone's duration is SIXTY MINUTES. */
const SOURCE_ROW = {
  patientId: "patient-1",
  practitionerId: "therapist-1",
  locationId: "loc-1",
  serviceId: "svc-1",
  patientTwoId: null,
  practitionerTwoId: null,
  startsAt: new Date("2026-09-03T08:00:00.000Z"),
  endsAt: new Date("2026-09-03T09:00:00.000Z"),
  packInstanceId: null,
  room: null,
  notes: null,
  status: "completed",
};

/** The clinic the owner is moving to: open 09:00, closed 21:00, last start 20:00. */
const CLINIC_09_21 = [
  {
    name: "Linda-a-Velha",
    opensAt: "09:00:00",
    closesAt: "21:00:00",
    middayClosedFrom: null,
    middayClosedTo: null,
  },
];

let inserted: Record<string, unknown> | null = null;

/** Discriminates by REQUESTED COLUMNS, exactly as the clone suites next door. */
function fakeTx(clinicRows: unknown[], templates: unknown[]) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows =
            cols && "weekday" in cols
              ? templates
              : cols && "patientTwoId" in cols
                ? [SOURCE_ROW]
                : cols && "middayClosedFrom" in cols
                  ? clinicRows
                  : [];
          const p = Promise.resolve(rows);
          return Object.assign(p, { limit: async () => rows });
        },
      }),
    }),
    execute: async () => [],
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v;
        return { returning: async () => [{ id: "new-appt-1" }] };
      },
    }),
  };
}

function arrange(templates: unknown[]) {
  inserted = null;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockFindConflicts.mockReset();
  mockFindConflicts.mockResolvedValue([]);
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) =>
    Promise.resolve(cb(fakeTx(CLINIC_09_21, templates) as never)),
  );
}

beforeEach(() => arrange([WIDE]));

/** Lisbon wall-clock on Thursday 2026-09-10, as the UTC instant the action takes. */
const lisbon = (hhmm: string) =>
  `2026-09-10T${String(Number(hhmm.slice(0, 2)) - 1).padStart(2, "0")}${hhmm.slice(2)}:00.000Z`;

describe("AGENDA-2100 F3: the therapist's day ends at 20:00, the clinic's at 21:00", () => {
  /**
   * THE ARM THAT CORRECTS THE DISPATCH. B7 expected this to be ACCEPTED with
   * allowConflict. It is not, and it never was: RB-03 put availability outside
   * the override gate in August.
   */
  it("REFUSES a 20:00 start as outside_availability, and the override does NOT buy it", async () => {
    arrange([ENDS_20]);
    const forced = await cloneAppointment("src-1", lisbon("20:00"), true);
    expect(forced.ok).toBe(false);
    expect(forced.ok === false && forced.error).toBe("outside_availability");
    expect(inserted).toBeNull();
  });

  it("refuses the same 20:00 start WITHOUT the override too, with the same code", async () => {
    // The pair is the point: if these two ever diverge, `allowConflict` has
    // found its way to a rule the ruling puts beyond it.
    arrange([ENDS_20]);
    const plain = await cloneAppointment("src-1", lisbon("20:00"), false);
    expect(plain.ok === false && plain.error).toBe("outside_availability");
    expect(inserted).toBeNull();
  });

  it("NAMES the therapist's own window, which is the hours reception must extend", async () => {
    arrange([ENDS_20]);
    const r = await cloneAppointment("src-1", lisbon("20:00"), true);
    expect(r.ok === false && r.availabilityWindows).toEqual([
      { startTime: "07:00", endTime: "20:00" },
    ]);
  });

  /**
   * THE ORDER, STATED RATHER THAN INHERITED. 20:15 is outside BOTH rules here.
   * Availability is read first, so that is the sentence reception gets — and it
   * is the useful one, because extending the template is what would make this
   * booking possible and the clinic's 21:00 is already correct.
   */
  it("reports 20:15 as outside_availability, not outside_clinic_hours, when the therapist is the narrower rule", async () => {
    arrange([ENDS_20]);
    const r = await cloneAppointment("src-1", lisbon("20:15"), true);
    expect(r.ok === false && r.error).toBe("outside_availability");
    expect(inserted).toBeNull();
  });
});

describe("AGENDA-2100 F3: with the therapist's hours out of the way, the CLINIC decides", () => {
  it("ACCEPTS the 20:00 start the owner asked for", async () => {
    // The negative arm for the whole file: if this refused, every refusal above
    // could be explained by something other than the rule it names.
    const r = await cloneAppointment("src-1", lisbon("20:00"), false);
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });

  it("REFUSES 20:15 as outside_clinic_hours, EVEN with the override", async () => {
    const r = await cloneAppointment("src-1", lisbon("20:15"), true);
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(r.ok === false && r.clinicWindow).toEqual({
      reason: "after_latest_start",
      locationName: "Linda-a-Velha",
      opensAt: "09:00",
      closesAt: "21:00",
      latestStart: "20:00",
    });
    expect(inserted).toBeNull();
  });

  /**
   * END-AFTER-CLOSE IS NOT A RULE, and this arm is what keeps that honest. The
   * accepted 20:00 booking above is SIXTY MINUTES long and therefore ends at
   * 21:00, the closing minute; a 90-minute service would end at 21:30 and would
   * also be accepted. AGENDA-2100 deliberately did not invent that rule, so a
   * future reader who assumes it exists fails here rather than in production.
   */
  it("does not check the END against closes_at - the accepted booking runs to 21:00", async () => {
    const r = await cloneAppointment("src-1", lisbon("20:00"), false);
    expect(r.ok).toBe(true);
    const ends = inserted?.endsAt as Date;
    expect(ends.toISOString()).toBe("2026-09-10T20:00:00.000Z"); // 21:00 Lisbon
  });
});
