import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null as string[] | null),
}));

/**
 * HOR-01 - "Usar horario da clinica", and who may press it.
 *
 * WHAT IT MUST DO: switch OFF (is_active = false) every active Horarios row of
 * one therapist, delete nothing, and write one audit row. WHO MAY: exactly the
 * people who may manage that therapist's schedule today (schedule-scope.ts):
 * the owner anyone, a located admin or receptionist only a therapist at one of
 * their clinics, a therapist only themselves.
 *
 * The transaction is a recorder: it keeps every update, delete and insert it is
 * asked for, so the assertions can say what was NOT written as well as what was.
 */

type Recorded = { kind: "update" | "delete" | "insert"; table: string; set?: unknown };

let calls: Recorded[];
let inScope: boolean;
const ACTIVE_ROWS = [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }];

function recorderTx() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (inScope ? [{ userId: "t-1" }] : []) }),
      }),
    }),
    update: (table: Table) => ({
      set: (set: unknown) => {
        calls.push({ kind: "update", table: getTableName(table), set });
        return { where: () => ({ returning: async () => ACTIVE_ROWS }) };
      },
    }),
    delete: (table: Table) => {
      calls.push({ kind: "delete", table: getTableName(table) });
      return { where: () => ({ returning: async () => [] }) };
    },
    insert: (table: Table) => ({
      values: async (v: unknown) => {
        calls.push({ kind: "insert", table: getTableName(table), set: v });
      },
    }),
  } as never;
}

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(recorderTx()),
}));

import { viewerLocationScope as viewerLocationScopeImport } from "@/lib/auth/viewer-locations";
import { applyClinicDefaultSchedule } from "./clinic-default-schedule";
import { isAdminError } from "./errors";

const viewerLocationScope = vi.mocked(viewerLocationScopeImport);

const OWNER = { role: "owner", userId: "owner-1", tenantId: "t" } as never;
const RECEPTION = { role: "reception", userId: "rec-1", tenantId: "t" } as never;
const ADMIN = { role: "admin", userId: "adm-1", tenantId: "t" } as never;
const THERAPIST = { role: "therapist", userId: "t-1", tenantId: "t" } as never;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return isAdminError(e) ? e.code : `threw:${String(e)}`;
  }
}

beforeEach(() => {
  calls = [];
  inScope = true;
  viewerLocationScope.mockResolvedValue(null);
});

describe("applyClinicDefaultSchedule: what it writes", () => {
  it("switches the therapist's active rows OFF, deletes nothing, and audits once", async () => {
    const res = await applyClinicDefaultSchedule(OWNER, "t-1");
    expect(res).toEqual({ deactivated: 3 });
    const updates = calls.filter((c) => c.kind === "update");
    expect(updates).toEqual([{ kind: "update", table: "availability_templates", set: { isActive: false } }]);
    expect(calls.filter((c) => c.kind === "delete")).toEqual([]);
    const audits = calls.filter((c) => c.kind === "insert");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      table: "audit_log",
      set: {
        action: "availability_template.use_clinic_default",
        entityType: "user",
        entityId: "t-1",
        metadata: { deactivated: 3 },
      },
    });
  });

  it("refuses an empty target without writing", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(OWNER, ""))).toBe("invalid");
    expect(calls).toEqual([]);
  });
});

describe("applyClinicDefaultSchedule: the role gate", () => {
  it("the owner may, for anyone", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(OWNER, "t-9"))).toBe("ok");
  });

  it("a therapist may, for THEMSELF", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(THERAPIST, "t-1"))).toBe("ok");
  });

  it("a therapist may NOT, for a colleague, and nothing is written", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(THERAPIST, "t-2"))).toBe("forbidden");
    expect(calls).toEqual([]);
  });

  it("a located receptionist may, for a therapist at her clinic", async () => {
    viewerLocationScope.mockResolvedValue(["loc-lv"]);
    expect(await codeOf(applyClinicDefaultSchedule(RECEPTION, "t-1"))).toBe("ok");
  });

  it("a located receptionist may NOT, for a therapist at another clinic, and nothing is written", async () => {
    viewerLocationScope.mockResolvedValue(["loc-lv"]);
    inScope = false;
    expect(await codeOf(applyClinicDefaultSchedule(RECEPTION, "t-cb"))).toBe("not_found");
    expect(calls).toEqual([]);
  });

  it("a located admin is held to the same clinic scope", async () => {
    viewerLocationScope.mockResolvedValue(["loc-lv"]);
    inScope = false;
    expect(await codeOf(applyClinicDefaultSchedule(ADMIN, "t-cb"))).toBe("not_found");
    expect(calls).toEqual([]);
  });

  it("a role without schedule:manage is refused before any read", async () => {
    const stranger = { role: "patient", userId: "p", tenantId: "t" } as never;
    expect(await codeOf(applyClinicDefaultSchedule(stranger, "t-1"))).not.toBe("ok");
    expect(calls).toEqual([]);
  });
});
