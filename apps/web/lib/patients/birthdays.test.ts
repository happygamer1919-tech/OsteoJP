import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn() }));
// The read scope asks whether the care-team helper exists before naming it; that
// probe is a read of its own and would land on the fake runScoped below.
vi.mock("@/lib/patients/care-team-reads-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/patients/care-team-reads-gate")>()),
  careTeamClinicHelperPresent: vi.fn(async () => true),
}));

import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import type { RequestContext } from "@osteojp/auth";
import {
  birthdayHeaderIconEnabled,
  listTodaysBirthdays,
  loadBirthdayIndication,
} from "./birthdays";

/**
 * Indicação de Aniversários: the read goes through the VIEWER'S OWN scoped
 * client, carries the /patients list's scope, and stops at the setting.
 *
 * The fake transaction answers whatever it is handed, so "it narrowed" is read
 * from the SQL the captured WHERE renders to, through drizzle's real Postgres
 * dialect (the documents.visibility-scope.test.ts technique). The real database
 * half is birthdays.db.test.ts.
 */

const mockRunScoped = vi.mocked(runScoped);
const mockLocations = vi.mocked(viewerLocationScope);
const dialect = new PgDialect();

const TENANT = "tenant-1";
const THERAPIST_ID = "44444444-4444-4444-8444-444444444444";
const CLINIC = "55555555-5555-4555-8555-555555555555";
const PATIENT = "99999999-9999-4999-8999-999999999999";

const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const reception: RequestContext = { tenantId: TENANT, role: "reception", userId: "u-rec" };
const admin: RequestContext = { tenantId: TENANT, role: "admin", userId: "u-adm" };

/** 00:30 on 16 July in Lisbon, 23:30 on 15 July in UTC. */
const NOW = new Date("2026-07-15T23:30:00.000Z");

const THERAPIST_SCOPE = /ap\.practitioner_id = \$\d+ OR ap\.practitioner_2_id = \$\d+/;
const LOCATION_SCOPE = /ap\.location_id IN \(/;

/** A fake tx: the patients read returns `rows`, the setting read returns `on`. */
function fakeDb(opts: { rows?: unknown[]; on?: unknown } = {}) {
  const wheres: SQL[] = [];
  const contexts: RequestContext[] = [];
  mockRunScoped.mockImplementation(async (ctx, fn) => {
    contexts.push(ctx);
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = (w: SQL) => {
      wheres.push(w);
      return chain;
    };
    chain.orderBy = () => chain;
    chain.limit = async () => (opts.on === undefined ? (opts.rows ?? []) : [{ on: opts.on }]);
    return fn({ select: () => chain } as never);
  });
  return { wheres, contexts };
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockLocations.mockReset();
  mockLocations.mockResolvedValue(null);
});

describe("listTodaysBirthdays reads through the viewer's own scoped client", () => {
  it("runs inside runScoped with the VIEWER'S context, once, and nowhere else", async () => {
    const { contexts } = fakeDb({ rows: [] });
    await listTodaysBirthdays(reception, NOW);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(contexts).toEqual([reception]);
  });

  it("the module has no admin or service-role door: no getDbAdmin, no admin client, no reminder context", () => {
    const code = readFileSync(join(__dirname, "birthdays.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/getDbAdmin|createSupabaseAdminClient|withReminderTenantContext|withTenantContext/);
    expect(code).toMatch(/runScoped\(/);
  });

  it("asks for the LISBON day's birthdays: 16 July at 00:30 Lisbon, though UTC still reads the 15th", async () => {
    const { wheres } = fakeDb({ rows: [] });
    await listTodaysBirthdays(admin, NOW);
    const q = dialect.sqlToQuery(wheres[0]!);
    expect(q.sql).toContain(`to_char("patients"."date_of_birth", 'MM-DD') = $`);
    expect(q.params).toContain("07-16");
    expect(q.params).not.toContain("07-15");
    expect(q.sql).toContain('"patients"."deleted_at" is null');
  });

  it("on 28 February of a non-leap year asks for 02-28 and 02-29", async () => {
    const { wheres } = fakeDb({ rows: [] });
    await listTodaysBirthdays(admin, new Date("2027-02-28T12:00:00.000Z"));
    const q = dialect.sqlToQuery(wheres[0]!);
    expect(q.params).toEqual(expect.arrayContaining(["02-28", "02-29"]));
  });

  it("a THERAPIST carries the therapist read scope, keyed on patients.id", async () => {
    const { wheres } = fakeDb({ rows: [] });
    await listTodaysBirthdays(therapist, NOW);
    const q = dialect.sqlToQuery(wheres[0]!);
    expect(q.sql).toMatch(THERAPIST_SCOPE);
    expect(q.sql).toMatch(/po\.id = "patients"\."id"/);
    expect(q.params).toEqual(expect.arrayContaining([THERAPIST_ID]));
  });

  it("a RECEPTIONIST assigned to a clinic carries that clinic's scope", async () => {
    mockLocations.mockResolvedValue([CLINIC]);
    const { wheres } = fakeDb({ rows: [] });
    await listTodaysBirthdays(reception, NOW);
    const q = dialect.sqlToQuery(wheres[0]!);
    expect(q.sql).toMatch(LOCATION_SCOPE);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    expect(q.params).toEqual(expect.arrayContaining([CLINIC]));
  });

  it("THE CONTROL: an admin with no clinic assignment carries neither scope", async () => {
    const { wheres } = fakeDb({ rows: [] });
    await listTodaysBirthdays(admin, NOW);
    const q = dialect.sqlToQuery(wheres[0]!);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    expect(q.sql).not.toMatch(LOCATION_SCOPE);
  });

  it("returns name and the age turned, never the date of birth", async () => {
    fakeDb({ rows: [{ id: PATIENT, fullName: "Ana Exemplo", dateOfBirth: "1980-07-16" }] });
    const rows = await listTodaysBirthdays(admin, NOW);
    expect(rows).toEqual([{ id: PATIENT, fullName: "Ana Exemplo", age: 46 }]);
  });

  it("leaves out a date of birth in this year or later (a typing error, not a birthday)", async () => {
    fakeDb({ rows: [{ id: PATIENT, fullName: "Ana Exemplo", dateOfBirth: "2026-07-16" }] });
    expect(await listTodaysBirthdays(admin, NOW)).toEqual([]);
  });
});

describe("the setting gates the read", () => {
  it("OFF: loadBirthdayIndication answers null and never reads a patient", async () => {
    const { contexts } = fakeDb({ on: false });
    expect(await loadBirthdayIndication(therapist, NOW)).toBeNull();
    // One scoped read, the setting's; no patients read followed.
    expect(contexts).toEqual([therapist]);
  });

  it("only a literal true from the database is ON", async () => {
    for (const on of [null, "true", 1]) {
      fakeDb({ on });
      expect(await birthdayHeaderIconEnabled(admin)).toBe(false);
    }
    fakeDb({ on: true });
    expect(await birthdayHeaderIconEnabled(admin)).toBe(true);
  });

  it("the setting is read under the viewer's claims too", async () => {
    const { contexts } = fakeDb({ on: false });
    await birthdayHeaderIconEnabled(reception);
    expect(contexts).toEqual([reception]);
  });
});
