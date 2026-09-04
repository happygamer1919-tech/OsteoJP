import { describe, expect, it } from "vitest";

import {
  linkablePacks,
  packLinkRefusal,
  packServiceChangeRefusal,
  type LinkableAppointment,
  type LinkablePackInstance,
  type PackedAppointment,
} from "./link-core";

/**
 * PACK-01 — the guards on retroactive pacote assignment.
 *
 * Every one of the four guards the card names is here with BOTH arms: the case
 * it refuses and the neighbouring case it must still allow. A guard tested only
 * on the refusing side passes when it refuses everything.
 */

const SVC = "svc-massagem";
const OTHER_SVC = "svc-osteo";
const PATIENT = "pat-1";

const appt = (over: Partial<LinkableAppointment> = {}): LinkableAppointment => ({
  id: "appt-1",
  patientId: PATIENT,
  serviceId: SVC,
  status: "completed",
  packInstanceId: null,
  ...over,
});

const inst = (over: Partial<LinkablePackInstance> = {}): LinkablePackInstance => ({
  id: "inst-1",
  patientId: PATIENT,
  packName: "Pacote 10 sessões",
  baseServiceId: SVC,
  baseServiceName: "Massagem",
  sessionsTotal: 10,
  legacyConsumed: 0,
  linkedAppointments: 3,
  ...over,
});

describe("PACK-01 — cannot link twice", () => {
  it("refuses an appointment that already draws from an instance", () => {
    expect(packLinkRefusal(appt({ packInstanceId: "inst-9" }), inst())).toBe("already_linked");
  });
  it("refuses it even when the instance offered is the SAME one", () => {
    // Re-linking to the same instance would look harmless and would still be a
    // second session spent, because the count is of ROWS.
    expect(packLinkRefusal(appt({ packInstanceId: "inst-1" }), inst())).toBe("already_linked");
  });
  it("allows an unlinked appointment", () => {
    expect(packLinkRefusal(appt(), inst())).toBeNull();
  });
});

describe("PACK-01 — cannot exceed the session count", () => {
  it("refuses when the derived balance is spent", () => {
    expect(packLinkRefusal(appt(), inst({ linkedAppointments: 10 }))).toBe("no_sessions_left");
  });
  it("refuses when legacy consumption alone has spent it", () => {
    // The pre-0067 half of the formula still counts.
    expect(packLinkRefusal(appt(), inst({ legacyConsumed: 10, linkedAppointments: 0 })))
      .toBe("no_sessions_left");
  });
  it("refuses an OVERDRAWN instance, which the display clamp hides", () => {
    expect(packLinkRefusal(appt(), inst({ linkedAppointments: 12 }))).toBe("no_sessions_left");
  });
  it("allows the LAST session, which is the boundary that matters", () => {
    expect(packLinkRefusal(appt(), inst({ linkedAppointments: 9 }))).toBeNull();
  });
});

describe("PACK-01 — same service only", () => {
  it("refuses a pacote whose base service is a different one", () => {
    expect(packLinkRefusal(appt(), inst({ baseServiceId: OTHER_SVC }))).toBe("service_mismatch");
  });
  it("refuses an appointment saved with no service at all", () => {
    // It cannot be matched, and guessing the pacote's service would be
    // assigning a service to a visit nobody recorded one for.
    expect(packLinkRefusal(appt({ serviceId: null }), inst())).toBe("no_service");
  });
  it("allows the matching service", () => {
    expect(packLinkRefusal(appt(), inst())).toBeNull();
  });
});

describe("PACK-01 — the appointment must actually consume a session", () => {
  it("refuses a cancelled appointment, because the balance formula excludes it", () => {
    // Linking it would be a real link with zero effect on the count. Refusing
    // says so rather than leaving reception to notice the number did not move.
    expect(packLinkRefusal(appt({ status: "cancelled" }), inst()))
      .toBe("cancelled_consumes_nothing");
  });
  it("allows every status that DOES consume, no_show included", () => {
    for (const status of ["scheduled", "confirmed", "completed", "no_show"]) {
      expect(packLinkRefusal(appt({ status }), inst())).toBeNull();
    }
  });
  it("no_show is allowed on purpose - it is the under-24h rule, now derived", () => {
    expect(packLinkRefusal(appt({ status: "no_show" }), inst())).toBeNull();
  });
});

describe("PACK-01 — same patient", () => {
  it("refuses another patient's instance", () => {
    expect(packLinkRefusal(appt(), inst({ patientId: "pat-2" }))).toBe("different_patient");
  });
  it("refuses an appointment with no patient", () => {
    expect(packLinkRefusal(appt({ patientId: null }), inst())).toBe("different_patient");
  });
});

describe("PACK-01 — the refusals are ordered so the message blames the right thing", () => {
  it("a cancelled appointment says CANCELLED, not whatever is wrong with the pacote", () => {
    const bad = inst({ baseServiceId: OTHER_SVC, linkedAppointments: 10 });
    expect(packLinkRefusal(appt({ status: "cancelled" }), bad)).toBe("cancelled_consumes_nothing");
  });
  it("an already-linked appointment says so before anything else", () => {
    const bad = inst({ baseServiceId: OTHER_SVC, linkedAppointments: 10 });
    expect(packLinkRefusal(appt({ packInstanceId: "x", status: "cancelled" }), bad))
      .toBe("already_linked");
  });
});

describe("PACK-01 — linkablePacks offers exactly the instances that pass", () => {
  it("keeps only the eligible ones and drops each for its own reason", () => {
    const ok = inst({ id: "ok" });
    const spent = inst({ id: "spent", linkedAppointments: 10 });
    const wrongService = inst({ id: "wrong", baseServiceId: OTHER_SVC });
    const alsoOk = inst({ id: "ok2", linkedAppointments: 1 });
    expect(linkablePacks(appt(), [ok, spent, wrongService, alsoOk]).map((i) => i.id))
      .toEqual(["ok", "ok2"]);
  });

  it("offers NOTHING for an appointment that is already linked, whatever is available", () => {
    expect(linkablePacks(appt({ packInstanceId: "inst-9" }), [inst(), inst({ id: "b" })]))
      .toEqual([]);
  });

  it("preserves the order it was given, so the caller decides which is first", () => {
    const a = inst({ id: "a" });
    const b = inst({ id: "b" });
    expect(linkablePacks(appt(), [b, a]).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

/**
 * PACK-03 — THE SAME RULE, ASKED OF THE VALUE BEING WRITTEN.
 *
 * `packLinkRefusal` above stops a pacote being attached to an appointment of
 * the wrong service. This stops the reverse, which was unguarded: an
 * appointment ALREADY drawing a NESA session, edited to Fisioterapia and saved,
 * kept its `pack_instance_id` — so the derived balance went on counting it and
 * ten NESA sessions became spendable on anything, one edit at a time.
 *
 * BOTH ARMS ON EVERY CASE, as above. A guard tested only where it fires is a
 * guard that has never been shown to let anything through.
 */
const linkedRow = (over: Partial<PackedAppointment> = {}): PackedAppointment => ({
  id: "appt-1",
  packInstanceId: "inst-1",
  packBaseServiceId: SVC,
  ...over,
});

describe("PACK-03 — a pacote session keeps its service", () => {
  it("REFUSES a change to another service, and names the row and what it must be", () => {
    expect(packServiceChangeRefusal(OTHER_SVC, [linkedRow()])).toEqual({
      appointmentId: "appt-1",
      requiredServiceId: SVC,
    });
  });

  it("ALLOWS setting it back to the pacote's own service - the repair, not a loophole", () => {
    expect(packServiceChangeRefusal(SVC, [linkedRow()])).toBeNull();
  });

  it("REFUSES clearing the service, because null is not the base service", () => {
    expect(packServiceChangeRefusal(null, [linkedRow()])).not.toBeNull();
  });

  it("ALLOWS anything on a row with no pacote - the guard must let ordinary work through", () => {
    const free = linkedRow({ packInstanceId: null, packBaseServiceId: null });
    expect(packServiceChangeRefusal(OTHER_SVC, [free])).toBeNull();
    expect(packServiceChangeRefusal(null, [free])).toBeNull();
  });

  it("ALLOWS an empty set - a series that resolved to nothing refuses nothing", () => {
    expect(packServiceChangeRefusal(OTHER_SVC, [])).toBeNull();
  });

  /**
   * A SERIES EDIT WRITES EVERY MEMBER, so one linked member is enough to refuse
   * the whole write. Checking only the row that was clicked would let the rest
   * through, which is the shape of defect this whole card is about.
   */
  it("REFUSES when ANY member of the set is linked, wherever it sits", () => {
    const free = linkedRow({ id: "appt-0", packInstanceId: null, packBaseServiceId: null });
    expect(packServiceChangeRefusal(OTHER_SVC, [free, linkedRow({ id: "appt-2" })]))
      .toMatchObject({ appointmentId: "appt-2" });
    expect(packServiceChangeRefusal(OTHER_SVC, [linkedRow({ id: "appt-2" }), free]))
      .toMatchObject({ appointmentId: "appt-2" });
  });

  /**
   * A HALF-RESOLVED ROW IS NOT A LINKED ROW. `packBaseServiceId` comes from a
   * LEFT JOIN through service_packs; if that ever returns null while
   * packInstanceId is set, there is no service to require and inventing one
   * would refuse an edit on a rule nobody can state. It is skipped, and the
   * skip is asserted rather than implied.
   */
  it("skips a row whose pack did not resolve to a base service", () => {
    expect(packServiceChangeRefusal(OTHER_SVC, [linkedRow({ packBaseServiceId: null })])).toBeNull();
  });
});
