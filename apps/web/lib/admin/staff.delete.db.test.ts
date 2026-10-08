/**
 * staff.delete.db.test.ts: DEL-02. `deleteStaffMember` NAMES THE DATABASE'S
 * FOREIGN-KEY REFUSAL, AGAINST REAL ROWS AND A REAL DRIVER.
 *
 * The unit suite beside this one hands the action an error it built itself. Two
 * things only a database can say:
 *
 *   1. WHERE THE DRIVER PUTS THE SQLSTATE. The first arm runs the action's
 *      deletes by themselves, as the staff principal, and reads the error:
 *      Drizzle's outer error carries no `code`, and the driver error at
 *      `.cause` carries 23503 and the name of the constraint.
 *   2. WHAT THE ACTION ANSWERS. The real entry point, as the owner, on a staff
 *      member who registered a patient: `has_activity`, and nothing is deleted,
 *      the absence the action removes first included.
 *
 * THE REFERENCE IS A PATIENT THE STAFF MEMBER REGISTERED, ON PURPOSE. The
 * action's counts read other columns, so they pass and the refusal is the
 * database's.
 *
 * NOTHING IS STUBBED BUT `server-only`. The password gate, the location scope,
 * `runScoped`, RLS, every count, every delete and the audit insert are real.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { eq, sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("DEL-02: deleteStaffMember names the database's foreign-key refusal", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let schema: typeof import("@osteojp/db");
  let deleteStaffMember: typeof import("./staff").deleteStaffMember;
  let isForeignKeyViolation: typeof import("./foreign-key-refusal").isForeignKeyViolation;
  let password: string;

  const tenant = randomUUID();
  const ownerRole = randomUUID();
  const therapistRole = randomUUID();
  const owner = randomUUID();
  /** Registered one patient. */
  const referenced = randomUUID();
  /** Nothing references this one but its own absence. */
  const clean = randomUUID();
  const patient = randomUUID();

  const actor: RequestContext = { tenantId: tenant, role: "owner", userId: owner };

  /** Every read-back below is on the admin connection, so RLS hides nothing from it. */
  const countOf = async (query: ReturnType<typeof raw>): Promise<number> => {
    const rows = (await db.execute(query)) as unknown as { n: number }[];
    return Number(rows[0]!.n);
  };
  const userRows = (id: string) =>
    countOf(raw`select count(*)::int as n from users where id = ${id}::uuid`);
  const absenceRows = (id: string) =>
    countOf(raw`select count(*)::int as n from time_off where user_id = ${id}::uuid`);
  const auditRows = (id: string) =>
    countOf(
      raw`select count(*)::int as n from audit_log
           where tenant_id = ${tenant}::uuid and action = 'staff.delete'
             and entity_id = ${id}::uuid`,
    );

  beforeAll(async () => {
    schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ deleteStaffMember } = await import("./staff"));
    ({ isForeignKeyViolation } = await import("./foreign-key-refusal"));
    // The house default: a tenant with no stored hash is checked against it.
    password = (await import("./appointment-delete-password")).DEFAULT_DELETE_PASSWORD;

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'del02 staff', ${"del02s-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into roles (id, tenant_id, slug, name)
          values (${ownerRole}::uuid, ${tenant}::uuid, 'owner', 'Owner'),
                 (${therapistRole}::uuid, ${tenant}::uuid, 'therapist', 'Therapist')`,
    );
    for (const [id, role, label] of [
      [owner, ownerRole, "owner"],
      [referenced, therapistRole, "referido"],
      [clean, therapistRole, "livre"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, role_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${role}::uuid,
                    ${`${label}-${id.slice(0, 8)}@del02.test`}, ${`${label} DEL02`})`,
      );
    }
    for (const id of [referenced, clean]) {
      await db.execute(
        raw`insert into time_off (tenant_id, user_id, starts_at, ends_at, reason)
            values (${tenant}::uuid, ${id}::uuid, now() + interval '30 days',
                    now() + interval '31 days', 'vacation')`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Registado DEL02', ${referenced}::uuid)`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from time_off where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from roles where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id = ${tenant}::uuid`,
    ];
    let first: unknown = null;
    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err) {
        first ??= err;
      }
    }
    if (first) throw first;
  });

  it("the action's deletes alone are refused with 23503, and the driver puts it at `.cause`", async () => {
    let caught: unknown = null;
    try {
      await schema.withTenantContext(
        { tenant_id: tenant, user_role: "owner", sub: owner },
        async (tx) => {
          await tx.delete(schema.timeOff).where(eq(schema.timeOff.userId, referenced));
          await tx.delete(schema.users).where(eq(schema.users.id, referenced));
        },
      );
    } catch (err) {
      caught = err;
    }
    const outer = caught as { code?: unknown; cause?: { code?: unknown; constraint_name?: unknown } };
    expect(outer, "the DELETE was not refused").not.toBeNull();
    expect(outer.code).toBeUndefined();
    expect(outer.cause?.code).toBe("23503");
    expect(outer.cause?.constraint_name).toBe("patients_created_by_users_id_fk");
    expect(isForeignKeyViolation(caught)).toBe(true);
    expect(await userRows(referenced)).toBe(1);
    expect(await absenceRows(referenced)).toBe(1);
  });

  it("a staff member who registered a patient is refused as has_activity, and nothing is deleted", async () => {
    await expect(deleteStaffMember(actor, referenced, password)).rejects.toMatchObject({
      name: "AdminError",
      code: "has_activity",
    });

    expect(await userRows(referenced)).toBe(1);
    // The absence is deleted before the user: the refusal took it back.
    expect(await absenceRows(referenced)).toBe(1);
    expect(
      await countOf(raw`select count(*)::int as n from patients where id = ${patient}::uuid`),
    ).toBe(1);
    expect(await auditRows(referenced)).toBe(0);
  });

  it("CONTROL: a staff member nothing references is deleted, with the audit row", async () => {
    await deleteStaffMember(actor, clean, password);
    expect(await userRows(clean)).toBe(0);
    expect(await absenceRows(clean)).toBe(0);
    expect(await auditRows(clean)).toBe(1);
  });

  it("CONTROL: with the patient gone, the same staff member is deleted", async () => {
    await db.execute(raw`delete from patients where id = ${patient}::uuid`);
    await deleteStaffMember(actor, referenced, password);
    expect(await userRows(referenced)).toBe(0);
  });
});
