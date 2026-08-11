import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getBookableCatalog, type AppointmentsStore, type BookableCatalog } from "./booking";

/**
 * DECISION C — preselection, NEVER restriction.
 *
 * "The patient's history preselects; it never removes an option they are
 * entitled to book." (WAVE-13.md:230-232). The loop restates it as a
 * prohibition: "Do not turn preselection into restriction, in the UI or in the
 * query." (WAVE-13.md:809).
 *
 * The loop's own Definition of Done names the test that has to exist: "a
 * patient whose history preselects service X can still select every other
 * patient_bookable service" (WAVE-13.md:784-785). That is the second describe
 * block, and it asserts on the SET, so it fails on any narrowing rather than on
 * one anticipated way of narrowing.
 */

const principal = {
  tenantId: "tenant-A",
  patientId: "patient-1",
} as unknown as Parameters<typeof getBookableCatalog>[0];

const svc = (id: string, locationIds: string[] = []) => ({
  id,
  name: `Serviço ${id}`,
  durationMin: 60,
  priceCents: 5000,
  currency: "EUR",
  locationIds,
});

const CATALOG: Omit<BookableCatalog, "preselectedServiceId" | "preselectedLocationId"> = {
  locations: [{ id: "loc-1", name: "Linda-a-Velha" }],
  services: [svc("s-osteo"), svc("s-fisio"), svc("s-rpg"), svc("s-massagem")],
};

/** A store that answers only what getBookableCatalog asks of it. */
function storeWith(priorServiceId: string | null): AppointmentsStore {
  return {
    async getCatalog() {
      // The catalog the store returns has no preselection of its own: the
      // decision is made by getBookableCatalog, which is the only place that can
      // check membership against the list it is about to return.
      return { ...CATALOG, preselectedServiceId: null, preselectedLocationId: null };
    },
    async priorCompletedServiceId() {
      return priorServiceId;
    },
    // A1: getBookableCatalog now asks for the home clinic too. Null here keeps
    // these cases about the SERVICE preselection, which is what they test.
    async primaryLocationId() {
      return null;
    },
  } as unknown as AppointmentsStore;
}

describe("the usual service is preselected from completed history", () => {
  it("preselects the service of the most recent completed appointment", async () => {
    const catalog = await getBookableCatalog(principal, storeWith("s-fisio"));
    expect(catalog.preselectedServiceId).toBe("s-fisio");
  });

  it("preselects nothing for a patient with no completed history", async () => {
    const catalog = await getBookableCatalog(principal, storeWith(null));
    expect(catalog.preselectedServiceId).toBeNull();
  });

  it("the preselected id is ALWAYS a member of the returned list", async () => {
    const catalog = await getBookableCatalog(principal, storeWith("s-rpg"));
    expect(catalog.services.map((s) => s.id)).toContain(catalog.preselectedServiceId);
  });
});

describe("preselection NEVER removes an option (Decision C, the DoD line)", () => {
  it("a patient whose history preselects X can still select every other service", async () => {
    const catalog = await getBookableCatalog(principal, storeWith("s-fisio"));

    // Asserted on the SET, not on a count and not on one absent id: any
    // narrowing at all fails this, including one nobody anticipated.
    expect(catalog.services.map((s) => s.id).sort()).toEqual(
      CATALOG.services.map((s) => s.id).sort(),
    );
    expect(catalog.services).toHaveLength(CATALOG.services.length);
  });

  it("the list is byte-identical whether or not there is a preselection", async () => {
    const withHistory = await getBookableCatalog(principal, storeWith("s-fisio"));
    const withNone = await getBookableCatalog(principal, storeWith(null));

    // The strongest form of "never restricts": history changes ONE scalar and
    // nothing else. If a future change ever filtered on the preselection, these
    // two would diverge.
    expect(JSON.stringify(withHistory.services)).toEqual(JSON.stringify(withNone.services));
    expect(JSON.stringify(withHistory.locations)).toEqual(JSON.stringify(withNone.locations));
  });

  it("a service that is no longer offered drops the PRESELECTION, not a row", async () => {
    // The patient's last visit was a service since turned off for patients. The
    // catalog is unchanged; only the marking disappears.
    const catalog = await getBookableCatalog(principal, storeWith("s-retired"));

    expect(catalog.preselectedServiceId).toBeNull();
    expect(catalog.services.map((s) => s.id).sort()).toEqual(
      CATALOG.services.map((s) => s.id).sort(),
    );
  });
});

describe("the history query asks for a COMPLETED visit, not any appointment", () => {
  const source = readFileSync(join(__dirname, "store.ts"), "utf-8");
  const start = source.indexOf("async priorCompletedServiceId");
  const body = source.slice(start, source.indexOf("async priorTherapistId", start));

  it("the method exists and is not a stub", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("appointments");
  });

  it("filters on status = completed", () => {
    // A cancelled booking or a no_show is not what the patient usually comes
    // for, and a future `scheduled` one has not happened yet.
    expect(body).toContain('eq(appointments.status, "completed")');
  });

  it("scopes to the verified principal, explicitly, on both dimensions", () => {
    // service_role path: the tenant and patient predicates are the boundary, and
    // they come from the principal rather than from any request payload.
    expect(body).toContain("eq(appointments.tenantId, principal.tenantId)");
    expect(body).toContain("eq(appointments.patientId, principal.patientId)");
  });

  it("orders by the appointment START, so a late back-office entry cannot win", () => {
    expect(body).toContain("desc(appointments.startsAt)");
    expect(body).not.toContain("desc(appointments.createdAt)");
  });

  it("ignores appointments with no service rather than returning null for them", () => {
    expect(body).toContain("isNotNull(appointments.serviceId)");
  });
});

describe("the portal marks and lifts the usual service; it never hides another", () => {
  const flow = readFileSync(
    join(__dirname, "..", "..", "..", "..", "apps/portal/app/portal/booking/BookingFlow.tsx"),
    "utf-8",
  );

  it("renders from an ordered list, not a filtered one", () => {
    // The rendered array must be the reorder, and the reorder must be built
    // with splice + spread (a permutation) rather than with .filter.
    expect(flow).toContain("orderedServices.map");
    expect(flow).toContain("const orderedServices");
    const start = flow.indexOf("const orderedServices");
    const body = flow.slice(start, flow.indexOf("}, [services, locationId, preselectedServiceId])", start));
    expect(body).not.toMatch(/\.filter\(/);
  });

  it("does not auto-advance past the service step", () => {
    // Skipping the step would remove the choice rather than preselect within
    // it. selectService is only ever reachable from an onClick.
    expect(flow).not.toMatch(/useEffect\([^)]*selectService/);
    expect(flow).toContain("onClick={() => selectService(svc.id)}");
  });

  it("labels the preselected row in pt-PT", () => {
    expect(flow).toContain("s.booking.usual_service");
    const strings = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "..", "packages/i18n/src/portal/strings.pt.json"),
        "utf-8",
      ),
    ) as { booking: Record<string, string> };
    expect(strings.booking.usual_service).toBe("O seu serviço habitual");
  });
});
