import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { getMonthlyRevenue, listInvoices, MONTHLY_REVENUE_CAPABILITY } from "./queries";
import { can, ROLES, type RequestContext, type Role } from "@osteojp/auth";

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

/**
 * DASH-THERAPIST-REVENUE. A therapist's Inicio showed the whole clinic's
 * monthly revenue: the invoices RLS is tenant-wide and getMonthlyRevenue asked
 * nothing. It now asserts MONTHLY_REVENUE_CAPABILITY before its one read.
 *
 * The roles are pinned by name, not derived from the matrix, because the
 * acceptance is about people: owner, admin and reception keep the figure they
 * see today, and the therapist loses it. A matrix edit that moved either side
 * must fail here and be ruled on.
 */
describe("getMonthlyRevenue: only the roles that work Faturacao read the clinic's revenue", () => {
  const from = new Date("2026-09-01T00:00:00Z");
  const to = new Date("2026-10-01T00:00:00Z");
  const as = (role: Role): RequestContext => ({ tenantId: "t1", role, userId: `u-${role}` });

  beforeEach(() => {
    mockRunScoped.mockReset();
    mockRunScoped.mockResolvedValue([{ total: 124500 }]);
  });

  it("refuses the therapist before any read, though the therapist holds invoices:read", async () => {
    // The trap this card fell into: every role holds invoices:read, so a gate
    // on it passes the therapist. The refusal must come from the capability
    // the therapist does NOT hold.
    expect(can("therapist", "invoices:read")).toBe(true);
    expect(can("therapist", MONTHLY_REVENUE_CAPABILITY)).toBe(false);

    await expect(getMonthlyRevenue(as("therapist"), from, to)).rejects.toMatchObject({
      name: "ForbiddenError",
      role: "therapist",
      capability: MONTHLY_REVENUE_CAPABILITY,
    });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin", "reception"] as const)("returns the month's total for %s", async (role) => {
    await expect(getMonthlyRevenue(as(role), from, to)).resolves.toBe(124500);
    expect(mockRunScoped).toHaveBeenCalledOnce();
    expect(mockRunScoped).toHaveBeenCalledWith(as(role), expect.any(Function));
  });

  it("returns 0, not a refusal, for a permitted role with no invoices in the month", async () => {
    mockRunScoped.mockResolvedValue([]);
    await expect(getMonthlyRevenue(as("admin"), from, to)).resolves.toBe(0);
  });

  it("the roles that read it are exactly owner, admin and reception", () => {
    expect(ROLES.filter((r) => can(r, MONTHLY_REVENUE_CAPABILITY))).toEqual(["owner", "admin", "reception"]);
  });
});
