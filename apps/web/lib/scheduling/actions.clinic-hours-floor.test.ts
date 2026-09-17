import { vi, describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * actions.clinic-hours-floor.test.ts — AGENDA-2100 B7: `opens_at` IS A FLOOR,
 * AND IT IS ONE ON THE PATH RECEPTION ACTUALLY USES.
 *
 * ==========================================================================
 * WHAT THIS ADDS, AND WHY IT IS NOT A DUPLICATE
 * ==========================================================================
 * The floor already exists — B7 F1 measured it, it is not new code. What did
 * NOT exist is proof of it on `createAppointment`. The three suites AGENDA-2100
 * shipped divide as:
 *
 *   clinic-hours-window.test.ts          the pure arithmetic (09:00 ok, 08:45
 *                                        before_open) and nothing about actions
 *   actions.clinic-hours-enforced.test.ts  one action, the CLONE, end to end
 *   write-paths-check-clinic-hours.test.ts every door CALLS the check
 *
 * So the floor's behaviour was proven on Marcar novamente and on no other door.
 * The source gate proves `createAppointment` calls `checkClinicWindow`; it
 * cannot prove the answer survives the trip back — that the code is
 * `outside_clinic_hours`, that the payload names the opening hour, that nothing
 * is written, and that "Guardar mesmo assim" does not reach it. Nova marcação is
 * where the LV problem lands (15 active schedule rows start before 09:00), so it
 * is the door that most needs stating.
 *
 * ==========================================================================
 * THE THERAPIST'S HOURS ARE DELIBERATELY WIDE
 * ==========================================================================
 * `checkAvailability` runs BEFORE this check on every path. A template starting
 * at 09:00 would refuse the 08:45 arm as `outside_availability` and this suite
 * would go green while proving nothing about the clinic. 07:00-23:00 leaves the
 * clinic's own hours as the only thing that can refuse. The interaction between
 * the two rules is the subject of actions.clinic-hours-force-path.test.ts.
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
vi.mock("@/lib/auth/viewer-locations", () => ({
  bookingLocationScope: vi.fn(async () => null),
  isLocationBookable: vi.fn(() => true),
  resolveViewerLocationIds: vi.fn(async () => []),
}));
vi.mock("./shared-resources", () => ({
  listSharedResources: vi.fn(async () => []),
  listSharedResourcesTx: vi.fn(async () => []),
}));
/**
 * `ClinicHoursRefused` STAYS REAL. The action maps the batch refusal BY
 * INSTANCE, so a stubbed class would make the mapping arm below pass against a
 * different error than the engine throws — which is the exact failure
 * `vi.mock` factories cause when they replace a whole module.
 */
vi.mock("./batch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./batch")>()),
  batchSchedule: vi.fn(),
}));

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { findConflictsForWindow } from "./conflict";
import { batchSchedule, ClinicHoursRefused } from "./batch";
import { batchScheduleAppointments, createAppointment } from "./actions";
import type { RequestContext } from "@osteojp/auth";
import type { CreateAppointmentInput } from "./types";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockFindConflicts = vi.mocked(findConflictsForWindow);
const mockBatch = vi.mocked(batchSchedule);
const actor: RequestContext = { tenantId: "tenant-A", role: "admin", userId: "user-1" };

/** 2026-09-10 is a THURSDAY (weekday 4). Lisbon is UTC+1 in September. */
const WIDE_HOURS = {
  weekday: 4,
  startTime: "07:00:00",
  endTime: "23:00:00",
  validFrom: null,
  validUntil: null,
  isActive: true,
};

/** The clinic as `readClinic` selects it. */
const clinic = (opensAt: string, closesAt: string) => [
  { name: "Linda-a-Velha", opensAt, closesAt, middayClosedFrom: null, middayClosedTo: null },
];

/** The hours GREEN sets after #1383 reaches production. */
const NEW_HOURS = clinic("09:00:00", "21:00:00");
/** Production's hours today, so the floor is shown to be data-driven, not 09:00-shaped. */
const TODAY_HOURS = clinic("08:00:00", "20:00:00");

let inserted: Record<string, unknown> | null = null;

/** Discriminates by REQUESTED COLUMNS rather than by call order, as its neighbours do. */
function fakeTx(clinicRows: unknown[]) {
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: () => {
          const rows =
            cols && "weekday" in cols
              ? [WIDE_HOURS]
              : cols && "middayClosedFrom" in cols
                ? clinicRows
                : [];
          return Object.assign(Promise.resolve(rows), { limit: async () => rows });
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

/** Lisbon wall-clock on Thursday 2026-09-10, as the UTC instant the action takes. */
const lisbon = (hhmm: string) =>
  `2026-09-10T${String(Number(hhmm.slice(0, 2)) - 1).padStart(2, "0")}${hhmm.slice(2)}:00.000Z`;

/**
 * THE OVERRIDE IS ON BY DEFAULT, on purpose and for the reason RB-03's suite
 * gives: if "Guardar mesmo assim" reached the clinic's hours, the rule would be
 * one click from gone and every other assertion here would still pass.
 */
const input = (startHHMM: string, endHHMM: string): CreateAppointmentInput =>
  ({
    patientId: "patient-1",
    practitionerId: "therapist-1",
    locationId: "loc-1",
    serviceId: "svc-1",
    room: null,
    startsAt: lisbon(startHHMM),
    endsAt: lisbon(endHHMM),
    notes: null,
    recurrence: null,
    allowConflict: true,
  }) as CreateAppointmentInput;

function arrange(clinicRows: unknown[] = NEW_HOURS) {
  inserted = null;
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockFindConflicts.mockReset();
  mockFindConflicts.mockResolvedValue([]);
  mockCtx.mockResolvedValue(actor);
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx(clinicRows) as never)));
}

beforeEach(() => arrange());

describe("AGENDA-2100 F2: Nova marcação at a clinic that opens at 09:00", () => {
  it("ACCEPTS 09:00, the opening minute itself", async () => {
    // The boundary is the common case, not an edge: it is the first slot
    // reception books. It is also the negative arm for this whole file - if the
    // floor refused its own boundary, every refusal below would still pass.
    const r = await createAppointment(input("09:00", "10:00"));
    expect(r.ok).toBe(true);
    expect(inserted).not.toBeNull();
  });

  it("REFUSES 08:45, and writes nothing", async () => {
    // LV has 15 active schedule rows that start before 09:00. Without this the
    // therapist's own template would go on admitting 08:00 at a shut building.
    const r = await createAppointment(input("08:45", "09:45"));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(inserted).toBeNull();
  });

  it("NAMES the clinic and the hour it opens, so the next attempt is informed", async () => {
    const r = await createAppointment(input("08:45", "09:45"));
    expect(r.ok === false && r.clinicWindow).toEqual({
      reason: "before_open",
      locationName: "Linda-a-Velha",
      opensAt: "09:00",
      closesAt: "21:00",
      latestStart: "20:00",
    });
  });

  it("stays refused with allowConflict, because the override must not reach it", async () => {
    // Every arm in this file already sets allowConflict: true. This one says so
    // out loud, so a future reader cannot mistake the default for an oversight.
    const r = await createAppointment({ ...input("08:45", "09:45"), allowConflict: true });
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(inserted).toBeNull();
  });
});

describe("AGENDA-2100 F2: the floor follows the DATA, not the number 09:00", () => {
  it("accepts 08:00 and refuses 07:45 at today's production hours", async () => {
    // The same rule at 08:00-20:00. If the floor were hard-coded to the new
    // hours this pair would inverted, and the code change would not be the
    // data-driven one #1383 claims.
    arrange(TODAY_HOURS);
    expect((await createAppointment(input("08:00", "09:00"))).ok).toBe(true);

    arrange(TODAY_HOURS);
    const early = await createAppointment(input("07:45", "08:45"));
    expect(early.ok === false && early.error).toBe("outside_clinic_hours");
    expect(early.ok === false && early.clinicWindow?.reason).toBe("before_open");
    expect(inserted).toBeNull();
  });
});

describe("AGENDA-2100 F2: Agendar lote surfaces the floor as its own refusal", () => {
  const batchInput = {
    patientId: "patient-1",
    practitionerId: "therapist-1",
    locationId: "loc-1",
    slots: [],
  } as never;

  it("maps the engine's before_open refusal to outside_clinic_hours, with its payload", async () => {
    // The engine throws across the action boundary because a boolean cannot
    // carry the sentence reception reads. This is the other half of that
    // contract: the action must map it BY INSTANCE and keep the payload whole.
    mockBatch.mockRejectedValueOnce(
      new ClinicHoursRefused({
        reason: "before_open",
        locationName: "Linda-a-Velha",
        opensAt: "09:00",
        closesAt: "21:00",
        latestStart: "20:00",
      }),
    );
    const r = await batchScheduleAppointments(batchInput);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("outside_clinic_hours");
    expect(r.ok === false && r.clinicWindow?.reason).toBe("before_open");
    expect(r.ok === false && r.clinicWindow?.opensAt).toBe("09:00");
  });

  it("does NOT map an unrelated engine failure to the clinic's hours", async () => {
    // Without this, a catch-all that returned outside_clinic_hours for anything
    // would satisfy the arm above and tell reception the building was shut when
    // the engine had simply fallen over.
    mockBatch.mockRejectedValueOnce(new Error("connection reset"));
    const r = await batchScheduleAppointments(batchInput);
    expect(r.ok === false && r.error).not.toBe("outside_clinic_hours");
  });
});

/* ======================================================================== */
/* The other half of the ruling: an EXISTING early booking is left alone     */
/* ======================================================================== */

/**
 * "Existing appointments before opens_at render and are never cancelled."
 *
 * Rendering is proven in apps/web/app/agenda/agenda-grid-hours.test.tsx (an
 * 08:30 row under a 09:00 opening, day AND week). The other half is that the
 * clinic's hours must not become a reason a row cannot be REMOVED - a floor that
 * blocked cancelling would trap every one of LV's pre-09:00 bookings in the
 * diary, which is the opposite of what the ruling asks for.
 *
 * ASSERTED ON THE SOURCE, and deliberately: the claim is an ABSENCE, and an
 * absence is what a behavioural test cannot notice. `cancelAppointment` passing
 * today proves nothing about the day somebody adds the check "for consistency".
 * Comments are stripped first for the reason bookable-parity.test.ts states -
 * this file names `checkClinicWindow` in prose all the way down.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const ACTIONS = stripComments(readFileSync(join(__dirname, "actions.ts"), "utf8"));

/** The body of one exported function, up to the next top-level export. */
function bodyOf(fn: string): string {
  const start = ACTIONS.indexOf(`export async function ${fn}(`);
  if (start === -1) throw new Error(`${fn} is not an exported function`);
  const rest = ACTIONS.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("AGENDA-2100 F2: a booking made before the clinic opened can still be cancelled", () => {
  it("cancelAppointment does not consult the clinic's hours at all", () => {
    const body = bodyOf("cancelAppointment");
    expect(body.length, "cancelAppointment body").toBeGreaterThan(200);
    expect(body).not.toMatch(/checkClinicWindow\s*\(/);
    expect(body).not.toMatch(/outside_clinic_hours/);
  });

  it("nor does it consult the midday closure - vacating a slot is not a booking", () => {
    // Same reasoning, and it is 0085's existing behaviour rather than a new
    // claim: the closure has never blocked a cancel either.
    expect(bodyOf("cancelAppointment")).not.toMatch(/checkClinicClosure\s*\(/);
  });

  it("the stripper really removes prose, or both assertions above are theatre", () => {
    const pretend = stripComments(`
      // mentions checkClinicWindow( and outside_clinic_hours
      /* and so does this block: checkClinicWindow( */
      export async function cancelAppointment() { return 1; }
    `);
    expect(pretend).not.toMatch(/checkClinicWindow\s*\(/);
  });
});
