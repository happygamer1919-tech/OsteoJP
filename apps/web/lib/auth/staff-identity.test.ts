import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let rows: Array<{ fullName: string | null; birthdayIconOn?: unknown }> = [];
let throwOnRead = false;
let reads = 0;
const selected: Array<Record<string, unknown>> = [];
const joins: unknown[] = [];

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (throwOnRead) throw new Error("db down");
    reads += 1;
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.leftJoin = (t: unknown) => {
      joins.push(t);
      return chain;
    };
    chain.where = () => chain;
    chain.limit = async () => rows;
    return fn({
      select: (cols: Record<string, unknown>) => {
        selected.push(cols);
        return chain;
      },
    });
  },
}));

import { tenants } from "@osteojp/db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { staffDisplayName, staffShellIdentity, initialsFor } from "./staff-identity";
import type { RequestContext } from "@/lib/auth/context";

const ctx: RequestContext = { tenantId: "t", role: "therapist", userId: "u1" };

beforeEach(() => {
  rows = [];
  throwOnRead = false;
  reads = 0;
  selected.length = 0;
  joins.length = 0;
});

/**
 * Indicação de Aniversários: the tenant's switch rides on the shell's identity
 * read, so an OFF tenant pays no extra transaction for the feature.
 */
describe("staffShellIdentity - the name and the birthday switch, in one read", () => {
  it("is ONE scoped read: the users row joined to the tenants row", async () => {
    rows = [{ fullName: "Ana Morais", birthdayIconOn: false }];
    expect(await staffShellIdentity(ctx)).toEqual({ name: "Ana Morais", birthdayIconOn: false });
    expect(reads).toBe(1);
    expect(joins).toEqual([tenants]);
  });

  it("selects the switch with the JSON-boolean rule, not the whole settings blob", () => {
    return staffShellIdentity(ctx).then(() => {
      const q = new PgDialect().sqlToQuery(selected[0]!.birthdayIconOn as SQL);
      expect(q.sql).toBe(
        `coalesce(("tenants"."settings" -> 'birthdayIndication' -> 'headerIcon') = 'true'::jsonb, false)`,
      );
      expect(Object.keys(selected[0]!).sort()).toEqual(["birthdayIconOn", "fullName"]);
    });
  });

  it("only a literal true is ON; no row is no name and no icon", async () => {
    for (const on of [null, "true", 1, undefined]) {
      rows = [{ fullName: "Ana Morais", birthdayIconOn: on }];
      expect((await staffShellIdentity(ctx)).birthdayIconOn).toBe(false);
    }
    rows = [{ fullName: "  ", birthdayIconOn: true }];
    expect(await staffShellIdentity(ctx)).toEqual({ name: null, birthdayIconOn: true });
    rows = [];
    expect(await staffShellIdentity(ctx)).toEqual({ name: null, birthdayIconOn: false });
  });

  it("lets a read failure surface to the shell, which catches it", async () => {
    throwOnRead = true;
    await expect(staffShellIdentity(ctx)).rejects.toThrow();
  });
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
