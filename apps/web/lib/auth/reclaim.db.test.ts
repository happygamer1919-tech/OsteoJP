/**
 * reclaim.db.test.ts — LE-staff-delete-leaves-auth-user, against a REAL
 * Postgres, through the REAL selection function.
 *
 * ==========================================================================
 * WHAT IS REAL HERE AND WHAT IS NOT, STATED RATHER THAN IMPLIED.
 * ==========================================================================
 * REAL: the database, the tenant/role/user/patient rows, the audit rows — which
 * are written through `writeAudit`, THE SAME PRODUCTION HELPER
 * `deleteStaffMember` calls, not hand-shaped inserts of a row somebody imagined
 * — and `findReclaimableStaffAuthId` itself, unmodified.
 *
 * INJECTED: GoTrue. `readAuthUser` is a parameter of the function under test
 * precisely so this suite can drive the real query against a fake auth service.
 *
 * WHY GoTrue IS NOT REAL, AND IT IS A PROPERTY OF THE HARNESS RATHER THAN A
 * CHOICE: `db-tests.yml` captures `DATABASE_URL` and deliberately not the
 * Supabase URL or the service-role key — its own comment says so — so no
 * DB-gated suite can call `admin.auth.admin.*`. Driving `deleteStaffMember`
 * end to end is blocked by the same wall: it re-authenticates the actor's
 * password against GoTrue before it will delete anything.
 *
 * THE SEEDED-READ FAILURE CLASS IS WHAT THIS AVOIDS, and the distinction is
 * exact. The failure named on LE-followup-contact-mark-never-recorded was a
 * test that asserted a VISIBLE OUTCOME which the seed had produced, so the
 * production write was never exercised. Here the seed produces the
 * PRECONDITION — a tenant that has deleted staff — and the thing under test,
 * the selection of what may be reclaimed, is performed by production code
 * against real rows. The security property is the SET, and the set is computed
 * for real.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

d("findReclaimableStaffAuthId against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let find: typeof import("./reclaim").findReclaimableStaffAuthId;
  let writeAudit: typeof import("@/lib/admin/audit").writeAudit;
  let withTenantContext: typeof import("@osteojp/db").withTenantContext;
  let toClaims: typeof import("@osteojp/auth").toClaims;

  let tenantId: string;
  let otherTenantId: string;
  let actorId: string;
  let liveStaffId: string;
  let deletedStaffId: string;
  let patientAuthId: string;
  let patientId: string;

  const EMAIL = "reclaim-target@example.pt";
  let actor: { tenantId: string; role: "owner"; userId: string };

  /** GoTrue, faked. Maps an auth id to the address it holds. */
  let authUsers: Map<string, string | null>;
  const readAuthUser = async (id: string) => {
    if (!authUsers.has(id)) return null;
    return { id, email: authUsers.get(id) ?? null };
  };

  /** An audit row written by the PRODUCTION writer, in the shape
   *  `deleteStaffMember` writes it. */
  const recordDelete = async (userId: string, who = actor) =>
    withTenantContext(toClaims(who), async (tx) => {
      await writeAudit(tx, who, {
        action: "staff.delete",
        entityType: "user",
        entityId: userId,
        metadata: { roleId: null },
      });
    });

  beforeAll(async () => {
    const db = await import("@osteojp/db");
    sql = db.getDbAdmin();
    withTenantContext = db.withTenantContext;
    toClaims = (await import("@osteojp/auth")).toClaims;
    find = (await import("./reclaim")).findReclaimableStaffAuthId;
    writeAudit = (await import("@/lib/admin/audit")).writeAudit;

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    for (const [id, slug] of [
      [tenantId, "reclaim-" + tenantId.slice(0, 8)],
      [otherTenantId, "other-" + otherTenantId.slice(0, 8)],
    ] as const) {
      await sql.execute(raw`insert into tenants (id, name, slug)
                values (${id}, 'Reclaim Co', ${slug})`);
    }

    actorId = randomUUID();
    liveStaffId = randomUUID();
    deletedStaffId = randomUUID();
    patientAuthId = randomUUID();
    for (const [id, name] of [
      [actorId, "Dona Actor"],
      [liveStaffId, "Terapeuta Viva"],
    ] as const) {
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
                values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true)`);
    }
    // deletedStaffId gets NO users row: that is what "deleted" means here.

    patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, auth_user_id)
              values (${patientId}, ${tenantId}, 'Paciente Portal', ${patientAuthId})`);

    actor = { tenantId, role: "owner", userId: actorId };

    authUsers = new Map<string, string | null>([
      [deletedStaffId, EMAIL],
      [liveStaffId, "live@example.pt"],
      // THE PATIENT HOLDS THE SAME ADDRESS. This is the escalation the closed
      // candidate set exists to prevent, and it is seeded so the refusal below
      // is a real refusal rather than a vacuous one.
      [patientAuthId, EMAIL],
    ]);
  });

  /**
   * NOTHING IS TORN DOWN, AND THE FIRST VERSION OF THIS FILE LEARNED THAT FROM
   * THE GUARANTEE IT IS TESTING.
   *
   * `delete from users where tenant_id = ...` was refused with 23503: "update
   * or delete on table users violates foreign key constraint
   * audit_log_actor_user_id_users_id_fk". The audit rows this suite writes name
   * the actor, and an actor cannot be deleted out from under an audit trail.
   *
   * THAT IS THE SAME RULE `deleteStaffMember` ENFORCES, met from the other side:
   * it refuses to destroy an account with any audit activity. A teardown that
   * disabled a trigger to get around it would break the exact production
   * property this card is about, and `redeem.db.test.ts` records at length what
   * a global `ALTER TABLE ... DISABLE TRIGGER` did to two parallel suites.
   *
   * NOTHING NEEDS DELETING. Every id here is a fresh `randomUUID()` per run and
   * every read is keyed by this run's tenant, so leftover rows are invisible to
   * anything. CI resets the database; a local run accumulates a handful of tiny
   * rows, which is the honest price of an append-only table.
   */

  it("FINDS the identity this tenant deleted, when the address still matches", async () => {
    await recordDelete(deletedStaffId);
    await expect(find(actor, EMAIL, readAuthUser)).resolves.toBe(deletedStaffId);
  });

  it("matches case-insensitively and ignores surrounding space", async () => {
    await expect(find(actor, "  Reclaim-Target@Example.PT  ", readAuthUser)).resolves.toBe(
      deletedStaffId,
    );
  });

  it("REFUSES a PATIENT's login holding the same address - the escalation", async () => {
    // THE TEST THIS WHOLE DESIGN EXISTS FOR. `patientAuthId` holds EMAIL and has
    // no `users` row, so the obvious "no users row, therefore an orphan"
    // predicate would return it and hand an admin a patient's portal login.
    // It is not in the candidate set because this tenant never deleted it as
    // staff. Asserted by IDENTITY, not by null: the function must return the
    // staff id, never the patient's.
    const got = await find(actor, EMAIL, readAuthUser);
    expect(got).not.toBe(patientAuthId);
    expect(got).toBe(deletedStaffId);
  });

  it("REFUSES a patient's login when NO staff deletion matches at all", async () => {
    // The same escalation with the decoy removed, so the refusal cannot be an
    // accident of ordering.
    const patientOnly = new Map<string, string | null>([[patientAuthId, "patient-only@example.pt"]]);
    await expect(
      find(actor, "patient-only@example.pt", async (id) =>
        patientOnly.has(id) ? { id, email: patientOnly.get(id) ?? null } : null,
      ),
    ).resolves.toBeNull();
  });

  it("REFUSES an id that has since been RE-CREATED as a live users row", async () => {
    // A delete followed by `attachAuthLogin` keying a login to that same id.
    // The audit row still says it was deleted; the live row says it is not.
    await recordDelete(liveStaffId);
    await expect(find(actor, "live@example.pt", readAuthUser)).resolves.toBeNull();
  });

  it("REFUSES when the auth identity now holds a DIFFERENT address", async () => {
    // A recycled id must not be taken. The audit row is the candidate; the
    // address on the auth side is the binding.
    const moved = new Map<string, string | null>([[deletedStaffId, "someone-else@example.pt"]]);
    await expect(
      find(actor, EMAIL, async (id) => (moved.has(id) ? { id, email: moved.get(id) ?? null } : null)),
    ).resolves.toBeNull();
  });

  it("REFUSES when the auth identity is already gone", async () => {
    await expect(find(actor, EMAIL, async () => null)).resolves.toBeNull();
  });

  it("does NOT see ANOTHER tenant's deletion - the audit read is RLS-scoped", async () => {
    // THE CROSS-TENANT ARM. The other tenant deletes an account holding the same
    // address; this tenant must not be able to reclaim it.
    const foreignId = randomUUID();
    const foreignActorId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
              values (${foreignActorId}, ${otherTenantId}, ${"fa-" + foreignActorId.slice(0, 8) + "@t.test"}, 'Outro', true)`);
    const foreignActor = { tenantId: otherTenantId, role: "owner" as const, userId: foreignActorId };
    await recordDelete(foreignId, foreignActor);

    const only = new Map<string, string | null>([[foreignId, "foreign@example.pt"]]);
    const reader = async (id: string) =>
      only.has(id) ? { id, email: only.get(id) ?? null } : null;

    // The other tenant CAN reclaim its own - the positive control that proves
    // the negative below is about scope and not about a broken fixture.
    await expect(find(foreignActor, "foreign@example.pt", reader)).resolves.toBe(foreignId);
    // This tenant cannot.
    await expect(find(actor, "foreign@example.pt", reader)).resolves.toBeNull();
  });

  it("returns null on an empty address rather than scanning", async () => {
    await expect(find(actor, "   ", readAuthUser)).resolves.toBeNull();
  });
});
