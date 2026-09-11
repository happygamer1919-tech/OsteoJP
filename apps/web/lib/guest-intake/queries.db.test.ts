/**
 * INTAKE-01 (staff side) - who reads a guest clinical intake, against a REAL
 * Postgres and as REAL principals: every read goes through `runScoped`, which is
 * `set local role authenticated` plus `set_config('request.jwt.claims', ...)`
 * with the viewer's tenant, role and user id. Nothing is filtered in the app;
 * what each viewer gets back is migration 0087's policy.
 *
 * TWO ARMS, AND THE DATABASE PICKS ONE AT COLLECTION TIME (the shape of
 * apps/api/lib/guest-intake/write.db.test.ts, fork A):
 *
 *   0087 NOT APPLIED  the INERT arm: the queue read answers `null` (feature
 *                     off) and the ficha read an empty list, for every role;
 *                     a negative control proves the table really is absent.
 *   0087 APPLIED      the WITH-TABLE arm: owner sees all; reception sees its
 *                     location's; an unassigned admin sees all; a therapist
 *                     sees nothing before conversion and, after it, only a
 *                     patient they see clinically; another tenant sees nothing;
 *                     never-asked round-trips as its own value.
 *
 * WHY THE ARMS ARE REGISTERED, NOT SKIPPED. `.github/scripts/assert-rls-executed.mjs`
 * reddens the required DB-gated check for any suite with a test that did not
 * run, and PERMITTED_SKIPS is empty by design. So only the arm that applies is
 * registered and every registered test runs. When 0087 merges, CI's database
 * gains the table and runs the with-table arm with no edit here.
 *
 * WITHOUT DATABASE_URL (the unit job) the suite is `describe.skip`, as every
 * DB-gated suite in this repository is.
 *
 * SHARED DATABASE: every assertion is about rows this file created, under its
 * own tenants, and every read is by this file's request or patient ids.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);

/** Asked ONCE, before any test is registered. */
async function tableExistsNow(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const rows = (await getDbAdmin().execute(
    raw`select to_regclass('public.guest_clinical_intakes') is not null as present`,
  )) as unknown as Array<{ present: boolean }>;
  return rows[0]?.present === true;
}
const TABLE_PRESENT = await tableExistsNow();

const dLive = live ? describe : describe.skip;

type Db = ReturnType<typeof import("@osteojp/db").getDbAdmin>;
type StaffRole = "owner" | "admin" | "reception" | "therapist";

const sqlStateOf = (e: unknown): string | undefined => {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code ?? x?.cause?.code;
};

/** Two tenants, two clinics, five staff, one patient, three requests - all this file's own. */
function world() {
  const T = randomUUID();
  const T2 = randomUUID();
  const L1 = randomUUID();
  const L2 = randomUUID();
  const S = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID();
  const reception = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();
  const owner2 = randomUUID();
  const patient = randomUUID();
  const R1 = randomUUID(); // at L1, never converted
  const R2 = randomUUID(); // at L2, never converted
  const R3 = randomUUID(); // at L1, converted mid-suite to `patient`
  let db: Db;

  beforeAll(async () => {
    db = (await import("@osteojp/db")).getDbAdmin();
    for (const [id, slug] of [
      [T, "intake-c"],
      [T2, "intake-c2"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${id}::uuid, ${slug}, ${`${slug}-${id.slice(0, 8)}`})`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values
            (${L1}::uuid, ${T}::uuid, 'Clinica Um'), (${L2}::uuid, ${T}::uuid, 'Clinica Dois')`,
    );
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, price_cents)
          values (${S}::uuid, ${T}::uuid, 'Osteopatia', 45, 4500)`,
    );
    // role_id is nullable and the ROLE that RLS reads comes from the claims, so
    // no seeded roles row is borrowed.
    for (const [id, tenant, label] of [
      [owner, T, "owner"],
      [admin, T, "admin"],
      [reception, T, "reception"],
      [therapist, T, "therapist"],
      [otherTherapist, T, "therapist2"],
      [owner2, T2, "owner2"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${`${label}-${id.slice(0, 8)}@intake-c.test`}, ${label})`,
      );
    }
    // Reception works at L1 only. The admin holds NO assignment (0047's fallback).
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${T}::uuid, ${reception}::uuid, ${L1}::uuid)`,
    );
    // The therapist created this patient, which is one of the two ways
    // clinical_therapist_sees_patient holds (0045). The other therapist has no
    // relation to them at all.
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, patient_number, created_by)
          values (${patient}::uuid, ${T}::uuid, 'Convertida C', ${800000 + Math.floor(Math.random() * 99999)}, ${therapist}::uuid)`,
    );
    for (const [id, location, name] of [
      [R1, L1, "Pessoa Um"],
      [R2, L2, "Pessoa Dois"],
      [R3, L1, "Pessoa Tres"],
    ] as const) {
      await db.execute(
        raw`insert into guest_booking_requests
              (id, tenant_id, full_name, phone, service_id, location_id,
               requested_starts_at, requested_ends_at)
            values (${id}::uuid, ${T}::uuid, ${name}, '912345678', ${S}::uuid, ${location}::uuid,
                    '2026-10-01T08:00:00Z'::timestamptz, '2026-10-01T12:00:00Z'::timestamptz)`,
      );
    }
  });

  afterAll(async () => {
    if (!db) return;
    // ON DELETE CASCADE takes the intakes with their requests, which is why this
    // cleanup never names guest_clinical_intakes: in the inert arm it does not exist.
    for (const t of [T, T2]) {
      await db.execute(raw`delete from guest_booking_requests where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from audit_log where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from patients where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from staff_locations where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from users where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from services where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from locations where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from tenants where id = ${t}::uuid`);
    }
  });

  const ctx = (role: StaffRole, userId: string, tenantId = T) => ({ tenantId, role, userId });

  return {
    T, T2, L1, L2, owner, admin, reception, therapist, otherTherapist, owner2, patient, R1, R2, R3,
    ctx,
    db: () => db,
  };
}

if (!live || !TABLE_PRESENT) {
  dLive(
    "0087 NOT APPLIED on this database: the staff reads are inert (the with-table arm registers once 0087 is applied)",
    () => {
      const w = world();

      beforeEach(async () => {
        (await import("@osteojp/db")).resetGuestIntakeSchemaCache();
      });

      it("the queue read answers null (feature off) for every role, not an empty map", async () => {
        const { listGuestIntakesForRequests } = await import("./queries");
        for (const [role, user] of [
          ["owner", w.owner],
          ["admin", w.admin],
          ["reception", w.reception],
          ["therapist", w.therapist],
        ] as const) {
          expect(await listGuestIntakesForRequests(w.ctx(role, user), [w.R1, w.R2, w.R3])).toBeNull();
        }
      });

      it("the ficha read answers an empty list", async () => {
        const { listGuestIntakesForPatient } = await import("./queries");
        expect(await listGuestIntakesForPatient(w.ctx("owner", w.owner), w.patient)).toEqual([]);
        expect(await listGuestIntakesForPatient(w.ctx("therapist", w.therapist), w.patient)).toEqual([]);
      });

      it("negative control: the table really is absent, so a statement naming it fails 42P01", async () => {
        const err = await w
          .db()
          .execute(raw`select 1 from public.guest_clinical_intakes`)
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(sqlStateOf(err)).toBe("42P01");
      });
    },
  );
} else {
  describe("0087 APPLIED: who sees an intake, as real principals (authenticated + JWT claims)", () => {
    const w = world();
    const REASON_R3 = "  Dor cervical\ndesde a queda de agosto ";

    beforeAll(async () => {
      const db = w.db();
      const intake = async (
        request: string,
        pacemaker: string,
        pregnancy: string,
        reason: string,
        medication: string | null,
      ) =>
        db.execute(raw`
          insert into public.guest_clinical_intakes (
            tenant_id, guest_booking_request_id, date_of_birth, reason, medication,
            pacemaker, pregnancy, consent_ticked, consent_at, consent_version
          ) values (
            ${w.T}::uuid, ${request}::uuid, '1985-03-10'::date, ${reason}, ${medication},
            ${pacemaker}::public.intake_answer, ${pregnancy}::public.intake_answer,
            true, now(), 'rgpd-intake-2026-09-11'
          )`);
      await intake(w.R1, "nao", "nao", "Lombalgia", null);
      // The third state, from "any other route": stored, and distinct from nao.
      await intake(w.R2, "nao_perguntado", "nao", "Ombro", null);
      await intake(w.R3, "sim", "nao", REASON_R3, "Varfarina");
    });

    const { T, T2, R1, R2, R3 } = w;
    const sorted = (ids: string[]) => [...ids].sort();
    const seenByRequest = async (role: StaffRole, user: string, tenant = T) => {
      const { listGuestIntakesForRequests } = await import("./queries");
      const map = await listGuestIntakesForRequests(w.ctx(role, user, tenant), [R1, R2, R3]);
      expect(map).not.toBeNull(); // the feature is ON in this arm
      return sorted([...map!.keys()]);
    };
    const seenOnFicha = async (role: StaffRole, user: string, tenant = T) => {
      const { listGuestIntakesForPatient } = await import("./queries");
      return listGuestIntakesForPatient(w.ctx(role, user, tenant), w.patient);
    };

    it("the principal is real: the read runs as authenticated with this viewer's claims", async () => {
      const { runScoped } = await import("@/lib/auth/context");
      const rows = (await runScoped(w.ctx("reception", w.reception), (tx) =>
        tx.execute(
          raw`select current_user::text as u, public.jwt_role() as r,
                     public.jwt_tenant_id()::text as t, auth.uid()::text as uid`,
        ),
      )) as unknown as Array<Record<string, string>>;
      expect(rows[0]).toEqual({ u: "authenticated", r: "reception", t: T, uid: w.reception });
    });

    it("the owner sees every intake in the tenant", async () => {
      expect(await seenByRequest("owner", w.owner)).toEqual(sorted([R1, R2, R3]));
    });

    it("reception at clinic one sees clinic one's intakes and NOT clinic two's", async () => {
      expect(await seenByRequest("reception", w.reception)).toEqual(sorted([R1, R3]));
    });

    it("an admin with no location assignment sees all of them (0047's fallback)", async () => {
      expect(await seenByRequest("admin", w.admin)).toEqual(sorted([R1, R2, R3]));
    });

    it("a therapist sees NOTHING before conversion, on either read", async () => {
      expect(await seenByRequest("therapist", w.therapist)).toEqual([]);
      expect(await seenOnFicha("therapist", w.therapist)).toEqual([]);
    });

    it("after conversion to a patient the therapist sees clinically, it reaches the ficha, verbatim", async () => {
      await w
        .db()
        .execute(raw`update guest_booking_requests set converted_patient_id = ${w.patient}::uuid where id = ${R3}::uuid`);
      const rows = await seenOnFicha("therapist", w.therapist);
      expect(rows.map((r) => r.guestBookingRequestId)).toEqual([R3]);
      expect(rows[0]!.reason).toBe(REASON_R3);
      expect(rows[0]!.medication).toBe("Varfarina");
      expect(rows[0]!.pacemaker).toBe("sim");
      expect(rows[0]!.dateOfBirth).toBe("1985-03-10");
      expect(rows[0]!.consentVersion).toBe("rgpd-intake-2026-09-11");
      // Only the converted one: R1 and R2 are still strangers' answers.
      expect(await seenByRequest("therapist", w.therapist)).toEqual([R3]);
    });

    it("reception and the owner see the converted intake on the ficha too", async () => {
      expect((await seenOnFicha("reception", w.reception)).map((r) => r.guestBookingRequestId)).toEqual([R3]);
      expect((await seenOnFicha("owner", w.owner)).map((r) => r.guestBookingRequestId)).toEqual([R3]);
    });

    it("a therapist who does NOT see that patient clinically still sees nothing after conversion", async () => {
      expect(await seenByRequest("therapist", w.otherTherapist)).toEqual([]);
      expect(await seenOnFicha("therapist", w.otherTherapist)).toEqual([]);
    });

    it("cross-tenant: another tenant's owner sees nothing, on either read", async () => {
      expect(await seenByRequest("owner", w.owner2, T2)).toEqual([]);
      expect(await seenOnFicha("owner", w.owner2, T2)).toEqual([]);
    });

    it("never-asked round-trips as its own value, distinct from nao", async () => {
      const { listGuestIntakesForRequests } = await import("./queries");
      const map = await listGuestIntakesForRequests(w.ctx("owner", w.owner), [R2]);
      expect(map!.get(R2)!.pacemaker).toBe("nao_perguntado");
      expect(map!.get(R2)!.pregnancy).toBe("nao");
    });

    it("reading a 'sim' pacemaker answer never sets the patient's contraindication flag", async () => {
      const [p] = (await w.db().execute(
        raw`select contraindication_pacemaker as pacemaker, contraindication_pregnancy as pregnancy
              from patients where id = ${w.patient}::uuid`,
      )) as unknown as Array<{ pacemaker: boolean; pregnancy: boolean }>;
      expect(p).toEqual({ pacemaker: false, pregnancy: false });
    });
  });
}
