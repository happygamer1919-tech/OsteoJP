import { beforeEach, describe, expect, it, vi } from "vitest";

// S-1012-A1 ruling 4 (2026-10-12): Administração > Locais marks a location as
// one that stamps the Declaração by hand. The mark lives in
// tenants.settings.declaracao.physicalStamp, keyed by the location's id, and is
// written by updateLocation in the location's own transaction.
//
// What matters here is the WRITE contract, because the mark decides whether a
// declaration is issued at all and what place it prints: an absent control
// leaves the mark alone, a mark with no place is refused, the rest of the
// settings blob survives, and a tenant row that would not update fails the save.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({ writeAudit: vi.fn() }));

import { locations, tenants } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import type { RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { isAdminError } from "./errors";
import { listPhysicalStampPlaces, updateLocation } from "./locations";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeAudit);

const admin = { tenantId: "tenant-A", role: "admin", userId: "admin-1" } as RequestContext;
const MN = "00000000-0000-4000-8000-0000000000a3";
const OTHER = "00000000-0000-4000-8000-0000000000a5";

const state = {
  /** The tenant's settings blob, as the row holds it. Null: the row is not visible. */
  settings: {} as unknown,
  tenantVisible: true,
  /** False: the tenants UPDATE policy lets no row through for this role. */
  tenantWritable: true,
  tenantWrites: [] as Record<string, unknown>[],
  locationWrites: [] as Record<string, unknown>[],
  locationFound: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.settings = {
    contacts: { phone: "210 000 000" },
    declaracao: { responsavel: "Dra. Teste", physicalStamp: { [OTHER]: { place: "Outro" } } },
  };
  state.tenantVisible = true;
  state.tenantWritable = true;
  state.tenantWrites = [];
  state.locationWrites = [];
  state.locationFound = true;

  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table !== tenants) throw new Error("this fake only reads tenants");
          return state.tenantVisible ? [{ settings: state.settings }] : [];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table === locations) {
              state.locationWrites.push(values);
              return state.locationFound ? [{ id: MN }] : [];
            }
            if (table === tenants) {
              if (!state.tenantWritable) return [];
              state.tenantWrites.push(values);
              state.settings = values.settings;
              return [{ id: admin.tenantId }];
            }
            throw new Error("this fake only updates locations and tenants");
          },
        }),
      }),
    }),
  };
  mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));
});

const base = { name: "OsteoJP (Montemor-o-Novo)", address: "Rua X 4, 7050-356 Montemor-o-Novo", phone: "926 714 926" };

async function code(run: Promise<unknown>): Promise<string> {
  try {
    await run;
    return "saved";
  } catch (e) {
    return isAdminError(e) ? e.code : `unexpected: ${String(e)}`;
  }
}

describe("updateLocation - the Declaração's physical-stamp mark", () => {
  it("ticked with a place: the mark is stored under the location's id, trimmed", async () => {
    await updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place: " Montemor-o-Novo " } });

    expect(state.tenantWrites).toHaveLength(1);
    expect(state.tenantWrites[0]).toEqual({
      settings: {
        contacts: { phone: "210 000 000" },
        declaracao: {
          responsavel: "Dra. Teste",
          physicalStamp: { [OTHER]: { place: "Outro" }, [MN]: { place: "Montemor-o-Novo" } },
        },
      },
    });
    // The settings write touches the settings column and nothing else.
    expect(Object.keys(state.tenantWrites[0]!)).toEqual(["settings"]);
  });

  it("unticked: the location's mark is cleared and the other location's stays", async () => {
    state.settings = { declaracao: { physicalStamp: { [MN]: { place: "Montemor-o-Novo" }, [OTHER]: { place: "Outro" } } } };

    await updateLocation(admin, MN, { ...base, physicalStamp: { enabled: false, place: "Montemor-o-Novo" } });

    expect(state.tenantWrites).toEqual([
      { settings: { declaracao: { physicalStamp: { [OTHER]: { place: "Outro" } } } } },
    ]);
  });

  it("the control ABSENT from the form: the tenant row is neither read for it nor written", async () => {
    state.settings = { declaracao: { physicalStamp: { [MN]: { place: "Montemor-o-Novo" } } } };

    await updateLocation(admin, MN, base);
    await updateLocation(admin, MN, { ...base, slotGranularityMin: "60" });

    expect(state.tenantWrites).toEqual([]);
    expect(state.locationWrites).toHaveLength(2);
  });

  it("nothing changed: no settings write, and no settings audit row", async () => {
    state.settings = { declaracao: { physicalStamp: { [MN]: { place: "Montemor-o-Novo" } } } };

    await updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place: "Montemor-o-Novo" } });
    await updateLocation(admin, OTHER, { ...base, physicalStamp: { enabled: false, place: "" } });

    expect(state.tenantWrites).toEqual([]);
    expect(mockAudit.mock.calls.map((c) => c[2].action)).toEqual(["location.update", "location.update"]);
  });

  it.each([
    ["no place", ""],
    ["a place of spaces", "   "],
    ["a place longer than the setting stores", "x".repeat(61)],
  ])("ticked with %s: refused as invalid BEFORE anything is written", async (_label, place) => {
    expect(await code(updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place } }))).toBe(
      "invalid",
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(state.locationWrites).toEqual([]);
    expect(state.tenantWrites).toEqual([]);
  });

  it("a tenant row that updates NO row fails the save: never 'saved' for a mark not stored", async () => {
    state.tenantWritable = false;

    expect(
      await code(updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place: "Montemor-o-Novo" } })),
    ).toBe("forbidden");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a tenant row not in view fails the save", async () => {
    state.tenantVisible = false;

    expect(
      await code(updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place: "Montemor-o-Novo" } })),
    ).toBe("not_found");
    expect(state.tenantWrites).toEqual([]);
  });

  it("an unknown location: not_found, and the settings are not touched", async () => {
    state.locationFound = false;

    expect(
      await code(updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place: "Montemor-o-Novo" } })),
    ).toBe("not_found");
    expect(state.tenantWrites).toEqual([]);
  });

  it("the audit rows name the field and the location id, never the place", async () => {
    await updateLocation(admin, MN, { ...base, physicalStamp: { enabled: true, place: "Montemor-o-Novo" } });

    expect(mockAudit.mock.calls.map((c) => c[2])).toEqual([
      {
        action: "tenant.update",
        entityType: "tenant",
        entityId: admin.tenantId,
        metadata: { fields: ["declaracao.physicalStamp"], locationId: MN },
      },
      { action: "location.update", entityType: "location", entityId: MN },
    ]);
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("Montemor");
  });

  it.each(["therapist", "reception"] as const)("a %s may not: refused by the capability, nothing read", async (role) => {
    const actor = { ...admin, role } as RequestContext;
    await expect(
      updateLocation(actor, MN, { ...base, physicalStamp: { enabled: true, place: "Montemor-o-Novo" } }),
    ).rejects.toThrow();
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("listPhysicalStampPlaces - what Administração > Locais shows", () => {
  it("the place of each marked location, and no entry for an unmarked or malformed one", async () => {
    state.settings = {
      declaracao: { physicalStamp: { [MN]: { place: "Montemor-o-Novo" }, [OTHER]: { place: "" } } },
    };

    expect(await listPhysicalStampPlaces(admin, [MN, OTHER, "unknown"])).toEqual({ [MN]: "Montemor-o-Novo" });
  });

  it("no tenant row in view: nothing is marked", async () => {
    state.tenantVisible = false;
    expect(await listPhysicalStampPlaces(admin, [MN])).toEqual({});
  });
});
