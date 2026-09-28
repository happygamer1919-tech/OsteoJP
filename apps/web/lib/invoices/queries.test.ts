import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryBuilder } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
// T5b: getMonthlyRevenue resolves the caller's own clinics itself. Stubbed here
// with exactly what the real viewerLocationScope returns for each principal
// (its own suite pins that); revenue.db.test.ts runs the real one.
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { getMonthlyRevenue, listInvoices, MONTHLY_REVENUE_CAPABILITY } from "./queries";
import { can, ROLES, type RequestContext, type Role } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockViewerScope = vi.mocked(viewerLocationScope);

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
    mockViewerScope.mockReset();
    mockViewerScope.mockResolvedValue(null);
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
    // T5b: not even the caller's clinics are looked up.
    expect(mockViewerScope).not.toHaveBeenCalled();
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

/**
 * T5b, REVENUE PER CLINIC: the clinics the sum is held to, per role, read off
 * the statement getMonthlyRevenue actually builds.
 *
 * runScoped is stubbed to run the function's own callback against drizzle's
 * QueryBuilder, which builds the same statement without a database, and to
 * keep what it compiled. So each case below asserts which location ids reach
 * the `appointments.location_id in (...)` condition, and that there is no such
 * condition at all when the figure is the whole tenant. The sets the database
 * then returns are proved in revenue.db.test.ts.
 */
describe("getMonthlyRevenue (T5b): the owner sees all or one clinic, admin and reception only their own", () => {
  const from = new Date("2026-08-31T23:00:00Z");
  const to = new Date("2026-09-30T23:00:00Z");
  const LV = "00000000-0000-0000-0000-0000000000a1";
  const CB = "00000000-0000-0000-0000-0000000000c2";
  const as = (role: Role): RequestContext => ({ tenantId: "t1", role, userId: `u-${role}` });

  type Compiled = { sql: string; params: unknown[] };
  let reads: Compiled[];

  beforeEach(() => {
    reads = [];
    mockRunScoped.mockReset();
    mockRunScoped.mockImplementation((async (_ctx: unknown, cb: (tx: unknown) => { toSQL(): Compiled }) => {
      reads.push(cb(new QueryBuilder()).toSQL());
      return [{ total: 4200 }];
    }) as never);
    mockViewerScope.mockReset();
  });

  /** The ids bound to `"appointments"."location_id" in (...)`, or null when the statement has no such condition. */
  function locationCondition(q: Compiled): string[] | null {
    const m = q.sql.match(/"appointments"\."location_id" in \(([^)]*)\)/);
    if (!m) return null;
    return m[1]!.split(",").map((p) => {
      const n = Number(p.trim().replace(/^\$/, ""));
      return q.params[n - 1] as string;
    });
  }

  function onlyRead(): Compiled {
    expect(reads).toHaveLength(1);
    return reads[0]!;
  }

  it("owner, no choice: every clinic, the statement has NO location condition", async () => {
    mockViewerScope.mockResolvedValue(null);
    await expect(getMonthlyRevenue(as("owner"), from, to)).resolves.toBe(4200);
    const q = onlyRead();
    expect(locationCondition(q)).toBeNull();
    expect(q.params).not.toContain(LV);
    expect(q.params).not.toContain(CB);
    // The invoice's clinic comes through its marcacao, and a LEFT join keeps the
    // invoices that have none in the whole-tenant figure.
    expect(q.sql).toContain('left join "appointments" on "appointments"."id" = "invoices"."appointment_id"');
  });

  it("owner, one clinic chosen: exactly that clinic", async () => {
    mockViewerScope.mockResolvedValue(null);
    await getMonthlyRevenue(as("owner"), from, to, { locationId: CB });
    expect(locationCondition(onlyRead())).toEqual([CB]);
  });

  it("owner, the choice switched: the other clinic, and only it", async () => {
    mockViewerScope.mockResolvedValue(null);
    await getMonthlyRevenue(as("owner"), from, to, { locationId: LV });
    expect(locationCondition(onlyRead())).toEqual([LV]);
  });

  it.each(["admin", "reception"] as const)("%s assigned to one clinic: exactly that clinic", async (role) => {
    mockViewerScope.mockResolvedValue([LV]);
    await getMonthlyRevenue(as(role), from, to);
    expect(mockViewerScope).toHaveBeenCalledWith(as(role));
    expect(locationCondition(onlyRead())).toEqual([LV]);
  });

  it("an admin assigned to two clinics: both", async () => {
    mockViewerScope.mockResolvedValue([LV, CB]);
    await getMonthlyRevenue(as("admin"), from, to);
    expect(locationCondition(onlyRead())).toEqual([LV, CB]);
  });

  it.each(["admin", "reception"] as const)(
    "%s passing another clinic's id is held to their own clinic (the toggle is the owner's)",
    async (role) => {
      mockViewerScope.mockResolvedValue([LV]);
      await getMonthlyRevenue(as(role), from, to, { locationId: CB });
      const q = onlyRead();
      expect(locationCondition(q)).toEqual([LV]);
      expect(q.params).not.toContain(CB);
    },
  );

  it.each(["admin", "reception"] as const)(
    "%s with no assignment: the whole tenant, the PL-09 fallback /invoicing and the appointments RLS share",
    async (role) => {
      mockViewerScope.mockResolvedValue(null);
      await getMonthlyRevenue(as(role), from, to, { locationId: CB });
      const q = onlyRead();
      expect(locationCondition(q)).toBeNull();
      expect(q.params).not.toContain(CB);
    },
  );

  it("keeps the month window and the issued/paid statuses in every shape", async () => {
    mockViewerScope.mockResolvedValue([LV]);
    await getMonthlyRevenue(as("admin"), from, to);
    const q = onlyRead();
    expect(q.params).toEqual(expect.arrayContaining(["issued", "paid", LV]));
    expect(q.sql).toContain('"invoices"."issued_at" is not null');
    expect(q.sql).toContain('"invoices"."issued_at" >= ');
    expect(q.sql).toContain('"invoices"."issued_at" < ');
  });
});
