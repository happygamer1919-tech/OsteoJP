import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let rows: Array<{ fullName: string | null }> = [];
let throwOnRead = false;

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (throwOnRead) throw new Error("db down");
    return fn({
      select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    });
  },
}));

import { staffDisplayName, initialsFor } from "./staff-identity";
import type { RequestContext } from "@/lib/auth/context";

const ctx: RequestContext = { tenantId: "t", role: "therapist", userId: "u1" };

beforeEach(() => {
  rows = [];
  throwOnRead = false;
});

/**
 * ==========================================================================
 * LE-staff-display-name-is-email-local-part.
 * ==========================================================================
 * The shell derived its greeting from the session EMAIL, splitting the local
 * part and title-casing it. For a real invited address that rendered
 * "Boa noite, Chris+terapeuta2" on a clinic screen.
 *
 * Owner ruling: do not invent a human name from an address. The field the
 * ruling asks for already existed - `users.full_name`, required at invite and
 * editable in O meu perfil - so this reads it rather than adding one.
 */
describe("staffDisplayName - the name the clinic typed", () => {
  it("returns the stored full name", async () => {
    rows = [{ fullName: "Ana Morais" }];
    expect(await staffDisplayName(ctx)).toBe("Ana Morais");
  });

  it("returns null when the name is empty or whitespace, so the caller falls back", async () => {
    // NOT an empty string: the caller distinguishes "no name" from "a name that
    // happens to be blank", and `?? fallback` only works on null.
    rows = [{ fullName: "   " }];
    expect(await staffDisplayName(ctx)).toBeNull();
    rows = [{ fullName: "" }];
    expect(await staffDisplayName(ctx)).toBeNull();
    rows = [{ fullName: null }];
    expect(await staffDisplayName(ctx)).toBeNull();
  });

  it("returns null when there is no row at all", async () => {
    // DELIBERATELY NOT A THROW, unlike requiresPasswordRotation in the same
    // shell. That one decides ACCESS; this decides a GREETING, and refusing to
    // render the platform over a cosmetic string would be wildly out of
    // proportion.
    rows = [];
    expect(await staffDisplayName(ctx)).toBeNull();
  });

  it("trims, so a stray space does not become the name", async () => {
    rows = [{ fullName: "  Ana Morais  " }];
    expect(await staffDisplayName(ctx)).toBe("Ana Morais");
  });

  it("lets a read failure surface to the caller, which catches it", async () => {
    // The function does not swallow: the SHELL decides that a failure is
    // non-fatal, because the shell is what knows the consequence.
    throwOnRead = true;
    await expect(staffDisplayName(ctx)).rejects.toThrow();
  });
});

describe("initialsFor - derived from the DISPLAYED name, never the email", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsFor("Ana Morais")).toBe("AM");
    expect(initialsFor("Ana Sofia Morais Silva")).toBe("AS");
  });

  it("falls back to one letter for a single word", () => {
    expect(initialsFor("Ana")).toBe("A");
  });

  it("does not disagree with the header - it is given the same string", () => {
    // The avatar reading "CT" beside a header reading "Chris Silva" is its own
    // small wrongness, and taking the displayed name as the argument is what
    // makes it impossible.
    const shown = "Chris Silva";
    expect(initialsFor(shown)).toBe("CS");
  });
});
