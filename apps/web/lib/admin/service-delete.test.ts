import { describe, it, expect } from "vitest";

import {
  isServiceDeletable,
  serviceDeleteBlockers,
  SERVICE_DELETE_BLOCKERS,
} from "./service-delete";

// W12-03: the reference-guarded delete decision. `service_location_prices` (a
// service's own per-location price overrides) is CONFIG, cascaded in the delete
// tx, so it is NOT a blocker here; appointments / therapist_services / analytics /
// pack are real history/relationships that keep a service archive-only.
describe("serviceDeleteBlockers (W12-03 reference-guard decision)", () => {
  it("a service blocked ONLY by its own price overrides is deletable (no hard blocker)", () => {
    // service_location_prices is not part of the guard set, so a service with
    // only price overrides presents an empty blocker map -> deletable.
    expect(serviceDeleteBlockers({})).toEqual([]);
    expect(isServiceDeletable({})).toBe(true);
  });

  it("a service with appointments / analytics / therapist_services / pack stays guarded", () => {
    expect(isServiceDeletable({ appointments: true })).toBe(false);
    expect(isServiceDeletable({ analytics: true })).toBe(false);
    expect(isServiceDeletable({ therapist_services: true })).toBe(false);
    expect(isServiceDeletable({ pack: true })).toBe(false);
  });

  it("names every blocking class, in canonical order (so the tooltip can list them)", () => {
    // Input order does not matter; output follows SERVICE_DELETE_BLOCKERS order.
    expect(serviceDeleteBlockers({ pack: true, appointments: true })).toEqual([
      "appointments",
      "pack",
    ]);
    expect(
      serviceDeleteBlockers({
        analytics: true,
        appointments: true,
        therapist_services: true,
        pack: true,
      }),
    ).toEqual([...SERVICE_DELETE_BLOCKERS]);
  });

  it("a false/absent flag never blocks (only a true presence does)", () => {
    expect(serviceDeleteBlockers({ appointments: false, pack: undefined })).toEqual([]);
    expect(isServiceDeletable({ appointments: false })).toBe(true);
  });
});
