/**
 * "Packs em uso", the read's gate. Unit level: who may call it, and that it
 * reads under the viewer's own session. What each role SEES is the database's
 * business and is measured in `in-use-read.db.test.ts`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const refused = new Set<string>();
const assertCanSpy = vi.fn((role: string, capability: string) => {
  if (refused.has(capability)) throw new Error(`forbidden ${role} ${capability}`);
});
vi.mock("@osteojp/auth", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, assertCan: (role: string, c: string) => assertCanSpy(role, c) };
});

const runScoped = vi.fn(async () => ({ totalInUse: 0, rows: [] }));
vi.mock("@/lib/auth/context", () => ({
  runScoped: (...a: unknown[]) => (runScoped as (...x: unknown[]) => unknown)(...a),
}));

const { listPacksInUse, listPatientPacks } = await import("./in-use-read");
const { PgDialect } = await import("drizzle-orm/pg-core");

const actor = { tenantId: "t-1", role: "therapist" as const, userId: "u-1" };

beforeEach(() => {
  refused.clear();
  assertCanSpy.mockClear();
  runScoped.mockClear();
});

describe("listPacksInUse: the gate", () => {
  it("asks for patients:read AND appointments:read before any read", async () => {
    await listPacksInUse(actor, "");
    expect(assertCanSpy.mock.calls.map((c) => c[1]).sort()).toEqual([
      "appointments:read",
      "patients:read",
    ]);
    expect(runScoped).toHaveBeenCalledTimes(1);
  });

  it("refused patients:read: nothing is read", async () => {
    refused.add("patients:read");
    await expect(listPacksInUse(actor, "")).rejects.toThrow(/patients:read/);
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("refused appointments:read: nothing is read", async () => {
    refused.add("appointments:read");
    await expect(listPacksInUse(actor, "")).rejects.toThrow(/appointments:read/);
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("refuses a cap that would read nothing (0, negative, fractional) before any read", async () => {
    for (const cap of [0, -1, 1.5]) {
      await expect(listPacksInUse(actor, "", { cap })).rejects.toThrow(/cap/);
    }
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("reads under the VIEWER's session: runScoped with the viewer's own context", async () => {
    await listPacksInUse(actor, "");
    expect((runScoped.mock.calls[0] as unknown[])[0]).toBe(actor);
  });
});

describe("listPacksInUse: never the service role", () => {
  const src = readFileSync(fileURLToPath(new URL("./in-use-read.ts", import.meta.url)), "utf8");

  it("names no admin or service-role database handle", () => {
    expect(src).not.toMatch(/getDbAdmin|serviceRole|service_role|withAdmin/);
  });

  it("takes the sessions from 0108's viewer-scoped function", () => {
    expect(src).toContain("public.pack_instance_consuming_sessions(i.id)");
  });
});

describe("listPacksInUse: no age limit (Q15, 2026-11-04)", () => {
  const src = readFileSync(fileURLToPath(new URL("./in-use-read.ts", import.meta.url)), "utf8");

  // A pacote with sessions left stays "a decorrer" however old it is. The
  // read's only filters are the soft-delete and the candidate rule; an age cut
  // would need a date comparison helper or an interval, and it names neither.
  it("imports no drizzle comparison helper a date cut-off would use", () => {
    expect(src).toContain('import { and, desc, eq, isNull, sql } from "drizzle-orm";');
  });

  it("names no SQL interval or age()", () => {
    expect(src).not.toMatch(/\binterval\b|\bage\s*\(/i);
  });

  it("the where clause is the soft-delete and the candidate rule, nothing else", () => {
    expect(src).toContain(".where(and(isNull(patients.deletedAt), isCandidateSql))");
  });
});

/**
 * PACK-FICHA-01: the ficha's read. Same gate, same session, narrowed to one
 * patient. The rows below come from a recorder standing in for the viewer's
 * transaction, so what is pinned is the read's own wiring: the WHERE it
 * builds, and that a row of another patient never leaves it.
 */
describe("listPatientPacks: the gate and the patient filter", () => {
  const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
  const OTHER = "5555aaaa-5555-4555-8555-55555555bbbb";

  type Captured = { where: unknown; limit: number | null; executes: number };

  /** A stand-in for the viewer's transaction, returning `rows` to the select. */
  function fakeTx(rows: unknown[], captured: Captured) {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: (w: unknown) => {
        captured.where = w;
        return chain;
      },
      orderBy: () => chain,
      limit: async (n: number) => {
        captured.limit = n;
        return rows;
      },
    };
    return {
      select: () => chain,
      execute: async () => {
        captured.executes += 1;
        return [];
      },
    };
  }

  function runWith(rows: unknown[]): Captured {
    const captured: Captured = { where: null, limit: null, executes: 0 };
    runScoped.mockImplementationOnce((async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(fakeTx(rows, captured))) as never);
    return captured;
  }

  const packRow = (patientId: string, instanceId: string) => ({
    instanceId,
    patientId,
    patientName: "Zzz Paciente Teste",
    packName: "Zzz Pack Teste",
    packPriceCents: 10000,
    sessionsTotal: 5,
    legacyConsumed: 0,
    purchasedAt: new Date("2026-10-01T10:00:00Z"),
  });

  it("asks for patients:read AND appointments:read before any read", async () => {
    runWith([]);
    await listPatientPacks(actor, PATIENT);
    expect(assertCanSpy.mock.calls.map((c) => c[1]).sort()).toEqual([
      "appointments:read",
      "patients:read",
    ]);
  });

  it("refused either capability: nothing is read", async () => {
    for (const cap of ["patients:read", "appointments:read"]) {
      refused.clear();
      refused.add(cap);
      await expect(listPatientPacks(actor, PATIENT)).rejects.toThrow(new RegExp(cap));
    }
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("refuses an empty patient id and a cap that would read nothing, before any read", async () => {
    await expect(listPatientPacks(actor, "")).rejects.toThrow(/patientId/);
    for (const cap of [0, -1, 1.5]) {
      await expect(listPatientPacks(actor, PATIENT, { cap })).rejects.toThrow(/cap/);
    }
    expect(runScoped).not.toHaveBeenCalled();
  });

  it("reads under the VIEWER's session: runScoped with the viewer's own context", async () => {
    runWith([]);
    await listPatientPacks(actor, PATIENT);
    expect((runScoped.mock.calls[0] as unknown[])[0]).toBe(actor);
  });

  it("the WHERE is the patient's id and nothing else; the read is bounded at cap + 1", async () => {
    const captured = runWith([]);
    await listPatientPacks(actor, PATIENT, { cap: 7 });
    const q = new PgDialect().sqlToQuery(captured.where as never);
    expect(q.sql).toBe('"patient_pack_instances"."patient_id" = $1');
    expect(q.params).toEqual([PATIENT]);
    expect(captured.limit).toBe(8);
  });

  it("A ROW OF ANOTHER PATIENT NEVER LEAVES THE READ, even if the database returned one", async () => {
    runWith([packRow(OTHER, "i-other"), packRow(PATIENT, "i-mine")]);
    const page = await listPatientPacks(actor, PATIENT);
    const all = [...page.running, ...page.finished];
    expect(all.map((v) => v.instanceId)).toEqual(["i-mine"]);
    expect(all.every((v) => v.patientId === PATIENT)).toBe(true);
  });

  it("cap + 1 rows back: the extra row is dropped and truncated is true", async () => {
    const captured = runWith([packRow(PATIENT, "i-1"), packRow(PATIENT, "i-2"), packRow(PATIENT, "i-3")]);
    const page = await listPatientPacks(actor, PATIENT, { cap: 2 });
    expect(page.truncated).toBe(true);
    expect([...page.running, ...page.finished]).toHaveLength(2);
    expect(captured.executes).toBe(1);
  });

  it("no pacotes: 0108's function is not called at all", async () => {
    const captured = runWith([]);
    const page = await listPatientPacks(actor, PATIENT);
    expect(page).toEqual({ running: [], finished: [], truncated: false });
    expect(captured.executes).toBe(0);
  });
});

describe("listPatientPacks: the source keeps the boundary", () => {
  const src = readFileSync(fileURLToPath(new URL("./in-use-read.ts", import.meta.url)), "utf8");
  const body = src.slice(src.indexOf("export async function listPatientPacks"));

  it("still joins patients, so patients_select (RLS) decides whose pacotes come back", () => {
    expect(body).toContain(".innerJoin(\n          patients,");
  });

  it("filters on the patient id", () => {
    expect(body).toContain(".where(eq(patientPackInstances.patientId, patientId))");
  });

  it("runs inside runScoped", () => {
    expect(body).toContain("return runScoped(");
  });
});
