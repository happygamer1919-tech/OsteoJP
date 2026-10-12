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
  tenants,
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
  if (table === tenants) return "tenants";
  return "other";
}

function q(rows: unknown[]) {
  return {
    limit: async () => rows,
    for: async () => rows,
    then: (res: (v: unknown[]) => void, rej: (e: unknown) => void) =>
      Promise.resolve(rows).then(res, rej),
  };
}

function makeTx(opts: { exists?: boolean; apptCount?: number; settings?: unknown; tenantWritable?: boolean }) {
  const { exists = true, apptCount = 0, settings = {}, tenantWritable = true } = opts;
  const selectQueue: unknown[][] = [
    exists ? [{ id: "loc-1" }] : [], // existence
    [{ n: apptCount }], // appointment count
    [{ settings }], // the tenant row, for the Declaração's physical-stamp mark
  ];
  let si = 0;
  const updates: string[] = [];
  const deletes: string[] = [];
  const tenantWrites: unknown[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => q(selectQueue[si++] ?? []) }) }),
    update: (t: unknown) => {
      updates.push(tag(t));
      return {
        set: (values: unknown) => ({
          where: () => ({
            // Awaited as it is (services, analytics) or with RETURNING (tenants).
            returning: async () => {
              if (!tenantWritable) return [];
              tenantWrites.push(values);
              return [{ id: "tenant-A" }];
            },
            then: (res: (v: void) => void, rej: (e: unknown) => void) => Promise.resolve().then(res, rej),
          }),
        }),
      };
    },
    delete: (t: unknown) => {
      deletes.push(tag(t));
      const rows = tag(t) === "locations" ? [{ id: "loc-1" }] : [];
      return { where: () => ({ returning: async () => rows }) };
    },
  };
  return { tx, updates, deletes, tenantWrites };
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

  // S-1012-A1 ruling 4: the "physical stamp" mark is keyed by the location's id
  // in tenants.settings, so it goes with the location.
  it("a MARKED location: its mark is removed with it, every other setting and mark stays", async () => {
    const settings = {
      contacts: { phone: "210 000 000" },
      declaracao: { responsavel: "Dra. Teste", physicalStamp: { "loc-1": { place: "Montemor-o-Novo" }, "loc-2": { place: "Outro" } } },
    };
    const { tx, updates, tenantWrites } = makeTx({ settings });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await deleteLocation(admin, "loc-1");

    expect(updates).toEqual(["services", "analytics", "tenants"]);
    expect(tenantWrites).toEqual([
      {
        settings: {
          contacts: { phone: "210 000 000" },
          declaracao: { responsavel: "Dra. Teste", physicalStamp: { "loc-2": { place: "Outro" } } },
        },
      },
    ]);
    expect(vi.mocked(writeAudit).mock.calls.map((c) => c[2])).toEqual([
      {
        action: "tenant.update",
        entityType: "tenant",
        entityId: "tenant-A",
        metadata: { fields: ["declaracao.physicalStamp"], locationId: "loc-1" },
      },
      { action: "location.delete", entityType: "location", entityId: "loc-1" },
    ]);
  });

  it("a MALFORMED entry under its id is removed too", async () => {
    const { tx, tenantWrites } = makeTx({ settings: { declaracao: { physicalStamp: { "loc-1": "x" } } } });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await deleteLocation(admin, "loc-1");

    expect(tenantWrites).toEqual([{ settings: { declaracao: { physicalStamp: {} } } }]);
  });

  it("an UNMARKED location: the tenant row is not written (another location's mark is not its)", async () => {
    const { tx, updates, tenantWrites } = makeTx({
      settings: { declaracao: { physicalStamp: { "loc-2": { place: "Outro" } } } },
    });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await deleteLocation(admin, "loc-1");

    expect(tenantWrites).toEqual([]);
    expect(updates).toEqual(["services", "analytics"]);
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("a mark that cannot be removed fails the delete: no location.delete audit row", async () => {
    const { tx } = makeTx({
      settings: { declaracao: { physicalStamp: { "loc-1": { place: "Montemor-o-Novo" } } } },
      tenantWritable: false,
    });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(deleteLocation(admin, "loc-1")).rejects.toMatchObject({ code: "forbidden" });
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a non-admin (locations:write gate)", async () => {
    await expect(deleteLocation(therapist, "loc-1")).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
