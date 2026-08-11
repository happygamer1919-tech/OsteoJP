import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getBookableCatalog, type AppointmentsStore, type BookableCatalog } from "./booking";

/**
 * A1 — the HOME CLINIC is PRESELECTED, NEVER A RESTRICTION.
 *
 * Decision C, the same rule the service preselection lives under
 * (WAVE-13.md:230-232, :809): "the patient's history preselects; it never
 * removes an option they are entitled to book."
 *
 * WHAT THIS FILE PINS, and the second one is the load-bearing half:
 *   1. a home clinic on the patient record is preselected, and a stale one
 *      (deactivated since their last visit) drops the PRESELECTION rather than
 *      the row;
 *   2. THE LOCATION LIST IS NEVER NARROWED. Asserted on the SET, so it fails on
 *      ANY narrowing rather than on one anticipated way of narrowing - the same
 *      shape preselection.test.ts uses for services, and for the same reason.
 *
 * THE NULL CASE IS NOT AN EDGE CASE HERE. `patients.primary_location_id` is
 * unpopulated for every patient until LAUNCH-03 brings the real book across
 * (LE-primary-location-backfill), so "no home clinic, show the choice" is the
 * ONLY path that runs in production today and it gets its own assertions.
 */

const principal = {
  tenantId: "tenant-A",
  patientId: "patient-1",
} as unknown as Parameters<typeof getBookableCatalog>[0];

const LOCATIONS = [
  { id: "loc-lv", name: "Linda-a-Velha" },
  { id: "loc-cb", name: "Castelo Branco" },
];

const CATALOG: Omit<BookableCatalog, "preselectedServiceId" | "preselectedLocationId"> = {
  locations: LOCATIONS,
  services: [
    {
      id: "s-osteo",
      name: "Osteopatia",
      durationMin: 60,
      priceCents: 5000,
      currency: "EUR",
      locationIds: [],
    },
  ],
};

function storeWith(homeLocationId: string | null): AppointmentsStore {
  return {
    async getCatalog() {
      return { ...CATALOG, preselectedServiceId: null, preselectedLocationId: null };
    },
    async priorCompletedServiceId() {
      return null;
    },
    async primaryLocationId() {
      return homeLocationId;
    },
  } as unknown as AppointmentsStore;
}

describe("the home clinic is preselected from the patient record", () => {
  it("preselects the patient's home clinic", async () => {
    const catalog = await getBookableCatalog(principal, storeWith("loc-cb"));
    expect(catalog.preselectedLocationId).toBe("loc-cb");
  });

  it("preselects nothing when the patient has NO home clinic - the path that runs today", async () => {
    const catalog = await getBookableCatalog(principal, storeWith(null));
    expect(catalog.preselectedLocationId).toBeNull();
  });

  it("drops a home clinic that is no longer an active bookable location", async () => {
    // The membership check. A clinic closed since the patient's last visit must
    // not advance them past a step onto somewhere they cannot book.
    const catalog = await getBookableCatalog(principal, storeWith("loc-closed"));
    expect(catalog.preselectedLocationId).toBeNull();
  });

  it("the preselection is ALWAYS a member of the returned locations", async () => {
    for (const home of ["loc-lv", "loc-cb", "loc-closed", null]) {
      const catalog = await getBookableCatalog(principal, storeWith(home));
      if (catalog.preselectedLocationId !== null) {
        expect(catalog.locations.map((l) => l.id)).toContain(catalog.preselectedLocationId);
      }
    }
  });
});

describe("preselection NEVER narrows the clinic list (Decision C)", () => {
  // Asserted on the SET. A filter of any kind fails this, not just the one
  // filter someone might think to write.
  const ALL = LOCATIONS.map((l) => l.id).sort();

  it("a patient WITH a home clinic still sees every location", async () => {
    const catalog = await getBookableCatalog(principal, storeWith("loc-cb"));
    expect(catalog.locations.map((l) => l.id).sort()).toEqual(ALL);
  });

  it("a patient with NO home clinic still sees every location", async () => {
    const catalog = await getBookableCatalog(principal, storeWith(null));
    expect(catalog.locations.map((l) => l.id).sort()).toEqual(ALL);
  });

  it("a patient with a STALE home clinic still sees every location", async () => {
    const catalog = await getBookableCatalog(principal, storeWith("loc-closed"));
    expect(catalog.locations.map((l) => l.id).sort()).toEqual(ALL);
  });
});

describe("source-level: the UI cannot turn the preselection into a restriction", () => {
  // Comments stripped, so prose about Decision C cannot satisfy any assertion.
  const FLOW = readFileSync(
    join(__dirname, "../../../portal/app/portal/booking/BookingFlow.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("step 1 maps over the FULL locations array, never a filtered copy", () => {
    // The render must iterate `locations`, not something derived from it.
    expect(FLOW).toMatch(/locations\.map\(/);
  });

  it("does not filter the locations array anywhere", () => {
    expect(FLOW).not.toMatch(/locations\s*\.filter\(/);
  });

  it("renders a switch-clinic control, which is what makes skipping step 1 legal", () => {
    expect(FLOW).toMatch(/switchClinic/);
    expect(FLOW).toMatch(/clinic_switch/);
  });

  it("the switch control is NOT confined to a single step", () => {
    // It is gated on `step > 1`, so it is present on 2, 3 and 4. A gate written
    // as an equality would confine it to one screen and strand a patient who
    // realises at the confirm screen that they picked the wrong city.
    expect(FLOW).toMatch(/step\s*>\s*1\s*&&/);
    expect(FLOW).not.toMatch(/step\s*===\s*2\s*&&\s*location\s*&&/);
  });
});
