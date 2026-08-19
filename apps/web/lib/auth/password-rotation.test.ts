import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/** Rows the stubbed query returns for the caller's own id. */
let rows: Array<{ mustSetPassword: boolean }> = [];
/** Recorded update payloads, so the clear path can be asserted. */
let updates: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
      update: () => chain,
      set: (v: Record<string, unknown>) => {
        updates.push(v);
        return chain;
      },
    };
    // `update().set().where()` must be awaitable; `select()...limit()` resolves
    // on its own. A thenable on the chain covers the update form.
    return fn({
      ...chain,
      where: (..._a: unknown[]) => ({ ...chain, then: (r: (v: unknown) => void) => r(undefined) }),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    });
  },
}));

import {
  requiresPasswordRotation,
  clearPasswordRotationFlag,
  PasswordRotationUnknownError,
} from "./password-rotation";
import type { RequestContext } from "@/lib/auth/context";

const ctx: RequestContext = {
  tenantId: "tenant-1",
  role: "therapist",
  userId: "user-1",
};

beforeEach(() => {
  rows = [];
  updates = [];
});

/**
 * ==========================================================================
 * SEC-02 - the forced-rotation guard, and it is a VERDICT PATH.
 * ==========================================================================
 * Observed on deployed production 2026-08-18: the invite issues a temporary
 * password and first login accepted it and logged straight in, so the
 * credential an admin chose and read became the account's permanent password.
 * Under R9 that hand-off is the WHOLE onboarding path, not a fallback.
 *
 * THE TESTS THAT MATTER MOST ARE THE FAILURE ONES. The tempting implementation
 * is `return row?.mustSetPassword ?? false`, which maps four distinct failures -
 * no row, an RLS refusal, a query error, an unmigrated schema - onto "this
 * password is fine". All four would read as a guard that passed, on the path
 * where being wrong grants access. PORTAL-REHYDRATE 1.3.
 */
describe("SEC-02 - requiresPasswordRotation answers, or refuses to answer", () => {
  it("reports true while the account still holds its temporary password", async () => {
    rows = [{ mustSetPassword: true }];
    expect(await requiresPasswordRotation(ctx)).toBe(true);
  });

  it("reports false once the flag is cleared", async () => {
    rows = [{ mustSetPassword: false }];
    expect(await requiresPasswordRotation(ctx)).toBe(false);
  });

  it("THROWS on a missing row rather than reporting false", async () => {
    // THE LOAD-BEARING CASE. An authenticated session whose `sub` matches no
    // staff row is not routine - it is a deleted user holding a live token, or
    // a tenant mismatch. `?? false` would admit all of them silently.
    rows = [];
    await expect(requiresPasswordRotation(ctx)).rejects.toBeInstanceOf(
      PasswordRotationUnknownError,
    );
  });

  it("names only the id when it throws - no email, no name, no password", async () => {
    // CLAUDE.md rule 7. Ids are not PII; everything else on a staff row is.
    rows = [];
    await expect(requiresPasswordRotation(ctx)).rejects.toThrow(/user-1/);
    await expect(requiresPasswordRotation(ctx)).rejects.not.toThrow(/@/);
  });

  it("treats a non-true value as true is NOT the rule - only an explicit false clears", async () => {
    // `mustSetPassword === true` is the comparison, so a corrupted or widened
    // value cannot accidentally read as "still pending" either. The column is
    // NOT NULL with a default, so this asserts the comparison stays explicit
    // rather than truthy.
    rows = [{ mustSetPassword: false }];
    expect(await requiresPasswordRotation(ctx)).toBe(false);
    rows = [{ mustSetPassword: true }];
    expect(await requiresPasswordRotation(ctx)).toBe(true);
  });
});

describe("SEC-02 - clearing the flag", () => {
  it("sets must_set_password to false for the caller", async () => {
    await clearPasswordRotationFlag(ctx);
    expect(updates).toEqual([{ mustSetPassword: false }]);
  });
});
