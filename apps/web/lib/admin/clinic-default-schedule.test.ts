import { getTableName, type Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/viewer-locations", () => ({
  viewerLocationScope: vi.fn(async () => null as string[] | null),
}));

/**
 * HOR-01 - "Usar horario da clinica", who may press it, and when the server
 * refuses it even for them.
 *
 * WHAT IT MUST DO: switch OFF (is_active = false) every active Horarios row of
 * one therapist, delete nothing, and write one audit row; or REFUSE, writing
 * nothing at all (no audit row either), when the clinic default would not
 * really replace those rows.
 *
 * The transaction is table-keyed and records every write, so the assertions
 * can say what was NOT written as well as what was.
 */

type Recorded = { kind: "update" | "delete" | "insert"; table: string; set?: unknown };

const LV = "loc-lv";
const CB = "loc-cb";

let calls: Recorded[];
let tables: Record<string, unknown[]>;

function chain(rows: () => unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["where", "innerJoin", "orderBy", "limit"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows()).then(res, rej);
  return c;
}

function recorderTx() {
  const select = () => ({ from: (table: Table) => chain(() => tables[getTableName(table)] ?? []) });
  return {
    select,
    selectDistinct: select,
    update: (table: Table) => ({
      set: (set: unknown) => {
        calls.push({ kind: "update", table: getTableName(table), set });
        return { where: () => ({ returning: async () => [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }] }) };
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
import { applyClinicDefaultSchedule, listScheduleKinds } from "./clinic-default-schedule";
import { clinicDefaultRefusalMessage } from "./clinic-default-message";
import { isAdminError } from "./errors";

const viewerLocationScope = vi.mocked(viewerLocationScopeImport);

const OWNER = { role: "owner", userId: "owner-1", tenantId: "t" } as never;
const RECEPTION = { role: "reception", userId: "rec-1", tenantId: "t" } as never;
const ADMIN = { role: "admin", userId: "adm-1", tenantId: "t" } as never;
const THERAPIST = { role: "therapist", userId: "t-1", tenantId: "t" } as never;

/** t-1: active, bookable, a member of LV, with rows in force at LV. */
function fixture(
  over: { users?: unknown[]; staff?: unknown[]; rows?: unknown[] } = {},
) {
  tables = {
    users: over.users ?? [{ id: "t-1", isActive: true, isBookable: true, isSharedResource: false }],
    staff_locations: over.staff ?? [{ userId: "t-1", locationId: LV }],
    availability_templates: over.rows ?? [{ userId: "t-1", locationId: LV, name: "Linda-a-Velha" }],
  };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    const r = (await p) as { ok?: boolean; reason?: string };
    return r.ok ? "ok" : `refused:${r.reason}`;
  } catch (e) {
    return isAdminError(e) ? e.code : `threw:${String(e)}`;
  }
}

beforeEach(() => {
  calls = [];
  fixture();
  viewerLocationScope.mockResolvedValue(null);
});

describe("applyClinicDefaultSchedule: what it writes", () => {
  it("switches the therapist's active rows OFF, deletes nothing, and audits once", async () => {
    const res = await applyClinicDefaultSchedule(OWNER, "t-1");
    expect(res).toEqual({ ok: true, deactivated: 3, clinics: [{ locationId: LV, name: "Linda-a-Velha" }] });
    expect(calls.filter((c) => c.kind === "update")).toEqual([
      { kind: "update", table: "availability_templates", set: { isActive: false } },
    ]);
    expect(calls.filter((c) => c.kind === "delete")).toEqual([]);
    const audits = calls.filter((c) => c.kind === "insert");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      table: "audit_log",
      set: {
        action: "availability_template.use_clinic_default",
        entityType: "user",
        entityId: "t-1",
        metadata: { deactivated: 3, clinics: 1 },
      },
    });
  });

  it("refuses an empty target without writing", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(OWNER, ""))).toBe("invalid");
    expect(calls).toEqual([]);
  });
});

describe("applyClinicDefaultSchedule: the server's own refusal (not only the button's)", () => {
  it("nothing in force: a no-op, with NO audit row", async () => {
    fixture({ rows: [] });
    expect(await codeOf(applyClinicDefaultSchedule(OWNER, "t-1"))).toBe("refused:nothing_to_switch");
    expect(calls).toEqual([]);
  });

  it.each([
    ["inactive", { isActive: false, isBookable: true, isSharedResource: false }],
    ["not bookable", { isActive: true, isBookable: false, isSharedResource: false }],
    ["a shared resource", { isActive: true, isBookable: true, isSharedResource: true }],
  ])("refused for a therapist who is %s, writing nothing", async (_why, flags) => {
    fixture({ users: [{ id: "t-1", ...flags }] });
    expect(await codeOf(applyClinicDefaultSchedule(OWNER, "t-1"))).toBe("refused:not_eligible");
    expect(calls).toEqual([]);
  });

  it("refused, naming the clinic, when rows sit where the therapist is not a member", async () => {
    fixture({
      rows: [
        { userId: "t-1", locationId: LV, name: "Linda-a-Velha" },
        { userId: "t-1", locationId: CB, name: "Castelo Branco" },
      ],
    });
    const res = await applyClinicDefaultSchedule(OWNER, "t-1");
    expect(res).toEqual({ ok: false, reason: "not_member", clinics: [{ locationId: CB, name: "Castelo Branco" }] });
    expect(calls).toEqual([]);
    // The sentence reception reads names the clinic.
    expect(clinicDefaultRefusalMessage(res as never)).toContain("Castelo Branco");
  });

  it("the button reads the SAME verdict", async () => {
    fixture({
      rows: [
        { userId: "t-1", locationId: LV, name: "Linda-a-Velha" },
        { userId: "t-1", locationId: CB, name: "Castelo Branco" },
      ],
    });
    const kinds = await listScheduleKinds(OWNER, ["t-1"], "2026-10-30");
    expect(kinds.get("t-1")).toEqual({
      kind: "own",
      switchVerdict: { ok: false, reason: "not_member", clinics: [{ locationId: CB, name: "Castelo Branco" }] },
    });
  });
});

describe("applyClinicDefaultSchedule: the role gate", () => {
  it("the owner may, for anyone", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(OWNER, "t-1"))).toBe("ok");
  });

  it("a therapist may, for THEMSELF", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(THERAPIST, "t-1"))).toBe("ok");
  });

  it("a therapist may NOT, for a colleague, and nothing is written", async () => {
    expect(await codeOf(applyClinicDefaultSchedule(THERAPIST, "t-2"))).toBe("forbidden");
    expect(calls).toEqual([]);
  });

  it("a located receptionist may, for a therapist at her clinic", async () => {
    viewerLocationScope.mockResolvedValue([LV]);
    expect(await codeOf(applyClinicDefaultSchedule(RECEPTION, "t-1"))).toBe("ok");
  });

  it("a located receptionist may NOT, for a therapist at another clinic, and nothing is written", async () => {
    viewerLocationScope.mockResolvedValue([LV]);
    fixture({ staff: [] });
    expect(await codeOf(applyClinicDefaultSchedule(RECEPTION, "t-cb"))).toBe("not_found");
    expect(calls).toEqual([]);
  });

  it("a located admin is held to the same clinic scope", async () => {
    viewerLocationScope.mockResolvedValue([LV]);
    fixture({ staff: [] });
    expect(await codeOf(applyClinicDefaultSchedule(ADMIN, "t-cb"))).toBe("not_found");
    expect(calls).toEqual([]);
  });

  it("a role without schedule:manage is refused before any read", async () => {
    const stranger = { role: "patient", userId: "p", tenantId: "t" } as never;
    expect(await codeOf(applyClinicDefaultSchedule(stranger, "t-1"))).not.toBe("ok");
    expect(calls).toEqual([]);
  });
});
