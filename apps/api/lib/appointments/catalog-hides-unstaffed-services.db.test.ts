/**
 * catalog-hides-unstaffed-services.db.test.ts - Q-R (strategy ruling
 * 2026-10-22): "a service with no ticked therapist is hidden online until
 * someone is ticked". PROVEN AGAINST A REAL POSTGRES, THROUGH THE REAL STORE.
 *
 * Owner ruling Q-M (2026-10-20) made the therapist step list only therapists
 * ticked for the service. That left a gap: a service nobody bookable is ticked
 * for was still in the patient app's catalog, with nobody behind it. The catalog
 * now asks the therapist step's own predicate (`onPortalRoster` in store.ts) for
 * every (service, clinic) pair, so it lists a service at a clinic exactly when
 * the therapist step would name somebody there.
 *
 * THE FIXTURE. Two clinics, every weekday templated:
 *   T1   bookable, works at Clinica Um
 *   T2   bookable, works at Clinica Dois (so Clinica Dois is a listed clinic)
 *   TNB  NOT bookable, works at Clinica Um
 *   TEXP bookable, at Clinica Um, but its only schedule row expired in 2000
 * Services (offered at every clinic unless noted) and who is ticked for them:
 *   UM     T1            -> listed at Clinica Um only
 *   AMBOS  T1 and T2     -> listed at both
 *   NADA   nobody        -> hidden
 *   NB     TNB           -> hidden (a non-bookable therapist does not count)
 *   DOIS   T1, but the service is bound to Clinica Dois -> hidden (wrong clinic)
 *   EXP    TEXP          -> hidden (the roster requires a schedule valid today)
 *
 * EVERY REFUSAL HAS ITS CONTROL: NB comes back when TNB is made bookable, and
 * DOIS comes back when T2 (who works at Clinica Dois) is ticked. A parity arm
 * then checks every pair against the therapist step itself.
 *
 * WRITES NOTHING BUT ITS OWN TENANT. GATING: needs a live DATABASE_URL with
 * migrations applied (.github/workflows/db-tests.yml runs `vitest run
 * .db.test.ts` in this app). Skipped without one. Invented names only.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AppointmentsStore, BookableCatalog } from "./booking";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("Q-R: the patient catalog hides a service no offered therapist is ticked for", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let booking: typeof import("./booking");
  let realStore: AppointmentsStore;

  const tenantId = randomUUID();
  const patientId = randomUUID();
  const L1 = randomUUID();
  const L2 = randomUUID();
  const T1 = randomUUID();
  const T2 = randomUUID();
  const TNB = randomUUID();
  const TEXP = randomUUID();
  const UM = randomUUID();
  const AMBOS = randomUUID();
  const NADA = randomUUID();
  const NB = randomUUID();
  const DOIS = randomUUID();
  const EXP = randomUUID();
  const ALL_SERVICES = [UM, AMBOS, NADA, NB, DOIS, EXP];

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  const catalog = (): Promise<BookableCatalog> =>
    booking.getBookableCatalog(principal(), realStore);

  /** serviceId -> its locationIds, sorted, for the services the catalog lists. */
  const listed = async (): Promise<Map<string, string[]>> =>
    new Map((await catalog()).services.map((s) => [s.id, [...s.locationIds].sort()]));

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    booking = await import("./booking");
    ({ drizzleAppointmentsStore: realStore } = await import("./store"));

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Q-R Catalog Co', ${"qr-" + tenantId.slice(0, 8)})`);
    await db.execute(raw`insert into locations
        (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
      values (${L1}, ${tenantId}, 'Clinica Um (teste)', '08:00', '21:00', 60),
             (${L2}, ${tenantId}, 'Clinica Dois (teste)', '08:00', '21:00', 60)`);
    await db.execute(raw`insert into services
        (id, tenant_id, name, duration_min, is_active, patient_bookable, location_id)
      values (${UM}, ${tenantId}, 'Servico Um (teste)', 60, true, true, null),
             (${AMBOS}, ${tenantId}, 'Servico Ambos (teste)', 60, true, true, null),
             (${NADA}, ${tenantId}, 'Servico Nada (teste)', 60, true, true, null),
             (${NB}, ${tenantId}, 'Servico NB (teste)', 60, true, true, null),
             (${DOIS}, ${tenantId}, 'Servico Dois (teste)', 60, true, true, ${L2}),
             (${EXP}, ${tenantId}, 'Servico Exp (teste)', 60, true, true, null)`);

    const staff: Array<[string, string, boolean, string, string | null]> = [
      [T1, "Terapeuta Um Teste", true, L1, null],
      [T2, "Terapeuta Dois Teste", true, L2, null],
      [TNB, "Terapeuta Nao Marcavel", false, L1, null],
      [TEXP, "Terapeuta Horario Expirado", true, L1, "2000-12-31"],
    ];
    for (const [id, name, bookable, location, validUntil] of staff) {
      await db.execute(raw`insert into users
          (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"qr-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
      for (let weekday = 0; weekday < 7; weekday++) {
        await db.execute(raw`insert into availability_templates
            (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active,
             valid_from, valid_until)
          values (${randomUUID()}, ${tenantId}, ${id}, ${location}, ${weekday}, '09:00', '18:00', true,
                  ${validUntil ? "2000-01-01" : null}::date, ${validUntil}::date)`);
      }
    }

    for (const [therapist, service] of [
      [T1, UM],
      [T1, AMBOS],
      [T2, AMBOS],
      [TNB, NB],
      [T1, DOIS],
      [TEXP, EXP],
    ] as const) {
      await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
        values (${tenantId}, ${therapist}, ${service})`);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from therapist_services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("both clinics are listed (each has somebody bookable with hours)", async () => {
    expect((await catalog()).locations.map((l) => l.id).sort()).toEqual([L1, L2].sort());
  });

  it("a service with a ticked bookable therapist is shown, at that therapist's clinic only", async () => {
    const m = await listed();
    expect(m.get(UM)).toEqual([L1]);
  });

  it("a service ticked at both clinics is shown at both", async () => {
    expect((await listed()).get(AMBOS)).toEqual([L1, L2].sort());
  });

  it("a service nobody is ticked for is hidden, not sent with an empty clinic list", async () => {
    // The portal reads an empty locationIds as "every clinic", so the service
    // must be absent, never present with [].
    const services = (await catalog()).services;
    expect(services.map((s) => s.id)).not.toContain(NADA);
    expect(services.every((s) => s.locationIds.length > 0)).toBe(true);
  });

  it("a service ticked only for a NON-bookable therapist is hidden", async () => {
    expect((await listed()).has(NB)).toBe(false);
  });

  it("control: the same service is shown once that therapist is bookable", async () => {
    await db.execute(raw`update users set is_bookable = true where id = ${TNB} and tenant_id = ${tenantId}`);
    try {
      expect((await listed()).get(NB)).toEqual([L1]);
    } finally {
      await db.execute(raw`update users set is_bookable = false where id = ${TNB} and tenant_id = ${tenantId}`);
    }
  });

  it("a clinic-bound service ticked only for a therapist at ANOTHER clinic is hidden", async () => {
    expect((await listed()).has(DOIS)).toBe(false);
  });

  it("control: the same service is shown once a therapist at its own clinic is ticked", async () => {
    await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
      values (${tenantId}, ${T2}, ${DOIS})`);
    try {
      expect((await listed()).get(DOIS)).toEqual([L2]);
    } finally {
      await db.execute(raw`delete from therapist_services
        where tenant_id = ${tenantId} and therapist_user_id = ${T2} and service_id = ${DOIS}`);
    }
  });

  it("a service whose only ticked therapist has no schedule valid today is hidden (the roster's own rule)", async () => {
    expect((await listed()).has(EXP)).toBe(false);
  });

  it("parity: for every service and clinic, the catalog lists the pair exactly when the therapist step names somebody", async () => {
    const m = await listed();
    const mismatches: string[] = [];
    for (const serviceId of ALL_SERVICES) {
      for (const locationId of [L1, L2]) {
        const roster = await realStore.listBookableTherapists(principal(), { serviceId, locationId });
        const inCatalog = m.get(serviceId)?.includes(locationId) ?? false;
        // DOIS is bound to Clinica Dois: the store's roster does not read the
        // binding (the booking layer refuses the pair first), so at Clinica Um
        // it is out of the catalog whatever the roster says.
        const expected = serviceId === DOIS && locationId === L1 ? false : roster.length > 0;
        if (inCatalog !== expected) mismatches.push(`${serviceId}@${locationId}`);
      }
    }
    expect(mismatches).toEqual([]);
    // Not vacuous: some pairs are listed and some are not.
    expect([...m.values()].flat().length).toBeGreaterThanOrEqual(3);
  });
});
