import { describe, expect, it } from "vitest";

import { bookingStaffOptions } from "./booking-staff-options";
import {
  offersTherapistChange,
  therapistChangeInput,
  therapistChangeOptions,
  type TherapistChangeStaff,
} from "./therapist-change";

/**
 * MARC-THERAPIST-01 - what the ficha's Terapeuta field offers and what it sends.
 * Ids and names are invented.
 */

const LV = "loc-lv";
const CB = "loc-cb";
const ana = { id: "t-ana", label: "Ana Terapeuta" };
const bruno = { id: "t-bruno", label: "Bruno Terapeuta" };
const carla = { id: "t-carla", label: "Carla Terapeuta" }; // Castelo Branco only
const dora = { id: "t-dora", label: "Dora Terapeuta" }; // no clinic at all

const staff: TherapistChangeStaff = {
  therapists: [ana, bruno, carla, dora],
  allTherapists: [ana, bruno, carla, dora],
  therapistLocationIds: { [ana.id]: [LV], [bruno.id]: [LV, CB], [carla.id]: [CB] },
};

const row = {
  practitionerId: ana.id,
  practitionerName: ana.label,
  practitionerTwoId: null as string | null,
  locationId: LV,
  startsAt: "2031-05-14T14:00:00.000Z",
  endsAt: "2031-05-14T14:45:00.000Z",
};

describe("who is offered the field", () => {
  it.each(["owner", "admin", "reception"] as const)("%s is, when they may edit the patient's appointments", (role) => {
    expect(offersTherapistChange(role, true)).toBe(true);
  });

  it("a therapist is not, although they may edit appointments", () => {
    expect(offersTherapistChange("therapist", true)).toBe(false);
  });

  it.each(["owner", "admin", "reception", "therapist"] as const)(
    "%s is not when they may not edit this patient's appointments",
    (role) => {
      expect(offersTherapistChange(role, false)).toBe(false);
    },
  );
});

describe("the options", () => {
  it("are the row's clinic's team plus the colleagues with no clinic, the current Terapeuta among them", () => {
    expect(therapistChangeOptions(row, staff).map((o) => o.id)).toEqual([ana.id, bruno.id, dora.id]);
  });

  // Not a proof that the two screens stay in step: this feeds the builder the
  // arguments the field itself passes, so it pins only that the field adds
  // nothing to the builder's list when there is no Terapeuta 2. The proof is in
  // app/agenda/appointment-drawer.test.tsx, which renders the agenda's edit
  // panel and compares the options it paints with this function's.
  it("add nothing to the shared builder's list when the row has no Terapeuta 2", () => {
    const built = bookingStaffOptions({
      isTherapist: false,
      selfLocked: false,
      selfUserId: "",
      pool: staff.allTherapists!,
      assignments: new Map(Object.entries(staff.therapistLocationIds!)),
      resources: [],
      locationId: row.locationId,
      practitionerId: row.practitionerId,
      practitionerTwoId: null,
      locationTouched: false,
      editing: { practitionerId: row.practitionerId, practitionerName: row.practitionerName },
      labels: null,
    }).therapistOptions;
    expect(therapistChangeOptions(row, staff)).toEqual(built);
  });

  it("leave out the row's Terapeuta 2, and nobody else", () => {
    const withTwo = { ...row, practitionerTwoId: bruno.id };
    expect(therapistChangeOptions(withTwo, staff).map((o) => o.id)).toEqual([ana.id, dora.id]);
  });

  it("keep a current Terapeuta this viewer's lists do not carry, named from the row (STAFF-01)", () => {
    const gone = { ...row, practitionerId: "t-gone", practitionerName: "Terapeuta Antigo" };
    const options = therapistChangeOptions(gone, staff);
    expect(options).toContainEqual({ id: "t-gone", label: "Terapeuta Antigo" });
    expect(options.map((o) => o.id)).toEqual([ana.id, bruno.id, dora.id, "t-gone"]);
  });

  it("offer a machine only where it is installed", () => {
    const nesa = { id: "m-nesa", label: "NESA", locationIds: [CB] };
    const withMachine = { ...staff, sharedResources: [nesa] };
    expect(therapistChangeOptions(row, withMachine).map((o) => o.id)).not.toContain(nesa.id);
    expect(therapistChangeOptions({ ...row, locationId: CB, practitionerId: carla.id, practitionerName: carla.label }, withMachine).map((o) => o.id)).toContain(nesa.id);
  });

  it("fall back to the filter's list when the page gives no full roster", () => {
    const filterOnly: TherapistChangeStaff = {
      therapists: staff.therapists,
      therapistLocationIds: staff.therapistLocationIds,
    };
    expect(therapistChangeOptions(row, filterOnly).map((o) => o.id)).toEqual([ana.id, bruno.id, dora.id]);
  });
});

describe("what is sent", () => {
  it("is the row's own start, end and clinic, the new Terapeuta, this occurrence only, and no override", () => {
    expect(therapistChangeInput(row, bruno.id)).toEqual({
      startsAt: "2031-05-14T14:00:00.000Z",
      endsAt: "2031-05-14T14:45:00.000Z",
      practitionerId: bruno.id,
      locationId: LV,
      scope: "one",
      allowConflict: false,
    });
  });

  it("normalises a start the database wrote with an offset to the same instant in UTC", () => {
    const sent = therapistChangeInput({ ...row, startsAt: "2031-05-14T15:00:00+01:00", endsAt: "2031-05-14T15:45:00+01:00" }, bruno.id);
    expect(sent.startsAt).toBe("2031-05-14T14:00:00.000Z");
    expect(sent.endsAt).toBe("2031-05-14T14:45:00.000Z");
  });
});
