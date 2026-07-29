/**
 * PL-09 viewerLocationScope — the role-gating + fallback decision.
 * owner/therapist -> null (unrestricted here); reception/admin -> their assigned
 * set; reception/admin with NO assignment -> null (never locked out).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ rows: [] as { locationId: string }[] }));

vi.mock("server-only", () => ({}));
vi.mock("@osteojp/db", () => ({ staffLocations: { userId: "user_id", locationId: "location_id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  runScoped: vi.fn(async (_actor: unknown, cb: (tx: unknown) => unknown) =>
    cb({
      select: () => ({
        from: () => ({
          where: () => ({ then: (fn: (r: { locationId: string }[]) => unknown) => Promise.resolve(H.rows).then(fn) }),
        }),
      }),
    }),
  ),
}));

import { viewerLocationScope, resolveViewerLocationIds } from "./viewer-locations";

const ctx = (role: string) => ({ tenantId: "t", role, userId: "u" }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  H.rows = [];
});

describe("viewerLocationScope (PL-09)", () => {
  it("returns null for owner and therapist even if they have memberships", async () => {
    H.rows = [{ locationId: "L1" }];
    expect(await viewerLocationScope(ctx("owner"))).toBeNull();
    expect(await viewerLocationScope(ctx("therapist"))).toBeNull();
  });

  it("returns the assigned set for reception and admin", async () => {
    H.rows = [{ locationId: "L1" }, { locationId: "L2" }];
    expect(await viewerLocationScope(ctx("reception"))).toEqual(["L1", "L2"]);
    expect(await viewerLocationScope(ctx("admin"))).toEqual(["L1", "L2"]);
  });

  it("falls back to null when reception/admin has NO assignment (never locks out)", async () => {
    H.rows = [];
    expect(await viewerLocationScope(ctx("reception"))).toBeNull();
    expect(await viewerLocationScope(ctx("admin"))).toBeNull();
  });

  it("resolveViewerLocationIds returns the raw location ids", async () => {
    H.rows = [{ locationId: "L1" }];
    expect(await resolveViewerLocationIds(ctx("reception"))).toEqual(["L1"]);
  });
});
