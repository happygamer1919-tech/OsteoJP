import { vi, describe, it, expect, beforeEach } from "vitest";

// W6-02 (b) - self-service profile actions. The own-account guarantee is
// STRUCTURAL: neither action accepts a target user id, so a client can never
// address a foreign account; the write is scoped to ctx.userId and the audit
// records ctx.userId. This pins that, plus the password precheck reuse and the
// audit writes.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(),
  runScoped: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/admin/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

import { users } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";
import { updateOwnProfileAction, changeOwnPasswordAction } from "./actions";
import type { RequestContext } from "@osteojp/auth";

const mockCtx = vi.mocked(requireRequestContext);
const mockRunScoped = vi.mocked(runScoped);
const mockSupabase = vi.mocked(createSupabaseServerClient);
const mockAudit = vi.mocked(writeAudit);

const actorA: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "user-A" };

function makeTx() {
  const calls = { updateTable: undefined as unknown, whereCalled: false };
  const tx = {
    update: (table: unknown) => {
      calls.updateTable = table;
      return {
        set: () => ({
          where: async () => {
            calls.whereCalled = true;
          },
        }),
      };
    },
  };
  return { tx, calls };
}

beforeEach(() => {
  mockCtx.mockReset();
  mockRunScoped.mockReset();
  mockSupabase.mockReset();
  mockAudit.mockReset();
  mockCtx.mockResolvedValue(actorA);
});

describe("updateOwnProfileAction (W6-02 self-scope)", () => {
  it("writes the actor's own users row and audits ctx.userId (no foreign id possible)", async () => {
    const { tx, calls } = makeTx();
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));

    const r = await updateOwnProfileAction("Novo Nome");
    expect(r).toEqual({ ok: true });

    // Ran under the ACTOR's scope, wrote the users table.
    expect(mockRunScoped.mock.calls[0][0]).toBe(actorA);
    expect(calls.updateTable).toBe(users);
    expect(calls.whereCalled).toBe(true);

    // Audit records the ACTOR's own id, PII-free.
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][2];
    expect(entry.action).toBe("user.profile.update");
    expect(entry.entityId).toBe("user-A");
    expect(JSON.stringify(entry.metadata)).not.toContain("Novo Nome");
  });

  it("rejects an empty name before any DB work", async () => {
    const r = await updateOwnProfileAction("   ");
    expect(r).toEqual({ ok: false, error: "validation" });
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});

describe("changeOwnPasswordAction (W6-02 self-session)", () => {
  function supabaseReturning(error: { name: string } | null) {
    const updateUser = vi.fn(async () => ({ error }));
    mockSupabase.mockResolvedValue({ auth: { updateUser } } as never);
    return updateUser;
  }

  it("changes the caller's own password via the session and audits it", async () => {
    const updateUser = supabaseReturning(null);
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb({} as never)));

    const r = await changeOwnPasswordAction("abcd1234", "abcd1234");
    expect(r).toEqual({ ok: true });
    // The Supabase session (which IS the actor) changes the password - no user id.
    expect(updateUser).toHaveBeenCalledWith({ password: "abcd1234" });
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0][2].action).toBe("user.password.change");
    expect(mockAudit.mock.calls[0][2].entityId).toBe("user-A");
  });

  it("rejects a weak password via the shared precheck before touching Supabase", async () => {
    const updateUser = supabaseReturning(null);
    const r = await changeOwnPasswordAction("short", "short");
    expect(r).toEqual({ ok: false, error: "validation" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects a mismatched confirmation before touching Supabase", async () => {
    const updateUser = supabaseReturning(null);
    const r = await changeOwnPasswordAction("abcd1234", "abcd9999");
    expect(r).toEqual({ ok: false, error: "validation" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase policy rejection as password_policy", async () => {
    supabaseReturning({ name: "AuthApiError" });
    const r = await changeOwnPasswordAction("abcd1234", "abcd1234");
    expect(r).toEqual({ ok: false, error: "password_policy" });
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
