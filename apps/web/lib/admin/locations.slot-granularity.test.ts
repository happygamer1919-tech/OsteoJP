import { vi, describe, it, expect, beforeEach } from "vitest";

// PL-25 — the per-location portal booking step (locations.slot_granularity_min,
// 0041) becomes editable from Admin -> Localizações, so making patient booking
// hourly is a click the owner makes, not a hand-written database UPDATE.
//
// What matters here is the WRITE contract, since the value decides what every
// patient can pick: an absent field must leave the column alone, and an
// off-list value must be rejected rather than clamped.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { SLOT_GRANULARITY_CHOICES, updateLocation } from "./locations";
import type { RequestContext } from "@/lib/auth/context";

const mockRunScoped = vi.mocked(runScoped);
const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;

/** Captures the object handed to `.set()` by updateLocation. */
let lastSet: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  lastSet = null;
  const tx = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        lastSet = values;
        return {
          where: () => ({ returning: async () => [{ id: "loc-1" }] }),
        };
      },
    }),
  };
  // Same `as never` shape the sibling locations tests use: the real DbTx type is
  // not worth reconstructing for a stub that only records one .set() call.
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
});

const base = { name: "Linda-a-Velha", address: "", phone: "" };

describe("updateLocation — portal booking step (PL-25)", () => {
  it("offers exactly the two choices: 30 and 60", () => {
    // 15 is deliberately absent: ":15" is what the owner CR removes, so the
    // admin control must not be able to re-create the reported problem.
    expect([...SLOT_GRANULARITY_CHOICES]).toEqual([30, 60]);
  });

  it("writes 60 when the admin picks hourly", async () => {
    await updateLocation(admin, "loc-1", { ...base, slotGranularityMin: "60" });
    expect(lastSet).toMatchObject({ slotGranularityMin: 60 });
  });

  it("writes 30 when the admin picks half-hourly", async () => {
    await updateLocation(admin, "loc-1", { ...base, slotGranularityMin: 30 });
    expect(lastSet).toMatchObject({ slotGranularityMin: 30 });
  });

  // A caller that does not render the control must not silently reset a
  // clinic's booking step back to the default.
  it("leaves the column untouched when the field is absent or empty", async () => {
    await updateLocation(admin, "loc-1", base);
    expect(lastSet).not.toHaveProperty("slotGranularityMin");
    expect(lastSet).toMatchObject({ name: "Linda-a-Velha" });

    await updateLocation(admin, "loc-1", { ...base, slotGranularityMin: "" });
    expect(lastSet).not.toHaveProperty("slotGranularityMin");
  });

  it("rejects an off-list value rather than clamping it", async () => {
    // Clamping a hand-posted 5 to 30 would hide a caller sending nonsense; a
    // silent 5-minute grid would be visible to every patient.
    await expect(
      updateLocation(admin, "loc-1", { ...base, slotGranularityMin: "5" }),
    ).rejects.toThrow();
    await expect(
      updateLocation(admin, "loc-1", { ...base, slotGranularityMin: "45" }),
    ).rejects.toThrow();
    await expect(
      updateLocation(admin, "loc-1", { ...base, slotGranularityMin: "abc" }),
    ).rejects.toThrow();
  });

  it("still refuses a non-admin (capability check is unchanged)", async () => {
    const therapist = { tenantId: "tenant-A", role: "therapist", userId: "t-1" } as RequestContext;
    await expect(
      updateLocation(therapist, "loc-1", { ...base, slotGranularityMin: "60" }),
    ).rejects.toThrow();
  });
});
