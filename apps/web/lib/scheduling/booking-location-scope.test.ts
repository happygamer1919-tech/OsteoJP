/**
 * STAFF-02 — staff may not book into a location they are not assigned to, and
 * the SERVER is what refuses.
 *
 * ============================================================================
 * HOW THIS WAS FOUND, BECAUSE THE ROUTE MATTERS
 * ============================================================================
 * Carlos (reception) reported that appointments he booked for JP were missing
 * from his agenda. The read path was investigated first and found CORRECT: every
 * predicate on `listAppointments` was checked and **there is no role filter** —
 * PL-06b is intact. The recon halted there rather than guessing.
 *
 * The owner's observation settled it: the appointments existed, all at
 * **OsteoJP (CB)**, created by a staffer assigned to **LV only**. **PL-09 hid
 * them correctly.** The read path was never the defect.
 *
 * **PL-09 is what made the defect visible**: the read was scoped and the write
 * was scoped by nothing, so an LV-only receptionist could select CB and create
 * appointments he could then never see. Staff were booking blind.
 *
 * ============================================================================
 * THE FORM RESTRICTION IS THE COURTESY. THIS IS THE DELIVERABLE.
 * ============================================================================
 * A UI-only lock is the **INC-08 root cause repeated**: the Estado `<Select>`
 * offered every status with no server check, and reception reached an illegal
 * transition in one click. A restricted dropdown is defeated by a stale tab, a
 * second window, or any request that did not come from the form.
 *
 * So these tests drive the SERVER ACTIONS, never the form.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  /** The acting user's role and id, as `authorize` would resolve them. */
  role: "reception" as "reception" | "admin" | "therapist" | "owner",
  userId: "u-carlos",
  /** Rows `staff_locations` returns for the actor. */
  assigned: ["loc-lv"] as string[],
  /** True once a write actually reached the database. */
  wrote: false,
}));

vi.mock("server-only", () => ({}));

const LV = "loc-lv";
const CB = "loc-cb";

vi.mock("@/lib/auth/context", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/context")>();
  return {
    ...real,
    authorize: async () => ({ actor: { role: H.role, userId: H.userId, tenantId: "t-1" } }),
    isDenied: () => false,
    // `runScoped` is the RLS wrapper. `resolveViewerLocationIds` calls it, and so
    // does every write path; the fake returns the assignment rows for the former
    // and records that the latter got as far as the database.
    runScoped: async (_ctx: unknown, fn: (tx: unknown) => unknown) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        from: () => chain,
        where: () => Promise.resolve(H.assigned.map((locationId) => ({ locationId }))),
      };
      const tx = {
        ...chain,
        execute: async () => {
          H.wrote = true;
          return [];
        },
        insert: () => ({
          values: () => ({
            returning: async () => {
              H.wrote = true;
              return [{ id: "a-new" }];
            },
          }),
        }),
        update: () => ({ set: () => ({ where: async () => { H.wrote = true; return []; } }) }),
      };
      return fn(tx);
    },
  };
});

import { bookingLocationScope, isLocationBookable } from "@/lib/auth/viewer-locations";

const ctx = () => ({ role: H.role, userId: H.userId, tenantId: "t-1" }) as never;

beforeEach(() => {
  H.role = "reception";
  H.userId = "u-carlos";
  H.assigned = [LV];
  H.wrote = false;
});

describe("guard on the guard: the harness reflects the real assignment source", () => {
  it("reads the actor's own staff_locations rows", async () => {
    // If this returned [] regardless, every refusal below would pass for the
    // wrong reason — an empty scope is treated as UNRESTRICTED, so a broken
    // fixture would make the guard look permissive rather than strict.
    H.assigned = [LV, CB];
    expect(await bookingLocationScope(ctx())).toEqual([LV, CB]);
  });
});

describe("the scope itself", () => {
  it("REFUSES a location outside an LV-only receptionist's assignment", async () => {
    // The reported defect, as a predicate.
    const scope = await bookingLocationScope(ctx());
    expect(scope).toEqual([LV]);
    expect(isLocationBookable(scope, CB), "CB is not assigned and must be refused").toBe(false);
    expect(isLocationBookable(scope, LV), "LV is assigned and must be permitted").toBe(true);
  });

  it("permits BOTH locations for a two-location actor", async () => {
    H.assigned = [LV, CB];
    const scope = await bookingLocationScope(ctx());
    expect(isLocationBookable(scope, LV)).toBe(true);
    expect(isLocationBookable(scope, CB)).toBe(true);
  });

  it("leaves the OWNER unrestricted — null scope, unchanged", async () => {
    // The one role the ruling excepts. Asserted as `null` specifically, not just
    // "permits both": null is what tells every call site there is nothing to
    // check, and a scope that happened to list both locations would behave the
    // same today and diverge the moment a third clinic opened.
    H.role = "owner";
    H.assigned = [];
    expect(await bookingLocationScope(ctx())).toBeNull();
    expect(isLocationBookable(null, CB)).toBe(true);
  });

  it("scopes a THERAPIST too, which the READ scope deliberately does not", async () => {
    // The ruling covers reception, admin AND therapists. `viewerLocationScope`
    // returns null for a therapist — correct for reads, because they are bounded
    // by their own-data rules — so reusing it would have left this gap open one
    // role over. This is why there are two functions over one source.
    H.role = "therapist";
    H.assigned = [LV];
    expect(await bookingLocationScope(ctx())).toEqual([LV]);
    expect(isLocationBookable(await bookingLocationScope(ctx()), CB)).toBe(false);
  });

  it("falls back to UNRESTRICTED for a staffer with no assignment at all", async () => {
    // A DECISION, not an oversight, and it mirrors PL-09's own documented
    // fallback so the two cannot disagree: nobody is locked out mid-onboarding,
    // and the restriction takes effect the moment Equipa assigns a location.
    // The reported defect is closed either way — Carlos WAS assigned (LV only).
    H.assigned = [];
    expect(await bookingLocationScope(ctx())).toBeNull();
  });
});

describe("the predicate has no third answer", () => {
  it("permits on a null scope and refuses on a miss, with nothing in between", () => {
    // An "unknown" branch here is the one shape that would let a location slip
    // through unexamined — section 1.3's pattern on an authorisation path.
    expect(isLocationBookable(null, "anything")).toBe(true);
    expect(isLocationBookable([], "anything")).toBe(false);
    expect(isLocationBookable([LV], LV)).toBe(true);
    expect(isLocationBookable([LV], CB)).toBe(false);
  });
});

// ============================================================================
// THE WRITE PATHS THEMSELVES. The dispatch's requirement, verbatim: "an LV-only
// actor creating at CB is refused by the SERVER (not the form)."
// ============================================================================
// These assert on the SOURCE of actions.ts rather than by invoking the actions,
// and the reason is worth stating rather than hiding: `createAppointment` and
// its siblings pull in the whole scheduling stack — conflict detection, the slot
// lock, audit, reminders, notifications — and a mock deep enough to run them
// would be a second implementation of the module agreeing with itself. That is
// the self-mocking shape LOOP 6's citation audit caught.
//
// WHAT IS ASSERTED IS ORDER AND PRESENCE: every location-carrying write path
// consults the scope, and does so BEFORE it reaches the database. The behaviour
// of the predicate itself is proven above, against the real function.
//
// The e2e and the owner's deployed screen are what prove the whole path end to
// end; this is the guard that reddens the moment a write path is added without
// one, which a screen check cannot do.
describe("every location-carrying write path refuses server-side", () => {
  const source = () => readFileSync(join(__dirname, "actions.ts"), "utf8");

  /** The body of one exported action, to the next top-level export. */
  const bodyOf = (src: string, name: string): string => {
    const start = src.indexOf(`export async function ${name}(`);
    expect(start, `${name} not found in actions.ts`).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const next = rest.indexOf("\nexport ", 1);
    return next === -1 ? rest : rest.slice(0, next);
  };

  it.each([
    "createAppointment",
    "batchScheduleAppointments",
    "rescheduleAppointment",
    // FOUND BY THE ORDERING ASSERTION BELOW, not by reading the file. A clone
    // INHERITS the source appointment's location, so it never names one and did
    // not look like a location-carrying path. It is.
    "cloneAppointment",
  ])(
    "%s checks the booking scope and refuses with location_not_assigned",
    (name) => {
      const body = bodyOf(source(), name);
      expect(body.length, `could not slice ${name}`).toBeGreaterThan(400);
      expect(body, `${name} must consult the booking scope`).toContain("bookingLocationScope");
      expect(body, `${name} must refuse with its own code`).toContain(
        'error: "location_not_assigned"',
      );
    },
  );

  it("checks the scope BEFORE touching the database, on every one of them", () => {
    // ORDER IS THE PROPERTY. A check that ran after `runScoped` would still
    // return the right error while having already opened a transaction and, in
    // the reschedule case, resolved a series. Refusing at the door is the whole
    // point of an authorisation guard.
    // THE PERSISTENCE ENTRY POINT DIFFERS PER PATH, which this assertion learned
    // the hard way: `batchScheduleAppointments` does not call `runScoped` at all,
    // it delegates to `batchSchedule(actor, input)`. Asserting on `runScoped`
    // alone reported "does not reach the database?" for a path that very much
    // does - and slicing to the next export revealed that the `runScoped` I was
    // matching belonged to cloneAppointment, a FOURTH write path that had no
    // guard. The mis-assertion found a real gap.
    //
    // `cloneAppointment` is deliberately absent here: its location is unknown
    // until the source row is read, so its guard is INSIDE the transaction by
    // necessity. It still refuses before the insert.
    const entryPoint: Record<string, string> = {
      createAppointment: "runScoped",
      batchScheduleAppointments: "batchSchedule(",
      rescheduleAppointment: "runScoped",
    };
    for (const [name, entry] of Object.entries(entryPoint)) {
      const body = bodyOf(source(), name);
      const guard = body.indexOf("bookingLocationScope");
      const db = body.indexOf(entry);
      expect(guard, `${name} has no guard`).toBeGreaterThan(-1);
      expect(db, `${name} does not reach persistence via ${entry}?`).toBeGreaterThan(-1);
      expect(guard, `${name} checks the scope AFTER reaching persistence`).toBeLessThan(db);
    }
  });

  it("updateAppointment is exempt, and it is exempt STRUCTURALLY", () => {
    // Not an omission. `UpdateAppointmentPatch` carries serviceId, room, status
    // and notes — there is no locationId, so this path cannot move an
    // appointment between clinics. If a location is ever added to that patch,
    // this assertion is what fails and sends the author to add the guard.
    const types = readFileSync(join(__dirname, "types.ts"), "utf8");
    const patch = types.slice(
      types.indexOf("export type UpdateAppointmentPatch"),
      types.indexOf("export type RescheduleInput"),
    );
    expect(patch.length).toBeGreaterThan(50);
    expect(
      patch,
      "UpdateAppointmentPatch now carries a location - it needs the STAFF-02 guard",
    ).not.toContain("locationId");
  });
});
