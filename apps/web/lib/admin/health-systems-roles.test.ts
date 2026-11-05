import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sistemas / SubSistemas, ruling Q10 (2026-11-04): the list is managed by owner
 * and admin; reception and therapists only pick from it. Ruling Q11: deactivate
 * only, never delete.
 *
 * This runs the server functions against the REAL permission matrix
 * (@osteojp/auth is not mocked), with the database stubbed so that reaching it
 * is recorded. A refused role must be refused BEFORE any database work. The
 * RLS side (INSERT and UPDATE policies for owner and admin only, no DELETE
 * grant) is proven in packages/db/tests/health-systems-rls.db.test.ts.
 */

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({ reached: 0 }));

vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async () => {
    H.reached += 1;
    return [];
  }),
}));

vi.mock("./audit", () => ({ writeAudit: vi.fn(async () => undefined) }));

import { can } from "@osteojp/auth";
import * as lib from "./health-systems";

type Role = "owner" | "admin" | "therapist" | "reception";
const actor = (role: Role) => ({ tenantId: "tenant-A", role, userId: `user-${role}` }) as never;

const errName = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => "accepted",
    (e: { name?: string }) => e.name ?? "unknown",
  );

beforeEach(() => {
  H.reached = 0;
});

describe("Sistemas / SubSistemas: who may manage the list (Q10)", () => {
  for (const role of ["therapist", "reception"] as const) {
    it(`${role}: every write and the settings read are refused before the database`, async () => {
      expect(await errName(lib.createHealthSystem(actor(role), "SAMS"))).toBe("ForbiddenError");
      expect(await errName(lib.setHealthSystemActive(actor(role), "hs-1", false))).toBe("ForbiddenError");
      expect(await errName(lib.setHealthSystemActive(actor(role), "hs-1", true))).toBe("ForbiddenError");
      expect(await errName(lib.setHealthSystemsPriceTable(actor(role), true))).toBe("ForbiddenError");
      expect(await errName(lib.listHealthSystems(actor(role)))).toBe("ForbiddenError");
      expect(await errName(lib.getHealthSystemsPriceTable(actor(role)))).toBe("ForbiddenError");
      expect(H.reached).toBe(0);
    });

    it(`${role}: cannot enter the admin area the panel sits in (no settings:read)`, () => {
      // apps/web/app/admin/layout.tsx redirects any role without settings:read.
      expect(can(role, "settings:read")).toBe(false);
      expect(can(role, "settings:manage")).toBe(false);
    });
  }

  for (const role of ["owner", "admin"] as const) {
    it(`${role}: the writes pass the capability check and reach the database`, async () => {
      expect(can(role, "settings:manage")).toBe(true);
      await lib.setHealthSystemsPriceTable(actor(role), true);
      await lib.listHealthSystems(actor(role));
      expect(H.reached).toBe(2);
    });
  }

  for (const role of ["owner", "admin", "therapist", "reception"] as const) {
    it(`${role}: may read the ficha dropdown (pick from the list)`, async () => {
      expect(await lib.listHealthSystemOptions(actor(role))).toEqual([]);
      expect(H.reached).toBe(1);
    });
  }
});

describe("Sistemas / SubSistemas: deactivate only, never delete (Q11)", () => {
  it("the server module exports no delete function", () => {
    const names = Object.keys(lib);
    expect(names.filter((n) => /delete|remove|destroy|purge/i.test(n))).toEqual([]);
  });
});
