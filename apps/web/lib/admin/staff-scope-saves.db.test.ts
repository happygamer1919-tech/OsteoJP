/**
 * staff-scope-saves.db.test.ts: PL-09 Phase 4. EVERY EQUIPA SAVE THAT NAMES A
 * STAFF MEMBER ACTS ONLY ON STAFF AT THE ADMIN'S OWN CLINICS, against a real
 * Postgres, through the real `runScoped`, RLS, location scope and audit insert.
 *
 * THE FIVE SAVES: Ativar login (`activateStaffLogin`), the clinic memberships
 * (`setStaffLocations`), their agenda colour (`setStaffColor`), the primary
 * service (`setTherapistPrimaryService`) and the other services
 * (`setTherapistServices`). The profile, role, active and delete saves already
 * run the same helper and are not repeated here.
 *
 * EACH SAVE GETS THREE ARMS:
 *   - a location-scoped admin on a member at ANOTHER clinic: refused
 *     (`not_found`, the member is invisible to them, as in listStaff) and
 *     nothing is written, read back on the admin connection;
 *   - the same admin on a member at THEIR clinic: saved (the control: without
 *     it, a save that refused everybody would pass every refusal arm);
 *   - the owner and an admin with no clinic: saved on the other clinic's member
 *     (both are unrestricted by design, viewer-locations.ts).
 *
 * THE MEMBERSHIP SAVE ALSO CHECKS THE CLINICS: a scoped admin may add or remove
 * only their own clinics (`forbidden` otherwise), and a membership at another
 * clinic that the save leaves unchanged passes, because the Gerir form lists
 * every clinic and posts it back.
 *
 * STUBBED: `server-only`, and the login provider calls of `@/lib/auth/provision`
 * (Ativar login creates a Supabase auth user; nothing here may reach one).
 * Everything else is real. Its own tenant, removed afterwards. Runs in
 * `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this workspace)
 * and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const provision = vi.hoisted(() => ({
  ensureAuthUserForStaffRow: vi.fn(async () => ({ created: true })),
}));
vi.mock("@/lib/auth/provision", () => ({
  provisionStaffUser: vi.fn(),
  ensureAuthUserForStaffRow: provision.ensureAuthUserForStaffRow,
  generateSetPasswordLink: vi.fn(),
  updateStaffAuthEmail: vi.fn(),
}));

import type { RequestContext } from "@osteojp/auth";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("PL-09 Phase 4: the Equipa saves act only on staff at the admin's clinics", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let activateStaffLogin: typeof import("./staff").activateStaffLogin;
  let setStaffLocations: typeof import("./staff-locations").setStaffLocations;
  let setStaffColor: typeof import("./staff-locations").setStaffColor;
  let setTherapistPrimaryService: typeof import("./therapist-primary-service").setTherapistPrimaryService;
  let setTherapistServices: typeof import("./therapist-primary-service").setTherapistServices;

  const tenant = randomUUID();
  const ownerRole = randomUUID();
  const adminRole = randomUUID();
  const therapistRole = randomUUID();
  const clinicA = randomUUID();
  const clinicB = randomUUID();
  const serviceOne = randomUUID();
  const serviceTwo = randomUUID();

  const owner = randomUUID();
  /** An admin assigned to clinic A only. */
  const adminA = randomUUID();
  /** An admin with no clinic: unrestricted, so nobody is locked out mid-onboarding. */
  const adminNone = randomUUID();
  /** A therapist at clinic A. */
  const memberA = randomUUID();
  /** A therapist at clinic B only: outside adminA's scope. */
  const memberB = randomUUID();
  /** A therapist at both clinics. */
  const memberAB = randomUUID();

  const asOwner: RequestContext = { tenantId: tenant, role: "owner", userId: owner };
  const asAdminA: RequestContext = { tenantId: tenant, role: "admin", userId: adminA };
  const asAdminNone: RequestContext = { tenantId: tenant, role: "admin", userId: adminNone };

  /** Read-backs are on the admin connection, so RLS hides nothing from them. */
  const clinicsOf = async (userId: string): Promise<string[]> => {
    const rows = (await db.execute(
      raw`select location_id::text as id from staff_locations
           where tenant_id = ${tenant}::uuid and user_id = ${userId}::uuid`,
    )) as unknown as { id: string }[];
    return rows.map((r) => r.id).sort();
  };
  const colourOf = async (userId: string, locationId: string): Promise<string | null> => {
    const rows = (await db.execute(
      raw`select color from staff_locations
           where tenant_id = ${tenant}::uuid and user_id = ${userId}::uuid
             and location_id = ${locationId}::uuid`,
    )) as unknown as { color: string | null }[];
    return rows[0]?.color ?? null;
  };
  const servicesOf = async (userId: string): Promise<string[]> => {
    const rows = (await db.execute(
      raw`select service_id::text as id from therapist_services
           where tenant_id = ${tenant}::uuid and therapist_user_id = ${userId}::uuid
           order by created_at, id`,
    )) as unknown as { id: string }[];
    return rows.map((r) => r.id);
  };
  const auditCount = async (action: string, userId: string): Promise<number> => {
    const rows = (await db.execute(
      raw`select count(*)::int as n from audit_log
           where tenant_id = ${tenant}::uuid and action = ${action}
             and entity_id = ${userId}::uuid`,
    )) as unknown as { n: number }[];
    return Number(rows[0]!.n);
  };
  const sorted = (...ids: string[]) => [...ids].sort();

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ activateStaffLogin } = await import("./staff"));
    ({ setStaffLocations, setStaffColor } = await import("./staff-locations"));
    ({ setTherapistPrimaryService, setTherapistServices } = await import(
      "./therapist-primary-service"
    ));

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'pl09 scope', ${"pl09s-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into roles (id, tenant_id, slug, name)
          values (${ownerRole}::uuid, ${tenant}::uuid, 'owner', 'Owner'),
                 (${adminRole}::uuid, ${tenant}::uuid, 'admin', 'Admin'),
                 (${therapistRole}::uuid, ${tenant}::uuid, 'therapist', 'Therapist')`,
    );
    for (const [id, role, label] of [
      [owner, ownerRole, "dona"],
      [adminA, adminRole, "admin-a"],
      [adminNone, adminRole, "admin-sem"],
      [memberA, therapistRole, "ter-a"],
      [memberB, therapistRole, "ter-b"],
      [memberAB, therapistRole, "ter-ab"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, role_id, email, full_name, is_bookable)
            values (${id}::uuid, ${tenant}::uuid, ${role}::uuid,
                    ${`${label}-${id.slice(0, 8)}@pl09.test`}, ${`${label} PL09`}, true)`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
          values (${clinicA}::uuid, ${tenant}::uuid, 'Clinica A (teste)', '08:00', '21:00', 60),
                 (${clinicB}::uuid, ${tenant}::uuid, 'Clinica B (teste)', '08:00', '21:00', 60)`,
    );
    for (const [userId, locationId] of [
      [adminA, clinicA],
      [memberA, clinicA],
      [memberB, clinicB],
      [memberAB, clinicA],
      [memberAB, clinicB],
    ] as const) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${userId}::uuid, ${locationId}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, is_active)
          values (${serviceOne}::uuid, ${tenant}::uuid, 'Osteopatia PL09', 60, true),
                 (${serviceTwo}::uuid, ${tenant}::uuid, 'Fisioterapia PL09', 60, true)`,
    );
    // Every therapist starts with serviceOne as primary, set directly so the
    // starting point does not depend on the saves under test.
    for (const userId of [memberA, memberB, memberAB]) {
      await db.execute(
        raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
            values (${tenant}::uuid, ${userId}::uuid, ${serviceOne}::uuid)`,
      );
    }
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from therapist_services where tenant_id = ${tenant}::uuid`,
      raw`delete from staff_locations where tenant_id = ${tenant}::uuid`,
      raw`delete from services where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
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

  beforeEach(() => {
    provision.ensureAuthUserForStaffRow.mockClear();
  });

  /* ------------------------------ Ativar login ------------------------------ */

  describe("activateStaffLogin", () => {
    it("a scoped admin is refused a member at another clinic, and no login is created", async () => {
      await expect(activateStaffLogin(asAdminA, memberB)).rejects.toMatchObject({
        code: "not_found",
      });
      expect(provision.ensureAuthUserForStaffRow).not.toHaveBeenCalled();
      expect(await auditCount("staff.activate_login", memberB)).toBe(0);
    });

    it("control: the same admin activates a member at their clinic", async () => {
      const result = await activateStaffLogin(asAdminA, memberA);
      expect(result.created).toBe(true);
      expect(provision.ensureAuthUserForStaffRow).toHaveBeenCalledTimes(1);
      expect(await auditCount("staff.activate_login", memberA)).toBe(1);
    });

    it("the owner and an admin with no clinic activate the other clinic's member", async () => {
      await activateStaffLogin(asOwner, memberB);
      await activateStaffLogin(asAdminNone, memberB);
      expect(provision.ensureAuthUserForStaffRow).toHaveBeenCalledTimes(2);
      expect(await auditCount("staff.activate_login", memberB)).toBe(2);
    });
  });

  /* ---------------------------- the agenda colour --------------------------- */

  describe("setStaffColor", () => {
    it("a scoped admin is refused a member at another clinic, and the colour is unchanged", async () => {
      await expect(setStaffColor(asAdminA, memberB, clinicB, "forest")).rejects.toMatchObject({
        code: "not_found",
      });
      expect(await colourOf(memberB, clinicB)).toBeNull();
    });

    it("control: the same admin colours a member at their clinic", async () => {
      await setStaffColor(asAdminA, memberA, clinicA, "forest");
      expect(await colourOf(memberA, clinicA)).toBe("forest");
    });

    it("the owner and an admin with no clinic colour the other clinic's member", async () => {
      await setStaffColor(asOwner, memberB, clinicB, "forest");
      expect(await colourOf(memberB, clinicB)).toBe("forest");
      await setStaffColor(asAdminNone, memberB, clinicB, null);
      expect(await colourOf(memberB, clinicB)).toBeNull();
    });
  });

  /* ---------------------------- the primary service -------------------------- */

  describe("setTherapistPrimaryService", () => {
    it("a scoped admin is refused a member at another clinic, and the services are unchanged", async () => {
      await expect(
        setTherapistPrimaryService(asAdminA, memberB, serviceTwo),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(await servicesOf(memberB)).toEqual([serviceOne]);
    });

    it("control: the same admin sets the primary of a member at their clinic", async () => {
      await setTherapistPrimaryService(asAdminA, memberA, serviceTwo);
      expect((await servicesOf(memberA))[0]).toBe(serviceTwo);
    });

    it("the owner and an admin with no clinic set the other clinic's member's primary", async () => {
      await setTherapistPrimaryService(asOwner, memberB, serviceTwo);
      expect((await servicesOf(memberB))[0]).toBe(serviceTwo);
      await setTherapistPrimaryService(asAdminNone, memberB, serviceOne);
      expect((await servicesOf(memberB))[0]).toBe(serviceOne);
    });
  });

  /* ---------------------------- the other services --------------------------- */

  describe("setTherapistServices", () => {
    it("a scoped admin is refused a member at another clinic, and the services are unchanged", async () => {
      const before = await servicesOf(memberB);
      await expect(setTherapistServices(asAdminA, memberB, [])).rejects.toMatchObject({
        code: "not_found",
      });
      expect(await servicesOf(memberB)).toEqual(before);
    });

    it("control: the same admin ticks a service for a member at their clinic", async () => {
      // memberAB (clinics A and B) holds serviceOne as primary; tick serviceTwo.
      await setTherapistServices(asAdminA, memberAB, [serviceTwo]);
      expect(sorted(...(await servicesOf(memberAB)))).toEqual(sorted(serviceOne, serviceTwo));
    });

    it("the owner and an admin with no clinic tick services for the other clinic's member", async () => {
      // memberB holds serviceOne (primary) and serviceTwo after the primary arm.
      await setTherapistServices(asOwner, memberB, []);
      expect(await servicesOf(memberB)).toEqual([serviceOne]);
      await setTherapistServices(asAdminNone, memberB, [serviceTwo]);
      expect(sorted(...(await servicesOf(memberB)))).toEqual(sorted(serviceOne, serviceTwo));
    });
  });

  /* ---------------------------- the clinic memberships ----------------------- */

  describe("setStaffLocations", () => {
    it("a scoped admin is refused a member at another clinic, and the memberships are unchanged", async () => {
      await expect(
        setStaffLocations(asAdminA, memberB, [clinicA, clinicB]),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(await clinicsOf(memberB)).toEqual([clinicB]);
    });

    it("a scoped admin may not ADD a clinic outside their scope to their own member", async () => {
      await expect(
        setStaffLocations(asAdminA, memberA, [clinicA, clinicB]),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(await clinicsOf(memberA)).toEqual([clinicA]);
    });

    it("a scoped admin may not REMOVE a clinic outside their scope", async () => {
      await expect(setStaffLocations(asAdminA, memberAB, [clinicA])).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await clinicsOf(memberAB)).toEqual(sorted(clinicA, clinicB));
    });

    it("control: posting another clinic's membership back unchanged is a plain save", async () => {
      // The Gerir form lists every clinic and posts the member's B tick back.
      await setStaffLocations(asAdminA, memberAB, [clinicA, clinicB]);
      expect(await clinicsOf(memberAB)).toEqual(sorted(clinicA, clinicB));
      expect(await auditCount("staff.locations.set", memberAB)).toBe(0); // a no-op
    });

    it("control: the same admin removes their own clinic, keeping the other clinic's tick", async () => {
      await setStaffLocations(asAdminA, memberAB, [clinicB]);
      expect(await clinicsOf(memberAB)).toEqual([clinicB]);
      expect(await auditCount("staff.locations.set", memberAB)).toBe(1);
    });

    it("the owner and an admin with no clinic change the other clinic's member", async () => {
      await setStaffLocations(asOwner, memberB, [clinicA, clinicB]);
      expect(await clinicsOf(memberB)).toEqual(sorted(clinicA, clinicB));
      await setStaffLocations(asAdminNone, memberB, [clinicB]);
      expect(await clinicsOf(memberB)).toEqual([clinicB]);
    });
  });
});
