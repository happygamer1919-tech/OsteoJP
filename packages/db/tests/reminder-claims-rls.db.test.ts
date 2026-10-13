/**
 * reminder-claims-rls.db.test.ts: the reminder sweep's two tables,
 * reminder_claims and reminder_sweep_passes (pending; strategy ruled the
 * number 0106 on 2026-10-13).
 *
 * The migration is packages/db/migrations-pending/NEXT-AFTER-0105_reminder_
 * claims.sql until it is promoted. So this file ASKS THE DATABASE WHICH SIDE IT
 * IS ON and names it in each title. On a database that has both tables, every
 * arm runs. On one that has neither, every arm is skipped. It THROWS on a
 * database that has one table of the two, and from the promotion commit on it
 * THROWS on a database that has neither: then a skip is no longer an answer.
 *
 * WHAT IS PROVEN, AND AS WHOM. Every arm about access runs as the real
 * principal, inside a transaction that always rolls back:
 *   - THE REMINDER JOB: role `authenticated`, with exactly the claims
 *     withReminderTenantContext sets (apps/web/lib/reminders/context.ts): a
 *     tenant, the role `admin`, and NO user;
 *   - A STAFF SESSION: role `authenticated`, a tenant, a role and a user;
 *   - a patient session (role `patient`) and a request with no session (role
 *     `anon`).
 * Both ways: what is allowed is shown to succeed, and what is refused is shown
 * to fail with the server's own error. A catalogue read is the cross-check at
 * the end, never the proof.
 *
 * THE RULINGS UNDER TEST (the brief of 2026-10-13):
 *   W  only the reminder job writes; a staff session reads its own tenant and
 *      never inserts, updates or deletes; anon and patient get nothing;
 *   A  append only: no application role can update or delete a row, by the
 *      grants AND, separately, by the policies;
 *   7b nothing in the table makes "held" final: a second claim for the same
 *      reminder and the same start is accepted.
 * AND STRATEGY'S RULINGS OF 2026-10-13 ON THE FIRST DRAFT:
 *   W-1 the writer is the userless `authenticated` session: a logged-in owner,
 *       admin, reception and therapist are EACH refused an insert on BOTH
 *       tables;
 *   W-5 `service_role` is revoked by name on both tables: it is refused every
 *       statement, the reminder job's write path still succeeds, and PUBLIC
 *       holds nothing;
 *   W-6 the claims INSERT policy proves the appointment is of the row's
 *       tenant: the job's own appointment is accepted, another tenant's is
 *       refused, and the job's session sees the appointments it must claim.
 *
 * The owner connection seeds, cleans and tests the CHECK constraints (it
 * bypasses RLS, which is what makes those arms a test of the constraints and
 * of nothing else).
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql as drizzleSql } from "drizzle-orm";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTenantContext } from "../index";
import { reminderClaims, reminderSweepPasses } from "../src/schema";
import { type AppRole, Rollback, asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

/** The statement only this migration holds. */
const MARKER = "CREATE TABLE public.reminder_claims";

/** The promoted migration files that create reminder_claims, if any. */
function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(MARKER));
}

/** Which side of the migration this database is on. Throws on anything but a whole side. */
async function tablesState(): Promise<{ applied: boolean; side: string }> {
  if (!live) return { applied: false, side: "no database" };
  const probe = connect();
  try {
    const [row] = await probe<{ claims: boolean; passes: boolean }[]>`
      select to_regclass('public.reminder_claims') is not null as claims,
             to_regclass('public.reminder_sweep_passes') is not null as passes`;
    if (row === undefined) throw new Error("REMINDER CLAIMS STATE UNREADABLE. Nothing here was measured.");
    if (row.claims !== row.passes) {
      throw new Error(
        `THE MIGRATION IS HALF APPLIED: reminder_claims ${row.claims}, reminder_sweep_passes ${row.passes}. ` +
          "It applies as one transaction, so this database was built some other way. Nothing here was measured.",
      );
    }
    const files = promotedFiles();
    if (files.length > 0 && !row.claims) {
      throw new Error(
        `THE MIGRATION IS PROMOTED (${files.join(", ")} creates reminder_claims) BUT THIS DATABASE DOES NOT HAVE IT. ` +
          "From the promotion on, a skip is no longer acceptable. Nothing here was measured.",
      );
    }
    return {
      applied: row.claims,
      side: row.claims ? "TABLES PRESENT" : "TABLES ABSENT on this database (flips when the migration is applied)",
    };
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const state = await tablesState();
const SIDE = state.side;
const d = live && state.applied ? describe : describe.skip;

/** The reminder job's own claims: a tenant, the role admin, and no user. Exactly context.ts. */
const jobClaims = (tenantId: string): string => JSON.stringify({ tenant_id: tenantId, user_role: "admin" });

d(`reminder_claims and reminder_sweep_passes: only the job writes, nobody rewrites [${SIDE}]`, () => {
  let sql: Sql;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const location = randomUUID();
  const otherLocation = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();
  const staffUser = randomUUID();
  const patient = randomUUID();
  const otherPatient = randomUUID();
  /** The appointment most arms use. */
  const appointment = randomUUID();
  /** A second appointment of the same tenant: the cross-appointment release, and the delete. */
  const appointment2 = randomUUID();
  /** A CANCELLED appointment of the same tenant: a claim's release may come after the visit was cancelled. */
  const cancelledAppointment = randomUUID();
  /** Another tenant's appointment. */
  const otherAppointment = randomUUID();

  /** Seeded on the owner connection, so they persist for the reading arms. */
  const seededClaim = randomUUID();
  const seededClaim2 = randomUUID();
  const otherTenantClaim = randomUUID();

  const START = "2027-02-01T10:00:00Z";
  const DUE_24H = "2027-01-31T10:00:00Z";

  /** A claim row, whole. */
  const claimRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    tenant_id: tenant,
    appointment_id: appointment,
    kind: "claim",
    offset_id: "24h",
    channel: "sms",
    starts_at: START,
    due_at: DUE_24H,
    taker: "run",
    early: false,
    ...over,
  });
  /** A release row naming `claimId`, whole. */
  const releaseRow = (claimId: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    tenant_id: tenant,
    appointment_id: appointment,
    kind: "release",
    offset_id: "24h",
    channel: "sms",
    claim_id: claimId,
    ...over,
  });
  /** A shadow row, whole. */
  const shadowRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    tenant_id: tenant,
    appointment_id: appointment,
    kind: "shadow",
    offset_id: "24h",
    channel: "sms",
    starts_at: START,
    due_at: DUE_24H,
    minutes_after_mark: 7,
    saved_after_mark: false,
    pass_id: "pass-test-1",
    ...over,
  });
  /** A heartbeat row, whole. */
  const passRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    tenant_id: tenant,
    pass_id: "pass-test-1",
    mode: "shadow",
    pass_at: "2027-01-31T10:15:00Z",
    due_count: 3,
    recorded_count: 3,
    over_ceiling: false,
    excluded_count: 1,
    ...over,
  });

  /** Insert on the OWNER connection: the constraints alone decide. Error text, or null when accepted. */
  const ownerInsert = async (table: "reminder_claims" | "reminder_sweep_passes", row: Record<string, unknown>) => {
    try {
      await sql`insert into ${sql(table)} ${sql(row)}`;
      return null;
    } catch (e) {
      return String((e as { message?: string }).message ?? e);
    }
  };

  /**
   * Run `fn` as a database role with claims, always rolled back, and return the
   * server's error text, or null when every statement was accepted. `anon` is
   * not a role the shared harness names, so this is the harness's own
   * transaction shape with the role passed through.
   */
  const attempt = async (
    role: "authenticated" | "patient" | "anon",
    claims: string | null,
    fn: (tx: TransactionSql) => Promise<unknown>,
  ): Promise<string | null> => {
    try {
      await sql.begin(async (tx) => {
        // `role` is a closed string-literal union: no injection surface.
        await tx.unsafe(`set local role ${role}`);
        if (claims !== null) await tx`select set_config('request.jwt.claims', ${claims}, true)`;
        await fn(tx);
        throw new Rollback(null);
      });
      throw new Error("unreachable: transaction committed without rollback");
    } catch (err) {
      if (err instanceof Rollback) return null;
      return String((err as { message?: string }).message ?? err);
    }
  };

  /** How many rows of a table a principal can see. */
  const seen = (table: "reminder_claims" | "reminder_sweep_passes", claims: string) =>
    asRole(sql, "authenticated", claims, async (tx) => {
      const rows = (await tx`select count(*)::int as n from ${tx(table)}`) as { n: number }[];
      return Number(rows[0]!.n);
    });

  const STAFF: AppRole[] = ["owner", "admin", "reception", "therapist"];

  beforeAll(async () => {
    sql = connect();
    for (const [id, name] of [
      [tenant, "rc-a"],
      [otherTenant, "rc-b"],
    ] as const) {
      await sql`insert into tenants (id, name, slug) values (${id}, ${name}, ${name + "-" + id.slice(0, 8)})`;
    }
    await sql`insert into locations (id, tenant_id, name) values (${location}, ${tenant}, 'RC Loc'), (${otherLocation}, ${otherTenant}, 'RC Loc B')`;
    await sql`insert into users (id, tenant_id, email, full_name) values
                (${therapist}, ${tenant}, ${"rc-thr-" + therapist.slice(0, 8) + "@example.test"}, 'RC Thr'),
                (${staffUser}, ${tenant}, ${"rc-stf-" + staffUser.slice(0, 8) + "@example.test"}, 'RC Staff'),
                (${otherTherapist}, ${otherTenant}, ${"rc-thr-" + otherTherapist.slice(0, 8) + "@example.test"}, 'RC Thr B')`;
    await sql`insert into patients (id, tenant_id, full_name, patient_number, created_by) values
                (${patient}, ${tenant}, 'RC Patient', 9501, ${therapist}),
                (${otherPatient}, ${otherTenant}, 'RC Patient B', 9502, ${otherTherapist})`;
    await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status) values
                (${appointment}, ${tenant}, ${patient}, ${therapist}, ${location}, ${START}, '2027-02-01T10:45:00Z', 'scheduled'),
                (${appointment2}, ${tenant}, ${patient}, ${therapist}, ${location}, '2027-02-02T10:00:00Z', '2027-02-02T10:45:00Z', 'scheduled'),
                (${cancelledAppointment}, ${tenant}, ${patient}, ${therapist}, ${location}, '2027-02-03T10:00:00Z', '2027-02-03T10:45:00Z', 'cancelled'),
                (${otherAppointment}, ${otherTenant}, ${otherPatient}, ${otherTherapist}, ${otherLocation}, ${START}, '2027-02-01T10:45:00Z', 'scheduled')`;
    // One claim, one shadow row and one heartbeat per tenant, for the reading arms.
    await sql`insert into reminder_claims ${sql(claimRow({ id: seededClaim }))}`;
    await sql`insert into reminder_claims ${sql(claimRow({ id: seededClaim2, appointment_id: appointment2, starts_at: "2027-02-02T10:00:00Z", due_at: "2027-02-01T10:00:00Z" }))}`;
    await sql`insert into reminder_claims ${sql(shadowRow())}`;
    await sql`insert into reminder_claims ${sql(claimRow({ id: otherTenantClaim, tenant_id: otherTenant, appointment_id: otherAppointment }))}`;
    await sql`insert into reminder_sweep_passes ${sql(passRow())}`;
    await sql`insert into reminder_sweep_passes ${sql(passRow({ tenant_id: otherTenant }))}`;
  });

  afterAll(async () => {
    if (!live) return;
    await sql`delete from reminder_claims where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from reminder_sweep_passes where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from appointments where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from patients where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from users where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from locations where tenant_id in (${tenant}, ${otherTenant})`;
    await sql`delete from tenants where id in (${tenant}, ${otherTenant})`;
    await sql.end();
  });

  describe("the reminder job writes and reads its own tenant", () => {
    it("inserts a claim, with RETURNING, and reads it back", async () => {
      // RETURNING puts the new row to the SELECT policy as well, and the job's
      // code takes the claim id from it: both policies are on this path.
      const out = await asRole(sql, "authenticated", jobClaims(tenant), async (tx) => {
        const inserted = (await tx`insert into reminder_claims ${tx(claimRow({ taker: "sweep" }))} returning id`) as {
          id: string;
        }[];
        const back = (await tx`select kind, taker from reminder_claims where id = ${inserted[0]!.id}`) as {
          kind: string;
          taker: string;
        }[];
        return back[0];
      });
      expect(out).toEqual({ kind: "claim", taker: "sweep" });
    });

    it("inserts a release that names a claim, and a shadow row", async () => {
      const out = await asRole(sql, "authenticated", jobClaims(tenant), async (tx) => {
        await tx`insert into reminder_claims ${tx(releaseRow(seededClaim))}`;
        await tx`insert into reminder_claims ${tx(shadowRow({ pass_id: "pass-test-2" }))}`;
        const rows = (await tx`
          select kind, count(*)::int as n from reminder_claims
           where appointment_id = ${appointment} group by kind order by kind`) as { kind: string; n: number }[];
        return rows.map((r) => `${r.kind}:${r.n}`).join(",");
      });
      // One claim and one shadow row were seeded; the release and a second shadow row are the job's.
      expect(out).toBe("claim:1,release:1,shadow:2");
    });

    it("inserts a heartbeat and reads its tenant's heartbeats, and no other tenant's", async () => {
      const out = await asRole(sql, "authenticated", jobClaims(tenant), async (tx) => {
        await tx`insert into reminder_sweep_passes ${tx(passRow({ pass_id: "pass-test-2" }))}`;
        const rows = (await tx`select distinct tenant_id from reminder_sweep_passes`) as { tenant_id: string }[];
        return rows.map((r) => r.tenant_id);
      });
      expect(out).toEqual([tenant]);
    });

    it("sees its own tenant's claims and none of another tenant's", async () => {
      expect(await seen("reminder_claims", jobClaims(tenant))).toBe(3);
      expect(await seen("reminder_claims", jobClaims(otherTenant))).toBe(1);
    });

    it("is REFUSED a row that names another tenant, on both tables", async () => {
      expect(
        await attempt("authenticated", jobClaims(tenant), (tx) =>
          tx`insert into reminder_claims ${tx(claimRow({ tenant_id: otherTenant, appointment_id: otherAppointment }))}`,
        ),
      ).toMatch(/row-level security/);
      expect(
        await attempt("authenticated", jobClaims(tenant), (tx) =>
          tx`insert into reminder_sweep_passes ${tx(passRow({ tenant_id: otherTenant }))}`,
        ),
      ).toMatch(/row-level security/);
    });

    it("is REFUSED when the session carries no tenant at all", async () => {
      // The resolver context of context.ts: a role and nothing else.
      const noTenant = JSON.stringify({ user_role: "admin" });
      expect(
        await attempt("authenticated", noTenant, (tx) => tx`insert into reminder_claims ${tx(claimRow())}`),
      ).toMatch(/row-level security/);
      expect(
        await attempt("authenticated", noTenant, (tx) => tx`insert into reminder_sweep_passes ${tx(passRow())}`),
      ).toMatch(/row-level security/);
    });

    it("is REFUSED when a session with no user carries the role reception or therapist", async () => {
      // The ledger's own narrowing (0075): the writer is owner or admin. The
      // job is `admin`; nothing makes a userless reception or therapist session.
      for (const role of ["reception", "therapist"] as const) {
        const claims = JSON.stringify({ tenant_id: tenant, user_role: role });
        expect(
          await attempt("authenticated", claims, (tx) => tx`insert into reminder_claims ${tx(claimRow())}`),
          role,
        ).toMatch(/row-level security/);
        expect(
          await attempt("authenticated", claims, (tx) => tx`insert into reminder_sweep_passes ${tx(passRow())}`),
          role,
        ).toMatch(/row-level security/);
      }
    });
  });

  describe("W-6: a claim's appointment is of the row's tenant, proven as the job", () => {
    it("the job's session SEES the appointments it must claim: every one of its tenant, whatever its status, and none of another's", async () => {
      // The INSERT policy's sub-select reads appointments as the caller, through
      // the appointments policies. This arm is the tripwire: if a later change
      // narrows what an admin session with no user reads there, it goes red
      // before the job's claims start being refused in production.
      const ids = [appointment, appointment2, cancelledAppointment, otherAppointment];
      const mine = await asRole(sql, "authenticated", jobClaims(tenant), async (tx) => {
        const rows = (await tx`select id from appointments where id in ${tx(ids)}`) as { id: string }[];
        return rows.map((r) => r.id).sort();
      });
      expect(mine).toEqual([appointment, appointment2, cancelledAppointment].sort());
      const theirs = await asRole(sql, "authenticated", jobClaims(otherTenant), async (tx) => {
        const rows = (await tx`select id from appointments where id in ${tx(ids)}`) as { id: string }[];
        return rows.map((r) => r.id);
      });
      expect(theirs).toEqual([otherAppointment]);
    });

    it("ACCEPTS a claim, a release and a shadow row for the job's own tenant's appointment, a cancelled one included", async () => {
      const out = await attempt("authenticated", jobClaims(tenant), async (tx) => {
        const cancelled = { appointment_id: cancelledAppointment, starts_at: "2027-02-03T10:00:00Z", due_at: "2027-02-02T10:00:00Z" };
        const made = (await tx`insert into reminder_claims ${tx(claimRow(cancelled))} returning id`) as { id: string }[];
        await tx`insert into reminder_claims ${tx(releaseRow(made[0]!.id, { appointment_id: cancelledAppointment }))}`;
        await tx`insert into reminder_claims ${tx(shadowRow(cancelled))}`;
        await tx`insert into reminder_claims ${tx(claimRow())}`;
      });
      expect(out).toBeNull();
    });

    it("is REFUSED a row with its OWN tenant that names ANOTHER tenant's appointment, of every kind", async () => {
      // The first draft accepted this: the tenant on the row was the session's
      // and the appointment existed, and nothing tied the two.
      const theirs = { appointment_id: otherAppointment };
      for (const [kind, row] of [
        ["claim", claimRow(theirs)],
        ["release", releaseRow(otherTenantClaim, theirs)],
        ["shadow", shadowRow(theirs)],
      ] as const) {
        expect(
          await attempt("authenticated", jobClaims(tenant), (tx) => tx`insert into reminder_claims ${tx(row)}`),
          kind,
        ).toMatch(/row-level security/);
      }
      // The control: the same three rows, with the appointment the job's own, are accepted in the arm above.
    });

    it("is REFUSED an appointment that does not exist by the SAME error: the insert no longer says whether an id exists", async () => {
      const nowhere = await attempt("authenticated", jobClaims(tenant), (tx) =>
        tx`insert into reminder_claims ${tx(claimRow({ appointment_id: randomUUID() }))}`,
      );
      const elsewhere = await attempt("authenticated", jobClaims(tenant), (tx) =>
        tx`insert into reminder_claims ${tx(claimRow({ appointment_id: otherAppointment }))}`,
      );
      expect(nowhere).toMatch(/row-level security/);
      expect(nowhere).toBe(elsewhere);
    });

    it("the other tenant's job claims its own appointment and is REFUSED this tenant's", async () => {
      const theirRow = (appointmentId: string) => claimRow({ tenant_id: otherTenant, appointment_id: appointmentId });
      expect(
        await attempt("authenticated", jobClaims(otherTenant), (tx) =>
          tx`insert into reminder_claims ${tx(theirRow(otherAppointment))}`,
        ),
      ).toBeNull();
      expect(
        await attempt("authenticated", jobClaims(otherTenant), (tx) =>
          tx`insert into reminder_claims ${tx(theirRow(appointment))}`,
        ),
      ).toMatch(/row-level security/);
    });
  });

  describe("W-5: service_role holds nothing, and the reminder job's write path does not notice", () => {
    const STATEMENTS = [
      "select 1 from reminder_claims limit 1",
      `update reminder_claims set pass_id = 'x' where id = '${seededClaim}'`,
      `delete from reminder_claims where id = '${seededClaim}'`,
      "truncate reminder_claims",
      "select 1 from reminder_sweep_passes limit 1",
      "update reminder_sweep_passes set pass_id = 'x'",
      "delete from reminder_sweep_passes",
      "truncate reminder_sweep_passes",
    ];

    it("service_role is REFUSED every read, insert, update, delete and truncate on both tables", async () => {
      // service_role bypasses row level security, so the table privilege is the
      // only gate it meets. The control is the ledger, which it still reads.
      const refused = async (fn: (tx: TransactionSql) => Promise<unknown>): Promise<string | null> => {
        try {
          await asRole(sql, "service_role", null, fn);
          return null;
        } catch (e) {
          return String((e as { message?: string }).message ?? e);
        }
      };
      for (const statement of STATEMENTS) {
        // `statement` is a literal of this file and the id is a uuid this file made.
        expect(await refused((tx) => tx.unsafe(statement)), statement).toMatch(/permission denied/);
      }
      expect(await refused((tx) => tx`insert into reminder_claims ${tx(claimRow())}`)).toMatch(/permission denied/);
      expect(await refused((tx) => tx`insert into reminder_sweep_passes ${tx(passRow())}`)).toMatch(
        /permission denied/,
      );
      expect(await refused((tx) => tx`select 1 from reminder_dispatches limit 1`)).toBeNull();
    });

    it("THE JOB'S WRITE PATH STILL SUCCEEDS: the real tenant context and the real Drizzle tables, with service_role holding nothing", async () => {
      // withTenantContext is the seam withReminderTenantContext calls with
      // exactly these claims (apps/web/lib/reminders/context.ts). The rows are
      // written through the Drizzle tables the application will use, which
      // also shows that the generated column claim_kind is never sent.
      class Undo {
        constructor(readonly value: Record<string, unknown>) {}
      }
      const out = await (async () => {
        try {
          await withTenantContext({ tenant_id: tenant, user_role: "admin" }, async (tx) => {
            const [held] = (await tx.execute(
              drizzleSql`select has_table_privilege('service_role', 'public.reminder_claims', 'SELECT')
                      or has_table_privilege('service_role', 'public.reminder_claims', 'INSERT')
                      or has_table_privilege('service_role', 'public.reminder_sweep_passes', 'SELECT')
                      or has_table_privilege('service_role', 'public.reminder_sweep_passes', 'INSERT') as held`,
            )) as unknown as { held: boolean }[];
            const [claim] = await tx
              .insert(reminderClaims)
              .values({
                tenantId: tenant,
                appointmentId: appointment,
                kind: "claim",
                offsetId: "24h",
                channel: "sms",
                startsAt: new Date(START),
                dueAt: new Date(DUE_24H),
                taker: "run",
                early: false,
              })
              .returning({ id: reminderClaims.id, claimKind: reminderClaims.claimKind });
            const [release] = await tx
              .insert(reminderClaims)
              .values({
                tenantId: tenant,
                appointmentId: appointment,
                kind: "release",
                offsetId: "24h",
                channel: "sms",
                claimId: claim!.id,
              })
              .returning({ claimKind: reminderClaims.claimKind });
            const [shadow] = await tx
              .insert(reminderClaims)
              .values({
                tenantId: tenant,
                appointmentId: appointment,
                kind: "shadow",
                offsetId: "24h",
                channel: "sms",
                startsAt: new Date(START),
                dueAt: new Date(DUE_24H),
                minutesAfterMark: 7,
                savedAfterMark: false,
                passId: "pass-test-seam",
              })
              .returning({ kind: reminderClaims.kind });
            const [pass] = await tx
              .insert(reminderSweepPasses)
              .values({
                tenantId: tenant,
                passId: "pass-test-seam",
                mode: "shadow",
                passAt: new Date("2027-01-31T10:15:00Z"),
                dueCount: 1,
                recordedCount: 1,
                overCeiling: false,
                excludedCount: 0,
              })
              .returning({ mode: reminderSweepPasses.mode });
            throw new Undo({
              serviceRoleHoldsAnything: held!.held,
              claimKindOnClaim: claim!.claimKind,
              claimKindOnRelease: release!.claimKind,
              shadow: shadow!.kind,
              pass: pass!.mode,
            });
          });
          throw new Error("unreachable: transaction committed without rollback");
        } catch (err) {
          if (err instanceof Undo) return err.value;
          throw err;
        }
      })();
      expect(out).toEqual({
        serviceRoleHoldsAnything: false,
        claimKindOnClaim: null,
        claimKindOnRelease: "claim",
        shadow: "shadow",
        pass: "shadow",
      });
    });
  });

  describe("a staff session reads its own tenant and writes nothing", () => {
    it("owner, admin and reception read the claims and the heartbeats; a therapist reads none", async () => {
      for (const role of ["owner", "admin", "reception"] as const) {
        expect(await seen("reminder_claims", claimsFor(tenant, role, staffUser)), role).toBe(3);
        expect(await seen("reminder_sweep_passes", claimsFor(tenant, role, staffUser)), role).toBe(1);
      }
      expect(await seen("reminder_claims", claimsFor(tenant, "therapist", therapist))).toBe(0);
      expect(await seen("reminder_sweep_passes", claimsFor(tenant, "therapist", therapist))).toBe(0);
    });

    it("another tenant's admin sees only its own rows: one claim, one heartbeat, never this tenant's", async () => {
      const out = await asRole(sql, "authenticated", claimsFor(otherTenant, "admin", otherTherapist), async (tx) => {
        const claims = (await tx`select tenant_id from reminder_claims`) as { tenant_id: string }[];
        const passes = (await tx`select tenant_id from reminder_sweep_passes`) as { tenant_id: string }[];
        return { claims: claims.map((r) => r.tenant_id), passes: passes.map((r) => r.tenant_id) };
      });
      expect(out).toEqual({ claims: [otherTenant], passes: [otherTenant] });
    });

    it.each(STAFF)("a %s with a user is REFUSED an insert on both tables", async (role) => {
      // The privilege is there (the job shares the role `authenticated`), so
      // what refuses is the policy: a session that names its user is not the job.
      const claims = claimsFor(tenant, role, staffUser);
      expect(
        await attempt("authenticated", claims, (tx) => tx`insert into reminder_claims ${tx(claimRow())}`),
      ).toMatch(/row-level security/);
      expect(
        await attempt("authenticated", claims, (tx) => tx`insert into reminder_claims ${tx(releaseRow(seededClaim))}`),
      ).toMatch(/row-level security/);
      expect(
        await attempt("authenticated", claims, (tx) => tx`insert into reminder_sweep_passes ${tx(passRow())}`),
      ).toMatch(/row-level security/);
    });

    it.each(STAFF)("a %s is REFUSED every update, delete and truncate, on both tables", async (role) => {
      const claims = claimsFor(tenant, role, staffUser);
      for (const statement of [
        `update reminder_claims set taker = 'sweep' where id = '${seededClaim}'`,
        `delete from reminder_claims where id = '${seededClaim}'`,
        "truncate reminder_claims",
        "update reminder_sweep_passes set due_count = 0",
        "delete from reminder_sweep_passes",
        "truncate reminder_sweep_passes",
      ]) {
        // `statement` is a literal of this file and the id is a uuid this file made.
        expect(await attempt("authenticated", claims, (tx) => tx.unsafe(statement)), statement).toMatch(
          /permission denied/,
        );
      }
    });
  });

  describe("append only: no application role rewrites or removes a row", () => {
    it("the reminder job itself is REFUSED every update, delete and truncate", async () => {
      for (const statement of [
        `update reminder_claims set taker = 'sweep' where id = '${seededClaim}'`,
        `delete from reminder_claims where id = '${seededClaim}'`,
        "truncate reminder_claims",
        "update reminder_sweep_passes set due_count = 0",
        "delete from reminder_sweep_passes",
        "truncate reminder_sweep_passes",
      ]) {
        expect(await attempt("authenticated", jobClaims(tenant), (tx) => tx.unsafe(statement)), statement).toMatch(
          /permission denied/,
        );
      }
    });

    it("THE POLICIES REFUSE IT TOO: with UPDATE and DELETE granted for the length of one transaction, no row is reached", async () => {
      // The second layer, proven apart from the first. The owner connection
      // grants what the migration withholds, inside a transaction that is
      // rolled back; the job and the tenant's owner then reach zero rows,
      // because no UPDATE and no DELETE policy exists.
      const out = await (async () => {
        try {
          await sql.begin(async (tx) => {
            await tx`grant update, delete on reminder_claims, reminder_sweep_passes to authenticated`;
            const results: Record<string, number> = {};
            for (const [who, claims] of [
              ["job", jobClaims(tenant)],
              ["owner", claimsFor(tenant, "owner", staffUser)],
            ] as const) {
              await tx.unsafe("set local role authenticated");
              await tx`select set_config('request.jwt.claims', ${claims}, true)`;
              // Control first: the same session SEES rows, so zero below is the policy and not an empty table.
              results[`${who} sees`] = ((await tx`select count(*)::int as n from reminder_claims`) as { n: number }[])[0]!.n;
              results[`${who} updates claims`] = (await tx`update reminder_claims set pass_id = 'x' returning id`).length;
              results[`${who} deletes claims`] = (await tx`delete from reminder_claims returning id`).length;
              results[`${who} updates passes`] = (await tx`update reminder_sweep_passes set pass_id = 'x' returning id`).length;
              results[`${who} deletes passes`] = (await tx`delete from reminder_sweep_passes returning id`).length;
              await tx.unsafe("reset role");
            }
            throw new Rollback(results);
          });
          throw new Error("unreachable: transaction committed without rollback");
        } catch (err) {
          if (err instanceof Rollback) return err.value as Record<string, number>;
          throw err;
        }
      })();
      expect(out).toEqual({
        "job sees": 3,
        "job updates claims": 0,
        "job deletes claims": 0,
        "job updates passes": 0,
        "job deletes passes": 0,
        "owner sees": 3,
        "owner updates claims": 0,
        "owner deletes claims": 0,
        "owner updates passes": 0,
        "owner deletes passes": 0,
      });
      // And the grant did not outlive its transaction.
      const [after] = (await sql`
        select has_table_privilege('authenticated', 'public.reminder_claims', 'UPDATE') as upd,
               has_table_privilege('authenticated', 'public.reminder_claims', 'DELETE') as del`) as {
        upd: boolean;
        del: boolean;
      }[];
      expect(after).toEqual({ upd: false, del: false });
    });
  });

  describe("anon and a patient session get nothing", () => {
    it("anon is REFUSED a read and a write on both tables", async () => {
      for (const table of ["reminder_claims", "reminder_sweep_passes"] as const) {
        expect(await attempt("anon", null, (tx) => tx`select 1 from ${tx(table)} limit 1`), table).toMatch(
          /permission denied/,
        );
        expect(
          await attempt("anon", JSON.stringify({ tenant_id: tenant, user_role: "admin" }), (tx) =>
            table === "reminder_claims"
              ? tx`insert into reminder_claims ${tx(claimRow())}`
              : tx`insert into reminder_sweep_passes ${tx(passRow())}`,
          ),
          table,
        ).toMatch(/permission denied/);
      }
    });

    it("a patient session is REFUSED a read and a write on both tables", async () => {
      const claims = patientClaims(tenant, patient);
      for (const table of ["reminder_claims", "reminder_sweep_passes"] as const) {
        expect(await attempt("patient", claims, (tx) => tx`select 1 from ${tx(table)} limit 1`), table).toMatch(
          /permission denied/,
        );
      }
      expect(
        await attempt("patient", claims, (tx) => tx`insert into reminder_claims ${tx(claimRow())}`),
      ).toMatch(/permission denied/);
    });
  });

  describe("a row cannot carry a field that means nothing for its kind", () => {
    it("ACCEPTS a second claim for the same reminder and the same start: nothing here makes 'held' final (7b)", async () => {
      expect(await ownerInsert("reminder_claims", claimRow())).toBeNull();
      expect(await ownerInsert("reminder_claims", claimRow({ taker: "sweep" }))).toBeNull();
    });

    it("ACCEPTS a claim for an offset with no known due time: no due_at and no early, together", async () => {
      expect(await ownerInsert("reminder_claims", claimRow({ offset_id: "72h", due_at: null, early: null }))).toBeNull();
    });

    it("REFUSES a claim with a due time and no early flag, and the reverse", async () => {
      expect(await ownerInsert("reminder_claims", claimRow({ early: null }))).toMatch(/early_matches_kind/);
      expect(await ownerInsert("reminder_claims", claimRow({ due_at: null }))).toMatch(/early_matches_kind/);
    });

    it("REFUSES a claim with no start, no taker, or a claim_id, minutes or a saved flag", async () => {
      expect(await ownerInsert("reminder_claims", claimRow({ starts_at: null, due_at: null, early: null }))).toMatch(
        /start_matches_kind/,
      );
      expect(await ownerInsert("reminder_claims", claimRow({ taker: null }))).toMatch(/taker_matches_kind/);
      expect(await ownerInsert("reminder_claims", claimRow({ claim_id: seededClaim }))).toMatch(/claim_matches_kind/);
      expect(await ownerInsert("reminder_claims", claimRow({ minutes_after_mark: 1 }))).toMatch(/minutes_match_kind/);
      expect(await ownerInsert("reminder_claims", claimRow({ saved_after_mark: true }))).toMatch(/saved_matches_kind/);
    });

    it("REFUSES a due time after the start", async () => {
      expect(await ownerInsert("reminder_claims", claimRow({ due_at: "2027-02-01T10:00:01Z" }))).toMatch(
        /due_not_after_start/,
      );
    });

    it("REFUSES a release with no claim, with a start, a due time, a taker or an early flag", async () => {
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { claim_id: null }))).toMatch(
        /claim_matches_kind/,
      );
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { starts_at: START }))).toMatch(
        /start_matches_kind/,
      );
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { due_at: DUE_24H }))).toMatch(
        /due_matches_kind/,
      );
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { taker: "run" }))).toMatch(
        /taker_matches_kind/,
      );
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { early: false }))).toMatch(
        /early_matches_kind/,
      );
    });

    it("REFUSES a release that names itself, a row of another appointment, or a row of another tenant", async () => {
      const self = randomUUID();
      expect(await ownerInsert("reminder_claims", releaseRow(self, { id: self }))).toMatch(
        /release_names_another_row/,
      );
      // seededClaim2 is a claim of appointment2; this release says appointment.
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim2))).toMatch(/reminder_claims_claim_fkey/);
      expect(await ownerInsert("reminder_claims", releaseRow(otherTenantClaim))).toMatch(/reminder_claims_claim_fkey/);
      expect(await ownerInsert("reminder_claims", releaseRow(randomUUID()))).toMatch(/reminder_claims_claim_fkey/);
    });

    it("REFUSES a release whose offset or channel is not its claim's, and ACCEPTS the one that matches", async () => {
      // seededClaim is 24h by sms, of `appointment`. Each refused row differs from it in ONE field.
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { offset_id: "48h" }))).toMatch(
        /reminder_claims_claim_fkey/,
      );
      expect(await ownerInsert("reminder_claims", releaseRow(seededClaim, { channel: "email" }))).toMatch(
        /reminder_claims_claim_fkey/,
      );
      // The control, on a claim of its own so that one-release-per-claim is not what answers.
      const claim = randomUUID();
      expect(await ownerInsert("reminder_claims", claimRow({ id: claim, offset_id: "48h", channel: "email" }))).toBeNull();
      expect(await ownerInsert("reminder_claims", releaseRow(claim, { offset_id: "48h", channel: "email" }))).toBeNull();
    });

    it("REFUSES a release that names a SHADOW row or ANOTHER RELEASE: the row named is of kind claim", async () => {
      const shadow = randomUUID();
      const claim = randomUUID();
      const release = randomUUID();
      expect(await ownerInsert("reminder_claims", shadowRow({ id: shadow }))).toBeNull();
      expect(await ownerInsert("reminder_claims", claimRow({ id: claim }))).toBeNull();
      expect(await ownerInsert("reminder_claims", releaseRow(claim, { id: release }))).toBeNull();
      // Same tenant, appointment, offset and channel as the row named: only the kind is wrong.
      expect(await ownerInsert("reminder_claims", releaseRow(shadow))).toMatch(/reminder_claims_claim_fkey/);
      expect(await ownerInsert("reminder_claims", releaseRow(release))).toMatch(/reminder_claims_claim_fkey/);
    });

    it("REFUSES a value written into claim_kind: the database alone derives it", async () => {
      expect(await ownerInsert("reminder_claims", claimRow({ claim_kind: "claim" }))).toMatch(
        /non-DEFAULT value into column "claim_kind"/,
      );
    });

    it("ACCEPTS one release per claim and REFUSES a second", async () => {
      const claim = randomUUID();
      expect(await ownerInsert("reminder_claims", claimRow({ id: claim }))).toBeNull();
      expect(await ownerInsert("reminder_claims", releaseRow(claim))).toBeNull();
      expect(await ownerInsert("reminder_claims", releaseRow(claim))).toMatch(/reminder_claims_release_claim_key/);
    });

    it("REFUSES a shadow row with no due time, no minutes, no saved flag, or with a taker or an early flag", async () => {
      expect(await ownerInsert("reminder_claims", shadowRow({ due_at: null }))).toMatch(/due_matches_kind/);
      expect(await ownerInsert("reminder_claims", shadowRow({ minutes_after_mark: null }))).toMatch(
        /minutes_match_kind/,
      );
      expect(await ownerInsert("reminder_claims", shadowRow({ saved_after_mark: null }))).toMatch(
        /saved_matches_kind/,
      );
      expect(await ownerInsert("reminder_claims", shadowRow({ taker: "sweep" }))).toMatch(/taker_matches_kind/);
      expect(await ownerInsert("reminder_claims", shadowRow({ early: false }))).toMatch(/early_matches_kind/);
    });

    it("ACCEPTS a shadow row taken BEFORE its due time: the last pass of the day looks ahead", async () => {
      expect(await ownerInsert("reminder_claims", shadowRow({ minutes_after_mark: -75 }))).toBeNull();
    });

    it("REFUSES a kind, a channel or a taker outside its list, and a blank offset or pass id", async () => {
      // A row that breaks no other rule, so the list alone refuses it: no field of any kind is set.
      expect(
        await ownerInsert(
          "reminder_claims",
          claimRow({ kind: "sent", starts_at: null, due_at: null, taker: null, early: null }),
        ),
      ).toMatch(/kind_check/);
      expect(await ownerInsert("reminder_claims", claimRow({ channel: "whatsapp" }))).toMatch(/channel_check/);
      expect(await ownerInsert("reminder_claims", claimRow({ taker: "staff" }))).toMatch(/taker_check/);
      expect(await ownerInsert("reminder_claims", claimRow({ offset_id: "  " }))).toMatch(/offset_id_not_blank/);
      expect(await ownerInsert("reminder_claims", shadowRow({ pass_id: " " }))).toMatch(/pass_id_not_blank/);
    });

    it("REFUSES a claim for an appointment that does not exist", async () => {
      expect(await ownerInsert("reminder_claims", claimRow({ appointment_id: randomUUID() }))).toMatch(
        /reminder_claims_appointment_id_fkey/,
      );
    });
  });

  describe("the heartbeat's own constraints", () => {
    it("ACCEPTS two heartbeats of one tenant for one pass id: a pass run again is a second fact", async () => {
      expect(await ownerInsert("reminder_sweep_passes", passRow({ pass_id: "pass-test-dup" }))).toBeNull();
      expect(await ownerInsert("reminder_sweep_passes", passRow({ pass_id: "pass-test-dup" }))).toBeNull();
    });

    it("ACCEPTS a heartbeat with no pass id and with a look-ahead instant", async () => {
      expect(
        await ownerInsert("reminder_sweep_passes", passRow({ pass_id: null, look_ahead_before: "2027-01-31T23:00:00Z" })),
      ).toBeNull();
    });

    it("REFUSES a negative count, more recorded than due, a mode outside its list, and a tenant that does not exist", async () => {
      expect(await ownerInsert("reminder_sweep_passes", passRow({ due_count: -1, recorded_count: 0 }))).toMatch(
        /due_count_sane/,
      );
      expect(await ownerInsert("reminder_sweep_passes", passRow({ recorded_count: -1 }))).toMatch(/recorded_count_sane/);
      expect(await ownerInsert("reminder_sweep_passes", passRow({ excluded_count: -1 }))).toMatch(/excluded_count_sane/);
      expect(await ownerInsert("reminder_sweep_passes", passRow({ due_count: 2, recorded_count: 3 }))).toMatch(
        /recorded_within_due/,
      );
      expect(await ownerInsert("reminder_sweep_passes", passRow({ mode: "live" }))).toMatch(/mode_check/);
      expect(await ownerInsert("reminder_sweep_passes", passRow({ tenant_id: randomUUID() }))).toMatch(
        /reminder_sweep_passes_tenant_id_fkey/,
      );
    });
  });

  describe("what a delete does", () => {
    it("an appointment's hard delete, by a staff session that may not delete a claim, takes its claims, releases and shadow rows with it", async () => {
      // The owner of the tenant may delete an appointment (the appointments
      // policy) and holds no DELETE here. The cascade runs as the table's owner.
      const out = await (async () => {
        try {
          await sql.begin(async (tx) => {
            const claim = randomUUID();
            await tx`insert into reminder_claims ${tx(claimRow({ id: claim, appointment_id: appointment2, starts_at: "2027-02-02T10:00:00Z", due_at: "2027-02-01T10:00:00Z" }))}`;
            await tx`insert into reminder_claims ${tx(releaseRow(claim, { appointment_id: appointment2 }))}`;
            await tx`insert into reminder_claims ${tx(shadowRow({ appointment_id: appointment2, starts_at: "2027-02-02T10:00:00Z", due_at: "2027-02-01T10:00:00Z" }))}`;
            const before = ((await tx`select count(*)::int as n from reminder_claims where appointment_id = ${appointment2}`) as { n: number }[])[0]!.n;
            const passesBefore = ((await tx`select count(*)::int as n from reminder_sweep_passes where tenant_id = ${tenant}`) as { n: number }[])[0]!.n;

            await tx.unsafe("set local role authenticated");
            await tx`select set_config('request.jwt.claims', ${claimsFor(tenant, "owner", staffUser)}, true)`;
            const deleted = (await tx`delete from appointments where id = ${appointment2} returning id`).length;
            await tx.unsafe("reset role");

            // Read back on the owner connection: gone, not merely hidden.
            const after = ((await tx`select count(*)::int as n from reminder_claims where appointment_id = ${appointment2}`) as { n: number }[])[0]!.n;
            const others = ((await tx`select count(*)::int as n from reminder_claims where appointment_id = ${appointment}`) as { n: number }[])[0]!.n;
            const passesAfter = ((await tx`select count(*)::int as n from reminder_sweep_passes where tenant_id = ${tenant}`) as { n: number }[])[0]!.n;
            throw new Rollback({ before, deleted, after, othersLeft: others > 0, passesKept: passesAfter === passesBefore && passesAfter > 0 });
          });
          throw new Error("unreachable: transaction committed without rollback");
        } catch (err) {
          if (err instanceof Rollback) return err.value;
          throw err;
        }
      })();
      // Four before: the seeded claim of appointment2, and the three written above.
      expect(out).toEqual({ before: 4, deleted: 1, after: 0, othersLeft: true, passesKept: true });
    });

    it("a tenant that has a claim or a heartbeat cannot be deleted from under them", async () => {
      // NO ACTION to tenants, as everywhere. Asked on a rolled-back transaction.
      const error = await (async () => {
        try {
          await sql.begin(async (tx) => {
            await tx`delete from appointments where tenant_id = ${otherTenant}`;
            await tx`delete from patients where tenant_id = ${otherTenant}`;
            await tx`delete from users where tenant_id = ${otherTenant}`;
            await tx`delete from locations where tenant_id = ${otherTenant}`;
            await tx`delete from tenants where id = ${otherTenant}`;
            throw new Rollback(null);
          });
          return null;
        } catch (err) {
          if (err instanceof Rollback) return null;
          return String((err as { message?: string }).message ?? err);
        }
      })();
      // The claim went with its appointment; the heartbeat is what still names the tenant.
      expect(error).toMatch(/reminder_sweep_passes_tenant_id_fkey/);
    });
  });

  describe("the catalogue, as the cross-check", () => {
    it("authenticated holds exactly SELECT and INSERT; anon, patient, service_role and PUBLIC hold nothing", async () => {
      const rows = (await sql`
        select c.relname::text as rel, r.rolname::text as role,
               coalesce(string_agg(v.verb, ',' order by v.verb) filter (where has_table_privilege(r.oid, c.oid, v.verb)), '') as held
          from pg_class c
          cross join (select oid, rolname from pg_roles where rolname in ('authenticated', 'anon', 'patient', 'service_role')) r
          cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) v(verb)
         where c.oid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)
         group by 1, 2 order by 1, 2`) as { rel: string; role: string; held: string }[];
      expect(rows.map((r) => `${r.rel} ${r.role} [${r.held}]`)).toEqual([
        "reminder_claims anon []",
        "reminder_claims authenticated [INSERT,SELECT]",
        "reminder_claims patient []",
        "reminder_claims service_role []",
        "reminder_sweep_passes anon []",
        "reminder_sweep_passes authenticated [INSERT,SELECT]",
        "reminder_sweep_passes patient []",
        "reminder_sweep_passes service_role []",
      ]);
      const [pub] = (await sql`
        select count(*)::int as n
          from pg_class c cross join lateral aclexplode(c.relacl) a
         where c.oid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)
           and a.grantee = 0`) as { n: number }[];
      expect(pub!.n).toBe(0);
    });

    it("THE WHOLE GRANTEE LIST of each table is the owner and authenticated, and nobody else", async () => {
      // Not "these named roles hold nothing" but "nobody we did not name holds
      // anything": every entry of the ACL, PUBLIC included.
      const rows = (await sql`
        select c.relname::text as rel,
               case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end as grantee,
               string_agg(a.privilege_type, ',' order by a.privilege_type) as held
          from pg_class c
          cross join lateral aclexplode(coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
         where c.oid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)
         group by 1, 2 order by 1, 2`) as { rel: string; grantee: string; held: string }[];
      const ALL = "DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE";
      expect(rows.map((r) => `${r.rel} ${r.grantee} [${r.held}]`)).toEqual([
        "reminder_claims authenticated [INSERT,SELECT]",
        `reminder_claims postgres [${ALL}]`,
        "reminder_sweep_passes authenticated [INSERT,SELECT]",
        `reminder_sweep_passes postgres [${ALL}]`,
      ]);
    });

    it("RLS is on, and each table has one SELECT and one INSERT policy and no other", async () => {
      const rows = (await sql`
        select c.relname::text as rel, c.relrowsecurity as rls,
               (select coalesce(string_agg(p.polcmd::text || ':' ||
                         array_to_string(array(select pg_get_userbyid(r) from unnest(p.polroles) r order by 1), '+'),
                         ',' order by p.polcmd::text), 'none')
                  from pg_policy p where p.polrelid = c.oid) as policies
          from pg_class c
         where c.oid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)
         order by 1`) as { rel: string; rls: boolean; policies: string }[];
      expect(rows).toEqual([
        { rel: "reminder_claims", rls: true, policies: "a:authenticated,r:authenticated" },
        { rel: "reminder_sweep_passes", rls: true, policies: "a:authenticated,r:authenticated" },
      ]);
    });

    it("neither table owns a sequence, carries a trigger of its own, or names a patient or a recipient", async () => {
      const [seq] = (await sql`
        select count(*)::int as n
          from pg_depend dep join pg_class s on s.oid = dep.objid and s.relkind = 'S'
         where dep.refobjid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)`) as {
        n: number;
      }[];
      const [trg] = (await sql`
        select count(*)::int as n from pg_trigger
         where tgrelid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)
           and not tgisinternal`) as { n: number }[];
      const cols = (await sql`
        select attname::text as name from pg_attribute
         where attrelid in ('public.reminder_claims'::regclass, 'public.reminder_sweep_passes'::regclass)
           and attnum > 0 and not attisdropped`) as { name: string }[];
      expect(seq!.n).toBe(0);
      expect(trg!.n).toBe(0);
      expect(cols.length).toBe(27);
      expect(cols.map((c) => c.name).filter((n) => /patient|phone|email|recipient|name/.test(n))).toEqual([]);
    });
  });
});
