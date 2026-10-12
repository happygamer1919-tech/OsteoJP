/**
 * actions.hard-delete.db.test.ts: DEL-02. `hardDeletePatient` NAMES THE
 * DATABASE'S FOREIGN-KEY REFUSAL, AGAINST REAL ROWS AND A REAL DRIVER.
 *
 * The unit suite beside this one hands the action an error it built itself. Two
 * things only a database can say:
 *
 *   1. WHERE THE DRIVER PUTS THE SQLSTATE. The first arm runs the action's two
 *      deletes by themselves, as the staff principal, and reads the error:
 *      Drizzle's outer error carries no `code`, and the driver error at
 *      `.cause` carries 23503 and the name of the constraint.
 *   2. WHAT THE ACTION ANSWERS. The real entry point, as the owner, on a patient
 *      a follow-up contact still references: `has_references`, and nothing is
 *      deleted, the clinic link the action removes first included.
 *
 * THE REFERENCE IS A FOLLOW-UP CONTACT. The second arm provokes the database's
 * own refusal with that referencing row and reads the named answer back. That
 * the answer is the database's is asserted in the arm: it reads the preflight,
 * which counts the same classes as the action, first.
 *
 * WHAT IS STUBBED, AND NEITHER IS UNDER TEST: `requireRequestContext`, because
 * a vitest worker has no Supabase session, and `next/cache`, which needs a
 * request scope. The password gate, `runScoped`, RLS, every count, every delete
 * and the audit insert are real.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { eq, sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: string; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal - use asOwner()");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("DEL-02: hardDeletePatient names the database's foreign-key refusal", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let schema: typeof import("@osteojp/db");
  let hardDeletePatient: typeof import("./actions").hardDeletePatient;
  let getPatientHardDeleteBlockers: typeof import("./queries").getPatientHardDeleteBlockers;
  let isForeignKeyViolation: typeof import("../admin/foreign-key-refusal").isForeignKeyViolation;
  let password: string;

  const tenant = randomUUID();
  const ownerRole = randomUUID();
  const owner = randomUUID();
  const clinic = randomUUID();
  /** A follow-up contact references this one. */
  const referenced = randomUUID();
  /** Nothing references this one but its clinic link. */
  const clean = randomUUID();
  const contact = randomUUID();

  async function asOwner<T>(fn: () => Promise<T>): Promise<T> {
    acting.ctx = { tenantId: tenant, role: "owner", userId: owner };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }

  /** Every read-back below is on the admin connection, so RLS hides nothing from it. */
  const countOf = async (query: ReturnType<typeof raw>): Promise<number> => {
    const rows = (await db.execute(query)) as unknown as { n: number }[];
    return Number(rows[0]!.n);
  };
  const patientRows = (id: string) =>
    countOf(raw`select count(*)::int as n from patients where id = ${id}::uuid`);
  const linkRows = (id: string) =>
    countOf(raw`select count(*)::int as n from patient_locations where patient_id = ${id}::uuid`);
  const auditRows = (id: string) =>
    countOf(
      raw`select count(*)::int as n from audit_log
           where tenant_id = ${tenant}::uuid and action = 'patient.hard_delete'
             and entity_id = ${id}::uuid`,
    );

  beforeAll(async () => {
    schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ hardDeletePatient } = await import("./actions"));
    ({ getPatientHardDeleteBlockers } = await import("./queries"));
    ({ isForeignKeyViolation } = await import("../admin/foreign-key-refusal"));
    // The house default: a tenant with no stored hash is checked against it.
    password = (await import("../admin/appointment-delete-password")).DEFAULT_DELETE_PASSWORD;

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'del02 patient', ${"del02p-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into roles (id, tenant_id, slug, name)
          values (${ownerRole}::uuid, ${tenant}::uuid, 'owner', 'Owner')`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, role_id, email, full_name)
          values (${owner}::uuid, ${tenant}::uuid, ${ownerRole}::uuid,
                  ${`owner-${owner.slice(0, 8)}@del02.test`}, 'Owner DEL02')`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name)
          values (${clinic}::uuid, ${tenant}::uuid, 'Clinica DEL02')`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name)
          values (${referenced}::uuid, ${tenant}::uuid, 'Paciente Referido DEL02'),
                 (${clean}::uuid, ${tenant}::uuid, 'Paciente Livre DEL02')`,
    );
    for (const id of [referenced, clean]) {
      await db.execute(
        raw`insert into patient_locations (tenant_id, patient_id, location_id)
            values (${tenant}::uuid, ${id}::uuid, ${clinic}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into patient_followup_contacts (id, tenant_id, patient_id, channel, contacted_by)
          values (${contact}::uuid, ${tenant}::uuid, ${referenced}::uuid, 'sms', ${owner}::uuid)`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from patient_followup_contacts where tenant_id = ${tenant}::uuid`,
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from patient_locations where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
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

  it("the action's two deletes alone are refused with 23503, and the driver puts it at `.cause`", async () => {
    let caught: unknown = null;
    try {
      await schema.withTenantContext(
        { tenant_id: tenant, user_role: "owner", sub: owner },
        async (tx) => {
          await tx
            .delete(schema.patientLocations)
            .where(eq(schema.patientLocations.patientId, referenced));
          await tx.delete(schema.patients).where(eq(schema.patients.id, referenced));
        },
      );
    } catch (err) {
      caught = err;
    }
    const outer = caught as { code?: unknown; cause?: { code?: unknown; constraint_name?: unknown } };
    expect(outer, "the DELETE was not refused").not.toBeNull();
    expect(outer.code).toBeUndefined();
    expect(outer.cause?.code).toBe("23503");
    expect(outer.cause?.constraint_name).toBe("patient_followup_contacts_patient_id_fkey");
    expect(isForeignKeyViolation(caught)).toBe(true);
    expect(await patientRows(referenced)).toBe(1);
    expect(await linkRows(referenced)).toBe(1);
  });

  it("a patient a follow-up contact still references is refused as has_references, and nothing is deleted", async () => {
    // The preflight counts the same classes as the action, and reads zero for
    // every one: the refusal below is the database's.
    const blockers = await asOwner(() => getPatientHardDeleteBlockers(referenced));
    expect(blockers.hasClinicalRecords).toBe(false);
    expect(blockers.hasOtherReferences).toBe(false);
    expect(blockers.counts.map((c) => c.count)).toEqual(blockers.counts.map(() => 0));

    const result = await asOwner(() => hardDeletePatient(referenced, password));
    expect(result).toEqual({ ok: false, error: "has_references" });

    expect(await patientRows(referenced)).toBe(1);
    // The clinic link is deleted before the patient: the refusal took it back.
    expect(await linkRows(referenced)).toBe(1);
    expect(
      await countOf(
        raw`select count(*)::int as n from patient_followup_contacts where id = ${contact}::uuid`,
      ),
    ).toBe(1);
    expect(await auditRows(referenced)).toBe(0);
  });

  it("CONTROL: a patient nothing references is deleted, with its audit row", async () => {
    const result = await asOwner(() => hardDeletePatient(clean, password));
    expect(result).toEqual({ ok: true, id: clean });
    expect(await patientRows(clean)).toBe(0);
    expect(await linkRows(clean)).toBe(0);
    expect(await auditRows(clean)).toBe(1);
  });

  it("CONTROL: with the contact gone, the same patient is deleted", async () => {
    await db.execute(raw`delete from patient_followup_contacts where id = ${contact}::uuid`);
    const result = await asOwner(() => hardDeletePatient(referenced, password));
    expect(result).toEqual({ ok: true, id: referenced });
    expect(await patientRows(referenced)).toBe(0);
  });
});
