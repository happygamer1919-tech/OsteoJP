/**
 * INTAKE-01 - the patient's own intake read, against a REAL Postgres, under the
 * REAL `patient` role and 0087's REAL patient policy.
 *
 * TWO ARMS, AND THE DATABASE PICKS ONE AT COLLECTION TIME (the shape of
 * write.db.test.ts next door). 0087 is HELD: the app half merges first and the
 * owner applies the table later, so CI's database has no guest_clinical_intakes
 * today and one with the contract applied has it.
 *
 *   0087 NOT APPLIED  the INERT arm: the read answers `enabled: false` against
 *                     the real catalogue, and, as a negative control, the same
 *                     statement run directly fails with 42P01 - so it is the
 *                     detector, not luck, that keeps the portal read from
 *                     erroring before the apply.
 *   0087 APPLIED      the WITH-TABLE arm: each patient reads exactly their own
 *                     CONVERTED intakes, newest first, verbatim, three states
 *                     intact; an unconverted intake and another tenant's are
 *                     visible to nobody; the policy (not only the explicit
 *                     filter) does the scoping; the patient role cannot write.
 *
 * WHY THE ARMS ARE REGISTERED, NOT SKIPPED. `.github/scripts/assert-rls-executed.mjs`
 * reddens the required DB-gated check for any suite with a test that did not
 * run (PERMITTED_SKIPS is empty by design). So only the arm that applies is
 * registered, and every registered test runs. When 0087 merges, CI's database
 * gains the table and runs the with-table arm with no edit to this file.
 *
 * WITHOUT DATABASE_URL (the unit job) both arms are `describe.skip`, as every
 * DB-gated suite in this repository is.
 *
 * SHARED DATABASE: every assertion is about rows this file created, found by its
 * own tenant ids and its own row ids, never a global count.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// runAsPatient's body, verbatim (lib/auth/patient.ts): the verified principal's
// claims, `set local role patient`, one transaction. Mocked only so this suite
// does not import the request-scoped half of that module (next/headers, the
// Supabase server client), which has nothing to do with what is measured here.
vi.mock("@/lib/auth/patient", async () => {
  const { withPatientContext } = await import("@osteojp/db");
  const { toPatientClaims } = await import("@osteojp/auth");
  return {
    runAsPatient: <T>(
      p: { tenantId: string; patientId: string; userId: string },
      fn: (tx: Parameters<Parameters<typeof withPatientContext>[1]>[0]) => Promise<T>,
    ) => withPatientContext(toPatientClaims(p), fn),
  };
});

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
type Principal = { tenantId: string; patientId: string; userId: string };

/** The SQLSTATE of a failed statement, wherever the driver put it. */
function codeOf(e: unknown): string | undefined {
  const pick = (x: unknown): unknown =>
    typeof x === "object" && x !== null && "code" in x ? (x as { code: unknown }).code : undefined;
  const cause = typeof e === "object" && e !== null && "cause" in e ? (e as { cause: unknown }).cause : undefined;
  const found = pick(e) ?? pick(cause);
  return typeof found === "string" ? found : undefined;
}

async function rejectionOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected the statement to be refused, and it was not");
}

if (!live || !TABLE_PRESENT) {
  dLive("0087 NOT APPLIED on this database: the patient read is inert (the with-table arm registers once 0087 is applied)", () => {
    // No fixtures: the inert arm must never reach a row, and a principal needs
    // no patient row to exist for the transaction to open.
    const principal: Principal = { tenantId: randomUUID(), patientId: randomUUID(), userId: "inert" };

    beforeEach(async () => {
      const { resetGuestIntakeSchemaCache } = await import("@osteojp/db");
      resetGuestIntakeSchemaCache();
    });

    it("the read answers enabled false and no intakes, against the real catalogue", async () => {
      const { readOwnGuestIntakes } = await import("./patient-read");
      await expect(readOwnGuestIntakes(principal)).resolves.toEqual({ enabled: false, intakes: [] });
    });

    it("NEGATIVE CONTROL: the statement itself, run without the detector, fails with 42P01 here", async () => {
      // Without this, the test above passes against a read that never names the
      // table at all. With it, the inert answer is shown to be the detector's.
      const { withPatientContext } = await import("@osteojp/db");
      const { toPatientClaims } = await import("@osteojp/auth");
      const { selectOwnGuestIntakes } = await import("./patient-read");
      const e = await rejectionOf(
        withPatientContext(toPatientClaims(principal), (tx) => selectOwnGuestIntakes(tx, principal)),
      );
      expect(codeOf(e)).toBe("42P01");
    });
  });
}

if (!live || TABLE_PRESENT) {
  dLive("0087 APPLIED on this database: a patient reads exactly their own converted intakes", () => {
    const T = randomUUID();
    const T2 = randomUUID();
    const LOC = randomUUID();
    const LOC2 = randomUUID();
    const SVC = randomUUID();
    const SVC2 = randomUUID();
    const PA = randomUUID();
    const PB = randomUUID();

    // Requests: two converted to A (one older), one to B, one never converted,
    // and one in ANOTHER tenant whose converted_patient_id names A's id (the
    // column has no FK, so the tenant arm is the only thing that excludes it).
    const REQ = {
      a1: randomUUID(),
      a2: randomUUID(),
      b: randomUUID(),
      unconverted: randomUUID(),
      otherTenant: randomUUID(),
    };
    const INTAKE = {
      a1: randomUUID(),
      a2: randomUUID(),
      b: randomUUID(),
      unconverted: randomUUID(),
      otherTenant: randomUUID(),
    };

    const A: Principal = { tenantId: T, patientId: PA, userId: "patient-a" };
    const B: Principal = { tenantId: T, patientId: PB, userId: "patient-b" };
    const NOBODY: Principal = { tenantId: T, patientId: randomUUID(), userId: "nobody" };

    let db: Db;

    const request = (id: string, tenant: string, loc: string, svc: string, convertedTo: string | null) =>
      db.execute(raw`
        insert into guest_booking_requests
          (id, tenant_id, full_name, phone, service_id, location_id,
           requested_starts_at, requested_ends_at, converted_patient_id)
        values (${id}::uuid, ${tenant}::uuid, 'Pedido Intake B', '+351912345678', ${svc}::uuid, ${loc}::uuid,
                '2026-10-01T08:00:00Z', '2026-10-01T12:00:00Z', ${convertedTo}::uuid)
      `);

    const intake = (
      id: string,
      tenant: string,
      requestId: string,
      o: { reason: string; medication: string | null; pacemaker: string; pregnancy: string; daysAgo: number },
    ) =>
      db.execute(raw`
        insert into guest_clinical_intakes
          (id, tenant_id, guest_booking_request_id, date_of_birth, reason,
           health_conditions, medication, falls_accidents, surgeries,
           pacemaker, pregnancy, consent_ticked, consent_at, consent_version, created_at)
        values (${id}::uuid, ${tenant}::uuid, ${requestId}::uuid, '1985-03-02', ${o.reason},
                null, ${o.medication}, null, null,
                ${o.pacemaker}::public.intake_answer, ${o.pregnancy}::public.intake_answer,
                true, now() - make_interval(days => ${o.daysAgo}), 'rgpd-intake-2026-09-11',
                now() - make_interval(days => ${o.daysAgo}))
      `);

    beforeAll(async () => {
      const mod = await import("@osteojp/db");
      db = mod.getDbAdmin();
      for (const [t, loc, svc] of [
        [T, LOC, SVC],
        [T2, LOC2, SVC2],
      ] as const) {
        await db.execute(
          raw`insert into tenants (id, name, slug) values (${t}::uuid, 'intake-b', ${"intake-b-" + t.slice(0, 8)})`,
        );
        await db.execute(
          raw`insert into locations (id, tenant_id, name) values (${loc}::uuid, ${t}::uuid, 'Clinica Intake B')`,
        );
        await db.execute(
          raw`insert into services (id, tenant_id, name, duration_min, price_cents)
              values (${svc}::uuid, ${t}::uuid, 'Osteopatia', 45, 4500)`,
        );
      }
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, patient_number) values (${PA}::uuid, ${T}::uuid, 'Paciente A', 91001)`,
      );
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, patient_number) values (${PB}::uuid, ${T}::uuid, 'Paciente B', 91002)`,
      );

      await request(REQ.a1, T, LOC, SVC, PA);
      await request(REQ.a2, T, LOC, SVC, PA);
      await request(REQ.b, T, LOC, SVC, PB);
      await request(REQ.unconverted, T, LOC, SVC, null);
      await request(REQ.otherTenant, T2, LOC2, SVC2, PA);

      await intake(INTAKE.a1, T, REQ.a1, { reason: "Dor lombar", medication: "Ibuprofeno", pacemaker: "nao", pregnancy: "nao", daysAgo: 1 });
      await intake(INTAKE.a2, T, REQ.a2, { reason: "Dor cervical", medication: null, pacemaker: "sim", pregnancy: "nao", daysAgo: 3 });
      // "Never asked", as a row from another route would carry it. The read must
      // hand it back as that, never as "nao".
      await intake(INTAKE.b, T, REQ.b, { reason: "Entorse", medication: null, pacemaker: "nao_perguntado", pregnancy: "nao_perguntado", daysAgo: 2 });
      await intake(INTAKE.unconverted, T, REQ.unconverted, { reason: "Sem ficha", medication: null, pacemaker: "nao", pregnancy: "sim", daysAgo: 1 });
      await intake(INTAKE.otherTenant, T2, REQ.otherTenant, { reason: "Outro tenant", medication: null, pacemaker: "nao", pregnancy: "nao", daysAgo: 1 });
    });

    afterAll(async () => {
      if (!db) return;
      // ON DELETE CASCADE takes the intake rows with their requests.
      for (const t of [T, T2]) {
        await db.execute(raw`delete from guest_booking_requests where tenant_id = ${t}::uuid`);
      }
      await db.execute(raw`delete from patients where tenant_id = ${T}::uuid`);
      for (const t of [T, T2]) {
        await db.execute(raw`delete from services where tenant_id = ${t}::uuid`);
        await db.execute(raw`delete from locations where tenant_id = ${t}::uuid`);
        await db.execute(raw`delete from tenants where id = ${t}::uuid`);
      }
    });

    it("the read reports enabled", async () => {
      const { resetGuestIntakeSchemaCache } = await import("@osteojp/db");
      resetGuestIntakeSchemaCache();
      const { readOwnGuestIntakes } = await import("./patient-read");
      expect((await readOwnGuestIntakes(A)).enabled).toBe(true);
    });

    it("patient A reads exactly their two converted intakes, newest first, verbatim", async () => {
      const { readOwnGuestIntakes } = await import("./patient-read");
      const { intakes } = await readOwnGuestIntakes(A);
      expect(intakes.map((i) => i.id)).toEqual([INTAKE.a1, INTAKE.a2]);
      const [first] = intakes;
      expect(first).toMatchObject({
        id: INTAKE.a1,
        dateOfBirth: "1985-03-02",
        reason: "Dor lombar",
        healthConditions: null,
        medication: "Ibuprofeno",
        fallsAccidents: null,
        surgeries: null,
        pacemaker: "nao",
        pregnancy: "nao",
      });
      expect(first!.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(first!.consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(intakes[1]!.pacemaker).toBe("sim");
    });

    it("patient B reads only their own, and 'never asked' comes back as never asked, not as 'nao'", async () => {
      const { readOwnGuestIntakes } = await import("./patient-read");
      const { intakes } = await readOwnGuestIntakes(B);
      expect(intakes.map((i) => i.id)).toEqual([INTAKE.b]);
      expect(intakes[0]!.pacemaker).toBe("nao_perguntado");
      expect(intakes[0]!.pregnancy).toBe("nao_perguntado");
    });

    it("an UNCONVERTED intake is visible to no patient, and a patient with no requests reads nothing", async () => {
      const { readOwnGuestIntakes } = await import("./patient-read");
      const seen = [
        ...(await readOwnGuestIntakes(A)).intakes,
        ...(await readOwnGuestIntakes(B)).intakes,
        ...(await readOwnGuestIntakes(NOBODY)).intakes,
      ].map((i) => i.id);
      expect(seen).not.toContain(INTAKE.unconverted);
      expect((await readOwnGuestIntakes(NOBODY)).intakes).toEqual([]);
    });

    it("another tenant's intake is excluded even when its request names this patient's id", async () => {
      const { readOwnGuestIntakes } = await import("./patient-read");
      const ids = (await readOwnGuestIntakes(A)).intakes.map((i) => i.id);
      expect(ids).not.toContain(INTAKE.otherTenant);
    });

    it("THE POLICY DOES THE SCOPING, not only the explicit filter: an unfiltered select as patient A sees A's rows only", async () => {
      const { withPatientContext } = await import("@osteojp/db");
      const { toPatientClaims } = await import("@osteojp/auth");
      const asA = (await withPatientContext(toPatientClaims(A), (tx) =>
        tx.execute(raw`select id from guest_clinical_intakes where tenant_id = ${T}::uuid order by id`),
      )) as unknown as Array<{ id: string }>;
      expect(asA.map((r) => r.id).sort()).toEqual([INTAKE.a1, INTAKE.a2].sort());

      // THE CONTROL: the same statement as the owner sees all four of this
      // tenant's rows, so the patient's two are the policy's doing.
      const asOwner = (await db.execute(
        raw`select id from guest_clinical_intakes where tenant_id = ${T}::uuid`,
      )) as unknown as Array<{ id: string }>;
      expect(asOwner.map((r) => r.id).sort()).toEqual(
        [INTAKE.a1, INTAKE.a2, INTAKE.b, INTAKE.unconverted].sort(),
      );
    });

    it("the patient role cannot change an answer (the portal view is read only all the way down)", async () => {
      const { withPatientContext } = await import("@osteojp/db");
      const { toPatientClaims } = await import("@osteojp/auth");
      const e = await rejectionOf(
        withPatientContext(toPatientClaims(A), (tx) =>
          tx.execute(raw`update guest_clinical_intakes set reason = 'editado' where id = ${INTAKE.a1}::uuid`),
        ),
      );
      expect(codeOf(e)).toBe("42501");
      const after = (await db.execute(
        raw`select reason from guest_clinical_intakes where id = ${INTAKE.a1}::uuid`,
      )) as unknown as Array<{ reason: string }>;
      expect(after).toEqual([{ reason: "Dor lombar" }]);
    });
  });
}
