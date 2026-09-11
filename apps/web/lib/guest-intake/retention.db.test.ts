/**
 * INTAKE-01 - the retention job against a REAL Postgres, through the ADMIN
 * connection it runs on in production.
 *
 * TWO ARMS, THE DATABASE PICKS ONE AT COLLECTION TIME (see queries.db.test.ts
 * for why a skipped arm would redden the required DB-gated check):
 *
 *   0087 NOT APPLIED  the INERT arm: against the real catalogue the job answers
 *                     `table_absent` and calls neither the tenant lister nor the
 *                     purge; a negative control proves the function is absent.
 *   0087 APPLIED      the WITH-TABLE arm: the connection is the owning role and
 *                     not service_role; one run deletes exactly the intake the
 *                     four conditions allow; the request survives with one
 *                     PII-free audit row; the converted intake is kept although
 *                     converted_appointment_id is NULL; a second run deletes
 *                     nothing.
 *
 * THE TENANT LIST IS INJECTED IN THE WITH-TABLE ARM, deliberately. The job's
 * real lister walks EVERY tenant, and on a shared database that would delete
 * other suites' backdated intakes mid-test. So the run is pointed at this file's
 * tenant; the lister itself is asserted separately, read-only.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const live = Boolean(process.env.DATABASE_URL);

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

const sqlStateOf = (e: unknown): string | undefined => {
  const x = e as { code?: string; cause?: { code?: string } } | null;
  return x?.code ?? x?.cause?.code;
};

const quiet = () => {};

if (!live || !TABLE_PRESENT) {
  dLive(
    "0087 NOT APPLIED on this database: the retention job is inert (the with-table arm registers once 0087 is applied)",
    () => {
      beforeEach(async () => {
        (await import("@osteojp/db")).resetGuestIntakeSchemaCache();
      });

      it("against the real catalogue it answers table_absent and calls neither the lister nor the purge", async () => {
        const { getDbAdmin } = await import("@osteojp/db");
        const { runGuestIntakeRetention } = await import("./retention");
        const calls: string[] = [];
        const out = await runGuestIntakeRetention(getDbAdmin(), {
          log: quiet,
          listTenantIds: async () => {
            calls.push("list");
            return [];
          },
          purgeTenant: async () => {
            calls.push("purge");
            return 0;
          },
        });
        expect(out).toEqual({ ran: false, reason: "table_absent" });
        expect(calls).toEqual([]);
      });

      it("negative control: the function really is absent, so calling it directly fails 42883", async () => {
        const { getDbAdmin } = await import("@osteojp/db");
        const { purgeTenantGuestIntakes } = await import("./retention");
        const err = await purgeTenantGuestIntakes(getDbAdmin(), randomUUID()).then(
          () => null,
          (e: unknown) => e,
        );
        expect(sqlStateOf(err)).toBe("42883");
      });
    },
  );
} else {
  describe("0087 APPLIED: the job deletes exactly what the four conditions allow", () => {
    type Db = ReturnType<typeof import("@osteojp/db").getDbAdmin>;
    let db: Db;
    const T = randomUUID();
    const L = randomUUID();
    const S = randomUUID();
    const user = randomUUID();
    const patient = randomUUID();
    const OLD = randomUUID(); //   unconverted, arrived 8 days ago  -> purged
    const YOUNG = randomUUID(); // unconverted, arrived 6 days ago  -> kept (not due)
    const CONV = randomUUID(); //  converted,  arrived 30 days ago -> kept FOREVER

    const intakeRequestIds = async () =>
      (
        (await db.execute(
          raw`select guest_booking_request_id::text as id from public.guest_clinical_intakes
               where tenant_id = ${T}::uuid order by 1`,
        )) as unknown as Array<{ id: string }>
      ).map((r) => r.id);

    beforeAll(async () => {
      const mod = await import("@osteojp/db");
      mod.resetGuestIntakeSchemaCache();
      db = mod.getDbAdmin();
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${T}::uuid, 'retention-c', ${"retention-c-" + T.slice(0, 8)})`,
      );
      await db.execute(raw`insert into locations (id, tenant_id, name) values (${L}::uuid, ${T}::uuid, 'Clinica R')`);
      await db.execute(
        raw`insert into services (id, tenant_id, name, duration_min, price_cents)
            values (${S}::uuid, ${T}::uuid, 'Osteopatia', 45, 4500)`,
      );
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${user}::uuid, ${T}::uuid, ${`r-${user.slice(0, 8)}@retention-c.test`}, 'Rececao R')`,
      );
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, patient_number, created_by)
            values (${patient}::uuid, ${T}::uuid, 'Tratada R', ${700000 + Math.floor(Math.random() * 99999)}, ${user}::uuid)`,
      );
      for (const [id, convertedTo, ageDays] of [
        [OLD, null, 8],
        [YOUNG, null, 6],
        [CONV, patient, 30],
      ] as const) {
        // converted_appointment_id is left NULL on every row, including the
        // converted one - exactly as production has it (nothing writes it).
        await db.execute(
          raw`insert into guest_booking_requests
                (id, tenant_id, full_name, phone, service_id, location_id,
                 requested_starts_at, requested_ends_at, converted_patient_id)
              values (${id}::uuid, ${T}::uuid, 'Pessoa R', '912345678', ${S}::uuid, ${L}::uuid,
                      '2026-10-01T08:00:00Z'::timestamptz, '2026-10-01T12:00:00Z'::timestamptz,
                      ${convertedTo}::uuid)`,
        );
        await db.execute(
          raw`insert into public.guest_clinical_intakes (
                tenant_id, guest_booking_request_id, date_of_birth, reason,
                pacemaker, pregnancy, consent_ticked, consent_at, consent_version, created_at
              ) values (
                ${T}::uuid, ${id}::uuid, '1970-01-01'::date, 'Motivo',
                'nao', 'nao', true, now() - make_interval(days => ${ageDays}),
                'rgpd-intake-2026-09-11', now() - make_interval(days => ${ageDays})
              )`,
        );
      }
    });

    afterAll(async () => {
      if (!db) return;
      await db.execute(raw`delete from guest_booking_requests where tenant_id = ${T}::uuid`);
      await db.execute(raw`delete from audit_log where tenant_id = ${T}::uuid`);
      await db.execute(raw`delete from patients where tenant_id = ${T}::uuid`);
      await db.execute(raw`delete from users where tenant_id = ${T}::uuid`);
      await db.execute(raw`delete from services where tenant_id = ${T}::uuid`);
      await db.execute(raw`delete from locations where tenant_id = ${T}::uuid`);
      await db.execute(raw`delete from tenants where id = ${T}::uuid`);
    });

    it("the admin connection is the owning role (BYPASSRLS), not service_role, and only it may execute the purge", async () => {
      const [row] = (await db.execute(raw`
        select current_user::text as who,
               (select rolbypassrls from pg_roles where rolname = current_user) as bypass,
               has_function_privilege(current_user, 'public.purge_expired_guest_intakes(uuid)', 'EXECUTE') as mine,
               has_function_privilege('service_role', 'public.purge_expired_guest_intakes(uuid)', 'EXECUTE') as service,
               has_function_privilege('authenticated', 'public.purge_expired_guest_intakes(uuid)', 'EXECUTE') as authed
      `)) as unknown as Array<{ who: string; bypass: boolean; mine: boolean; service: boolean; authed: boolean }>;
      expect(row!.who).not.toBe("service_role");
      expect(row!.bypass).toBe(true);
      expect(row!.mine).toBe(true);
      // Negative controls: the revokes 0087 made are really there.
      expect(row!.service).toBe(false);
      expect(row!.authed).toBe(false);
    });

    it("one run over this tenant deletes the old unconverted intake and nothing else", async () => {
      const { runGuestIntakeRetention } = await import("./retention");
      expect(await intakeRequestIds()).toEqual([OLD, YOUNG, CONV].sort());
      const out = await runGuestIntakeRetention(db, { log: quiet, listTenantIds: async () => [T] });
      expect(out).toEqual({ ran: true, tenants: 1, purged: 1 });
      expect(await intakeRequestIds()).toEqual([YOUNG, CONV].sort());
    });

    it("the request survives its answers, and one PII-free audit row records the deletion", async () => {
      const requests = (await db.execute(
        raw`select id::text as id from guest_booking_requests where tenant_id = ${T}::uuid order by 1`,
      )) as unknown as Array<{ id: string }>;
      expect(requests.map((r) => r.id)).toEqual([OLD, YOUNG, CONV].sort());

      const audits = (await db.execute(raw`
        select entity_type, entity_id::text as entity_id, actor_user_id,
               (select array_agg(k order by k) from jsonb_object_keys(metadata) k) as keys,
               metadata->>'reason' as reason
          from audit_log
         where tenant_id = ${T}::uuid and action = 'guest_intake.purged'
      `)) as unknown as Array<{
        entity_type: string;
        entity_id: string;
        actor_user_id: string | null;
        keys: string[];
        reason: string;
      }>;
      expect(audits).toEqual([
        {
          entity_type: "guest_booking_request",
          entity_id: OLD,
          actor_user_id: null,
          keys: ["intake_arrived_at", "reason"],
          reason: "retention_7d_unconverted",
        },
      ]);
    });

    it("the converted intake is KEPT although its converted_appointment_id is NULL (the trap)", async () => {
      const [r] = (await db.execute(
        raw`select converted_appointment_id is null as no_appt, converted_patient_id::text as patient
              from guest_booking_requests where id = ${CONV}::uuid`,
      )) as unknown as Array<{ no_appt: boolean; patient: string }>;
      expect(r).toEqual({ no_appt: true, patient });
      expect(await intakeRequestIds()).toContain(CONV);
    });

    it("a second run deletes nothing: the clock ran on arrival and nothing else is due", async () => {
      const { runGuestIntakeRetention } = await import("./retention");
      const out = await runGuestIntakeRetention(db, { log: quiet, listTenantIds: async () => [T] });
      expect(out).toEqual({ ran: true, tenants: 1, purged: 0 });
      expect(await intakeRequestIds()).toEqual([YOUNG, CONV].sort());
    });

    it("the default lister walks tenants, and this tenant is among them", async () => {
      const { listTenantIdsForRetention } = await import("./retention");
      expect(await listTenantIdsForRetention(db)).toContain(T);
    });
  });
}
