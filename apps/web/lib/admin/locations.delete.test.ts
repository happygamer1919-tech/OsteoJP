import { vi, describe, it, expect, beforeEach } from "vitest";

// W3-07 — deleteLocation: hard delete only when NO appointment references it.
// Nullable meaningful FKs (services / analytics_events) are preserved by nulling;
// purely location-scoped config is deleted child-first with RETURNING; then the
// location. Admin-only (real assertCan).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import {
  analyticsEvents,
  availabilityTemplates,
  locations,
  patientLocations,
  serviceLocationPrices,
  services,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { deleteLocation } from "./locations";
import type { RequestContext } from "@/lib/auth/context";

const mockRunScoped = vi.mocked(runScoped);
const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;
const therapist = { tenantId: "tenant-A", role: "therapist", userId: "ther-1" } as RequestContext;

function tag(table: unknown): string {
  if (table === services) return "services";
  if (table === analyticsEvents) return "analytics";
  if (table === serviceLocationPrices) return "service_location_prices";
  if (table === availabilityTemplates) return "availability_templates";
  if (table === patientLocations) return "patient_locations";
  if (table === locations) return "locations";
  return "other";
}

function q(rows: unknown[]) {
  return {
    limit: async () => rows,
    then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows).then(res, rej),
  };
}

function makeTx(opts: { exists?: boolean; apptCount?: number }) {
  const { exists = true, apptCount = 0 } = opts;
  const selectQueue: unknown[][] = [
    exists ? [{ id: "loc-1" }] : [], // existence
    [{ n: apptCount }], // appointment count
  ];
  let si = 0;
  const updates: string[] = [];
  const deletes: string[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => q(selectQueue[si++] ?? []) }) }),
    update: (t: unknown) => {
      updates.push(tag(t));
      return { set: () => ({ where: async () => {} }) };
    },
    delete: (t: unknown) => {
      deletes.push(tag(t));
      const rows = tag(t) === "locations" ? [{ id: "loc-1" }] : [];
      return { where: () => ({ returning: async () => rows }) };
    },
  };
  return { tx, updates, deletes };
}

beforeEach(() => {
  mockRunScoped.mockReset();
  vi.mocked(writeAudit).mockReset();
});

describe("deleteLocation (W3-07)", () => {
  it("refuses when appointments reference the location", async () => {
    const { tx, deletes } = makeTx({ apptCount: 3 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(deleteLocation(admin, "loc-1")).rejects.toMatchObject({ code: "has_appointments" });
    expect(deletes).toEqual([]); // nothing deleted
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("not_found for a missing / cross-tenant location", async () => {
    const { tx } = makeTx({ exists: false });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
    await expect(deleteLocation(admin, "ghost")).rejects.toMatchObject({ code: "not_found" });
  });

  it("nulls services/analytics, deletes config child-first, then the location", async () => {
    const { tx, updates, deletes } = makeTx({ apptCount: 0 });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await deleteLocation(admin, "loc-1");

    // Meaningful nullable refs preserved (nulled, not deleted).
    expect(updates).toEqual(["services", "analytics"]);
    expect(deletes).not.toContain("services");
    // Location-scoped config deleted BEFORE the parent location.
    expect(deletes).toEqual([
      "service_location_prices",
      "availability_templates",
      "patient_locations",
      "locations",
    ]);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAudit).mock.calls[0][2].action).toBe("location.delete");
  });

  it("refuses a non-admin (locations:write gate)", async () => {
    await expect(deleteLocation(therapist, "loc-1")).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
