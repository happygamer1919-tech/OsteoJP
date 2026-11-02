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

const { listPacksInUse } = await import("./in-use-read");

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
