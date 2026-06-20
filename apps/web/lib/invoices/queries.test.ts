import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { listInvoices } from "./queries";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);

const ctx: RequestContext = { tenantId: "t1", role: "admin", userId: "u1" };

const sampleRow = {
  id: "inv-1",
  externalId: "FR 2026/0001",
  patientId: "p1",
  patientName: "Maria Santos",
  amountCents: 6000,
  currency: "EUR",
  status: "paid" as const,
  issuedAt: new Date("2026-06-01T10:00:00Z"),
  locationId: "loc-1",
};

describe("listInvoices — local ledger display query", () => {
  beforeEach(() => {
    mockRunScoped.mockReset();
  });

  it("passes ctx to runScoped and returns rows unchanged", async () => {
    mockRunScoped.mockResolvedValue([sampleRow]);

    const result = await listInvoices(ctx);

    expect(mockRunScoped).toHaveBeenCalledOnce();
    expect(mockRunScoped).toHaveBeenCalledWith(ctx, expect.any(Function));
    expect(result).toEqual([sampleRow]);
  });

  it("returns empty array when no invoices exist", async () => {
    mockRunScoped.mockResolvedValue([]);

    const result = await listInvoices(ctx, {});

    expect(result).toEqual([]);
  });

  it("accepts all filter params without throwing", async () => {
    mockRunScoped.mockResolvedValue([]);

    await listInvoices(ctx, {
      patientId: "p2",
      status: "paid",
      from: new Date("2026-06-01"),
      to: new Date("2026-07-01"),
      locationId: "loc-1",
    });

    expect(mockRunScoped).toHaveBeenCalledOnce();
  });

  it("returns multiple rows in order", async () => {
    const rows = [
      { ...sampleRow, id: "inv-1" },
      { ...sampleRow, id: "inv-2", status: "issued" as const },
    ];
    mockRunScoped.mockResolvedValue(rows);

    const result = await listInvoices(ctx);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("inv-1");
    expect(result[1]!.id).toBe("inv-2");
  });

  it("handles null patientName and locationId (no linked patient or appointment)", async () => {
    const orphan = {
      ...sampleRow,
      patientId: null,
      patientName: null,
      locationId: null,
      externalId: null,
    };
    mockRunScoped.mockResolvedValue([orphan]);

    const result = await listInvoices(ctx);

    expect(result[0]!.patientName).toBeNull();
    expect(result[0]!.locationId).toBeNull();
  });
});
