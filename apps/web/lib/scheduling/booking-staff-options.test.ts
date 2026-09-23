import { describe, expect, it } from "vitest";
import {
  bookingStaffOptions,
  practitionerAfterLocationChange,
  type BookingStaffInput,
} from "./booking-staff-options";
import type { SharedResource } from "./shared-resource-guard";

/**
 * NESA-SCOPE - the booking drawer's staff lists, per mode. The role x surface
 * matrix across every screen is lib/scheduling/nesa-scope-matrix.test.ts; this
 * file pins the builder's own rules one at a time.
 */
const LV = "loc-lv";
const CB = "loc-cb";

const NESA_CB: SharedResource = { id: "nesa-cb", label: "NESA", locationIds: [CB] };
const NESA_LV: SharedResource = { id: "nesa-lv", label: "NESA", locationIds: [LV] };
const ANA = { id: "ana", label: "Ana Lisboa" }; // LV
const BRUNO = { id: "bruno", label: "Bruno Castelo" }; // CB
const CARLA = { id: "carla", label: "Carla Sem Clinica" }; // no clinic

const assignments = new Map<string, string[]>([
  [ANA.id, [LV]],
  [BRUNO.id, [CB]],
  [NESA_CB.id, [CB]],
  [NESA_LV.id, [LV]],
]);

const base = (over: Partial<BookingStaffInput>): BookingStaffInput => ({
  isTherapist: false,
  selfLocked: false,
  selfUserId: "viewer",
  pool: [ANA, BRUNO, CARLA],
  assignments,
  resources: [],
  locationId: CB,
  practitionerId: null,
  practitionerTwoId: null,
  locationTouched: false,
  editing: null,
  labels: {
    viewerClinicIds: [LV, CB],
    assignments,
    clinicCodeById: new Map([
      [LV, "LV"],
      [CB, "CB"],
    ]),
  },
  ...over,
});

const ids = (list: readonly { id: string }[]) => list.map((o) => o.id);

describe("self-locked therapist (create): machines only where they are installed", () => {
  const therapist = (locationId: string) =>
    bookingStaffOptions(
      base({
        isTherapist: true,
        selfLocked: true,
        selfUserId: ANA.id,
        locationId,
        practitionerId: ANA.id,
        resources: [NESA_CB, NESA_LV],
      }),
    );

  it("at CB, the CB machine and not the LV one", () => {
    expect(ids(therapist(CB).selfResources)).toEqual([NESA_CB.id]);
  });

  it("at LV, the LV machine and not the CB one", () => {
    expect(ids(therapist(LV).selfResources)).toEqual([NESA_LV.id]);
  });

  it("no Localizacao, no machine", () => {
    expect(therapist("").selfResources).toEqual([]);
  });

  it("still names the therapist themselves from the pool", () => {
    expect(therapist(LV).selfName).toBe(ANA.label);
  });

  it("Terapeuta 2 is the machine at the chosen clinic, unchanged (SCHED-29)", () => {
    expect(ids(therapist(LV).practitionerTwoOptions)).toEqual([NESA_LV.id]);
  });
});

describe("front desk CREATE: W12-23 kept, machines scoped to the form's clinic", () => {
  it("on open, every person (W4-12 therapist-first stays possible)", () => {
    const out = bookingStaffOptions(base({ locationId: CB }));
    expect(ids(out.therapistOptions)).toEqual([ANA.id, BRUNO.id, CARLA.id]);
  });

  it("on open, a BOOKABLE machine at another clinic is not offered, though it is in the pool", () => {
    const pool = [ANA, BRUNO, { id: NESA_CB.id, label: "NESA (CB)" }, { id: NESA_LV.id, label: "NESA (LV)" }];
    const out = bookingStaffOptions(base({ pool, resources: [NESA_CB, NESA_LV], locationId: CB }));
    expect(ids(out.therapistOptions)).toEqual([ANA.id, BRUNO.id, NESA_CB.id]);
    // The suffix stays: it depends on the viewer, not on this location's list.
    expect(out.therapistOptions.find((o) => o.id === NESA_CB.id)?.label).toBe("NESA (CB)");
  });

  it("a NON-bookable machine is added at its own clinic only (SCHED-29.4)", () => {
    const out = bookingStaffOptions(base({ resources: [NESA_CB, NESA_LV], locationId: LV }));
    expect(ids(out.therapistOptions)).toEqual([ANA.id, BRUNO.id, CARLA.id, NESA_LV.id]);
  });

  it("after the user picks a clinic, the people are that clinic's team (W12-23)", () => {
    const out = bookingStaffOptions(base({ locationId: LV, locationTouched: true }));
    expect(ids(out.therapistOptions)).toEqual([ANA.id]);
  });

  it("the current value survives a clinic change", () => {
    const out = bookingStaffOptions(base({ locationId: LV, locationTouched: true, practitionerId: BRUNO.id }));
    expect(ids(out.therapistOptions)).toEqual([ANA.id, BRUNO.id]);
  });

  it("Terapeuta 2 takes people from the FORM's clinic plus the machine installed there", () => {
    const out = bookingStaffOptions(base({ resources: [NESA_CB, NESA_LV], locationId: CB }));
    expect(ids(out.practitionerTwoOptions)).toEqual([BRUNO.id, NESA_CB.id]);
  });

  it("Terapeuta 2 keeps its current value when the clinic changes under it", () => {
    const out = bookingStaffOptions(
      base({ resources: [NESA_CB, NESA_LV], locationId: LV, practitionerTwoId: NESA_CB.id }),
    );
    expect(ids(out.practitionerTwoOptions)).toEqual([ANA.id, NESA_LV.id, NESA_CB.id]);
  });
});

describe("EDIT: people scoped to the booking's clinic from open, the current value always kept", () => {
  const editing = (practitionerId: string, practitionerName: string) => ({ practitionerId, practitionerName });

  it("scopes to the booking's clinic on open, without a Localizacao touch", () => {
    const out = bookingStaffOptions(
      base({ locationId: LV, practitionerId: ANA.id, editing: editing(ANA.id, ANA.label) }),
    );
    expect(ids(out.therapistOptions)).toEqual([ANA.id]);
  });

  it("keeps a practitioner from another clinic that the pool still carries", () => {
    const out = bookingStaffOptions(
      base({ locationId: LV, practitionerId: BRUNO.id, editing: editing(BRUNO.id, BRUNO.label) }),
    );
    expect(ids(out.therapistOptions)).toEqual([ANA.id, BRUNO.id]);
  });

  it("SYNTHESISES a practitioner no list carries, from the appointment row, and labels it against its twin", () => {
    // An LV-only viewer editing an LV booking that names the CB machine row.
    const out = bookingStaffOptions(
      base({
        pool: [ANA],
        resources: [NESA_LV],
        locationId: LV,
        practitionerId: NESA_CB.id,
        editing: editing(NESA_CB.id, "NESA"),
        labels: {
          viewerClinicIds: [LV],
          assignments,
          clinicCodeById: new Map([
            [LV, "LV"],
            [CB, "CB"],
          ]),
        },
      }),
    );
    expect(out.therapistOptions.map((o) => `${o.id}=${o.label}`)).toEqual([
      "ana=Ana Lisboa",
      "nesa-lv=NESA (LV)",
      "nesa-cb=NESA (CB)",
    ]);
  });

  it("a synthesised option with no twin on screen keeps the plain name", () => {
    const out = bookingStaffOptions(
      base({
        pool: [ANA],
        locationId: LV,
        practitionerId: NESA_CB.id,
        editing: editing(NESA_CB.id, "NESA"),
      }),
    );
    expect(out.therapistOptions.map((o) => `${o.id}=${o.label}`)).toEqual(["ana=Ana Lisboa", "nesa-cb=NESA"]);
  });

  it("without the NESA-SCOPE fields (an old mock) the kept option is appended unlabelled", () => {
    const out = bookingStaffOptions(
      base({ pool: [ANA], locationId: LV, practitionerId: "gone", editing: editing("gone", "Antigo"), labels: null }),
    );
    expect(out.therapistOptions.map((o) => o.label)).toEqual(["Ana Lisboa", "Antigo"]);
  });

  it("a therapist's edit adds no machine of its own (SCHED-17's offer is create-only)", () => {
    const out = bookingStaffOptions(
      base({
        isTherapist: true,
        pool: [ANA],
        resources: [NESA_LV],
        locationId: LV,
        practitionerId: ANA.id,
        editing: editing(ANA.id, ANA.label),
      }),
    );
    expect(ids(out.therapistOptions)).toEqual([ANA.id]);
  });
});

describe("practitionerAfterLocationChange - the self-locked select has no placeholder", () => {
  const args = (practitionerId: string, locationId: string, selfLocked = true) => ({
    selfLocked,
    selfUserId: ANA.id,
    practitionerId,
    resources: [NESA_CB, NESA_LV],
    locationId,
  });

  it("a machine not installed at the new clinic goes back to the therapist", () => {
    expect(practitionerAfterLocationChange(args(NESA_CB.id, LV))).toBe(ANA.id);
  });

  it("a machine installed at the new clinic stays", () => {
    expect(practitionerAfterLocationChange(args(NESA_LV.id, LV))).toBe(NESA_LV.id);
  });

  it("the therapist themselves stays", () => {
    expect(practitionerAfterLocationChange(args(ANA.id, CB))).toBe(ANA.id);
  });

  it("front desk is never reset: its select has a placeholder and keeps the value (keepCurrent)", () => {
    expect(practitionerAfterLocationChange(args(NESA_CB.id, LV, false))).toBe(NESA_CB.id);
  });
});
