/**
 * closed-days.test.ts - Tier C 0114: the Encerramentos library's own rules,
 * with the database faked. The RLS half (role matrix, tenant isolation, no
 * UPDATE, delete after start refused, another tenant's clinic refused) is
 * packages/db/tests/location-closed-days.db.test.ts.
 *
 *   - C2: a therapist is refused before any read (closures:manage);
 *   - the form's rules refuse before any write, by code;
 *   - the table absent: refused as `unavailable`, never written;
 *   - a clinic outside a located receptionist's scope reads as not_found;
 *   - "Todas as clinicas" writes ONE row per clinic the actor manages (C3);
 *   - a save cancels nothing and returns the visits inside it (C5);
 *   - a duplicate is `duplicate`, not a crash;
 *   - a started closure cannot be removed; a future one can, and is audited;
 *   - the audit metadata carries no free text (the label stays out).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn(async () => null) }));
vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@osteojp/db", async (orig) => ({
  ...(await orig<typeof import("@osteojp/db")>()),
  locationClosedDaysSchemaPresent: vi.fn(async () => true),
}));

import type { RequestContext } from "@osteojp/auth";
import { locationClosedDaysSchemaPresent } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { writeAudit } from "./audit";
import { createClosures, deleteClosure } from "./closed-days";

const mockRunScoped = vi.mocked(runScoped);
const mockScope = vi.mocked(viewerLocationScope);
const mockPresent = vi.mocked(locationClosedDaysSchemaPresent);
const mockAudit = vi.mocked(writeAudit);

const reception: RequestContext = { tenantId: "t1", role: "reception", userId: "u-rec" };
const therapist: RequestContext = { tenantId: "t1", role: "therapist", userId: "u-ther" };

const LV = "11111111-1111-4111-8111-111111111111";
const CB = "22222222-2222-4222-8222-222222222222";
const CLOSURE = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-05T12:00:00Z");

/** Each select resolves to the next queued result, in call order. */
let selects: unknown[][] = [];
let inserted: Record<string, unknown>[] = [];
let insertError: unknown = null;
let deleted = 0;
let deleteReturns: unknown[] = [{ id: CLOSURE }];

function fakeTx() {
  const chain = (): Record<string, unknown> => {
    const result = () => Promise.resolve(selects.shift() ?? []);
    const c: Record<string, unknown> = {};
    for (const k of ["from", "where", "innerJoin", "leftJoin"]) c[k] = () => c;
    c.orderBy = () => Object.assign(result(), { limit: result });
    c.limit = result;
    c.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad);
    return c;
  };
  const tx = {
    select: () => chain(),
    insert: () => ({
      values: (rows: Record<string, unknown>[]) => ({
        returning: async () => {
          if (insertError) throw insertError;
          inserted.push(...rows);
          return rows.map((r, i) => ({ id: `new-${i}`, locationId: r.locationId }));
        },
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: async () => {
          deleted++;
          return deleteReturns;
        },
      }),
    }),
    transaction: async (fn: (sp: unknown) => unknown) => fn(tx),
    execute: async () => [],
  };
  return tx;
}

beforeEach(() => {
  selects = [];
  inserted = [];
  insertError = null;
  deleted = 0;
  deleteReturns = [{ id: CLOSURE }];
  mockAudit.mockReset();
  mockScope.mockReset();
  mockScope.mockResolvedValue(null);
  mockPresent.mockReset();
  mockPresent.mockResolvedValue(true);
  mockRunScoped.mockReset();
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(fakeTx() as never)));
});

const input = {
  locationId: LV,
  startsOn: "2026-12-25",
  endsOn: "2026-12-25",
  closedFrom: "",
  closedTo: "",
  kind: "feriado_nacional",
  label: "Natal",
};

describe("createClosures", () => {
  it("C2: a therapist is refused before anything is read", async () => {
    await expect(createClosures(therapist, input, NOW)).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("the form's rules refuse before any write, as `invalid`", async () => {
    await expect(createClosures(reception, { ...input, startsOn: "2026-11-04", endsOn: "2026-11-04" }, NOW)).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(createClosures(reception, { ...input, closedFrom: "13:00" }, NOW)).rejects.toMatchObject({ code: "invalid" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("with the table absent, it is refused as `unavailable` and nothing is written", async () => {
    mockPresent.mockResolvedValue(false);
    await expect(createClosures(reception, input, NOW)).rejects.toMatchObject({ code: "unavailable" });
    expect(inserted).toEqual([]);
  });

  it("a clinic outside a located receptionist's scope reads as not_found, and nothing is written", async () => {
    mockScope.mockResolvedValue([CB]);
    selects = [[{ id: CB, name: "Castelo Branco" }]];
    await expect(createClosures(reception, input, NOW)).rejects.toMatchObject({ code: "not_found" });
    expect(inserted).toEqual([]);
  });

  it("one clinic: one row, the caller as creator, the label trimmed, a whole day as null hours", async () => {
    selects = [[{ id: LV, name: "Linda-a-Velha" }, { id: CB, name: "Castelo Branco" }], []];
    const res = await createClosures(reception, { ...input, label: "  Natal  " }, NOW);
    expect(inserted).toEqual([
      {
        tenantId: "t1",
        locationId: LV,
        startsOn: "2026-12-25",
        endsOn: "2026-12-25",
        closedFrom: null,
        closedTo: null,
        kind: "feriado_nacional",
        label: "Natal",
        createdBy: "u-rec",
      },
    ]);
    expect(res).toEqual({ ids: ["new-0"], affected: [] });
  });

  it("C3: every clinic the actor manages gets its own row", async () => {
    selects = [[{ id: LV, name: "Linda-a-Velha" }, { id: CB, name: "Castelo Branco" }], [], []];
    const res = await createClosures(reception, { ...input, locationId: "all" }, NOW);
    expect(inserted.map((r) => r.locationId)).toEqual([LV, CB]);
    expect(res.ids).toHaveLength(2);
    expect(mockAudit).toHaveBeenCalledTimes(2);
  });

  it("C5: the visits inside the closure are returned, nothing is cancelled", async () => {
    selects = [
      [{ id: LV, name: "Linda-a-Velha" }],
      [
        // Inside the closure.
        { id: "a1", startsAt: new Date("2026-12-25T10:00:00Z"), endsAt: new Date("2026-12-25T11:00:00Z"), patientName: "P", practitionerName: "T" },
        // The query range is whole days; the arithmetic is what decides.
        { id: "a2", startsAt: new Date("2026-12-26T00:00:00Z"), endsAt: new Date("2026-12-26T01:00:00Z"), patientName: "Q", practitionerName: "T" },
      ],
    ];
    const res = await createClosures(reception, input, NOW);
    expect(res.affected.map((v) => v.id)).toEqual(["a1"]);
    expect(res.affected[0]).toMatchObject({ closureId: "new-0", locationName: "Linda-a-Velha" });
    // The audit row carries the count and no free text: the label is not in it.
    const meta = mockAudit.mock.calls[0]![2].metadata!;
    expect(meta).toMatchObject({ locationId: LV, overlappingAppointments: 1, kind: "feriado_nacional" });
    expect(JSON.stringify(meta)).not.toContain("Natal");
  });

  it("a duplicate is `duplicate`, not a crash", async () => {
    selects = [[{ id: LV, name: "Linda-a-Velha" }]];
    insertError = Object.assign(new Error("dup"), { code: "23505" });
    await expect(createClosures(reception, input, NOW)).rejects.toMatchObject({ code: "duplicate" });
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("deleteClosure", () => {
  const row = (startsOn: string, locationId = LV) => ({
    id: CLOSURE,
    locationId,
    startsOn,
    endsOn: startsOn,
    closedFrom: null,
    closedTo: null,
    kind: "outro",
    label: null,
  });

  it("C2: a therapist is refused", async () => {
    await expect(deleteClosure(therapist, CLOSURE, NOW)).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("a closure that has started (first day today or earlier) is refused and not deleted", async () => {
    selects = [[row("2026-11-05")]];
    await expect(deleteClosure(reception, CLOSURE, NOW)).rejects.toMatchObject({ code: "already_started" });
    expect(deleted).toBe(0);
  });

  it("a future closure is deleted and audited", async () => {
    selects = [[row("2026-11-06")]];
    await deleteClosure(reception, CLOSURE, NOW);
    expect(deleted).toBe(1);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![2]).toMatchObject({ action: "location_closed_day.delete", entityId: CLOSURE });
  });

  it("zero rows deleted (the policy's own clock said it started) is `already_started`, not success", async () => {
    selects = [[row("2026-11-06")]];
    deleteReturns = [];
    await expect(deleteClosure(reception, CLOSURE, NOW)).rejects.toMatchObject({ code: "already_started" });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("another clinic's closure, for a located receptionist, reads as not_found", async () => {
    mockScope.mockResolvedValue([CB]);
    selects = [[row("2026-12-01", LV)]];
    await expect(deleteClosure(reception, CLOSURE, NOW)).rejects.toMatchObject({ code: "not_found" });
    expect(deleted).toBe(0);
  });

  it("a malformed id is refused before any read", async () => {
    await expect(deleteClosure(reception, "nope", NOW)).rejects.toMatchObject({ code: "invalid" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
