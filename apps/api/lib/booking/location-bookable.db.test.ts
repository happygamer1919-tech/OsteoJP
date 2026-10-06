/**
 * location-bookable.db.test.ts - R45 item 1, AGAINST A REAL POSTGRES.
 *
 * Strategy's gate G1: "portal with a test location that has no bookable
 * therapist. EXPECT: not listed anywhere patient-facing."
 *
 * ==========================================================================
 * WHY IT RUNS ON A DATABASE
 * ==========================================================================
 * The rule is one SQL fragment (`location-bookable.ts`) correlated on the outer
 * query's `locations` row. Whether that correlation resolves, in a WHERE and in
 * the ON of a join, is a fact about the SQL the query builder emits, and a mock
 * cannot say. `sellable.test.ts` proves the fragment is CALLED in both public
 * files; this proves what it RETURNS, through all four doors that decide what a
 * patient may see or send:
 *
 *   1. the logged-in catalogue        (`store.getCatalog`)
 *   2. the logged-in write guard      (`store.isBookableLocation`)
 *   3. the public form's catalogue    (`GET booking/guest/catalog`)
 *   4. the public form's submit check (`isGuestSellable`)
 *
 * ==========================================================================
 * ONE LOCATION PER REASON
 * ==========================================================================
 * Each hidden location fails exactly one term of the rule and passes every
 * other, so removing a term from the fragment turns exactly one arm red. Two
 * locations are listed: the staffed one, which is the positive control without
 * which every "is hidden" assertion would pass on an empty result, and the one
 * whose only schedule row has expired, which pins the decision that the rule
 * carries no date.
 *
 * GATING: needs a live DATABASE_URL with migrations applied (see
 * .github/workflows/db-tests.yml, which runs `vitest run .db.test.ts` in this
 * app). Skipped without one.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** Every fixture location, by the one thing that is true or false about it. */
const CASES = [
  { key: "staffed", listed: true, why: "a bookable therapist has active hours there" },
  { key: "expiredHours", listed: true, why: "the rule carries no date, so an expired window still counts" },
  { key: "noHours", listed: false, why: "nobody has a schedule row there" },
  { key: "inactiveHours", listed: false, why: "the only schedule row is switched off" },
  { key: "inactiveUser", listed: false, why: "the only person with hours is deactivated" },
  { key: "notBookable", listed: false, why: "the only person with hours is not bookable" },
  { key: "sharedResource", listed: false, why: "the only bookable user with hours is a shared resource" },
  { key: "archived", listed: false, why: "the location itself is archived, staffed or not" },
  // The two tenant terms of the fragment. Nothing in the application writes
  // either shape; they are here so that neither term can be dropped unnoticed.
  { key: "foreignHours", listed: false, why: "the only schedule row there belongs to another tenant" },
  { key: "foreignUser", listed: false, why: "the only schedule row there names another tenant's user" },
] as const;

type CaseKey = (typeof CASES)[number]["key"];

d("R45: a location with no bookable therapist is not offered to a patient", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let store: typeof import("@/lib/appointments/store").drizzleAppointmentsStore;
  let isGuestSellable: typeof import("./sellable").isGuestSellable;
  let guestCatalog: typeof import("@/app/api/v1/booking/guest/catalog/route").GET;

  let tenantId: string;
  let otherTenantId: string;
  let otherTenantLocationId: string;
  let patientId: string;
  let serviceId: string;
  let serviceOnlyAtNoHoursId: string;
  const loc = {} as Record<CaseKey, string>;

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  const listedKeys = (ids: string[]): CaseKey[] =>
    CASES.map((c) => c.key).filter((key) => ids.includes(loc[key]));

  const expectedListed = CASES.filter((c) => c.listed).map((c) => c.key);

  async function insertUser(
    tenant: string,
    flags: { isActive?: boolean; isBookable?: boolean; isSharedResource?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    await db.execute(raw`insert into users
        (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values (${id}, ${tenant}, ${"u-" + id.slice(0, 8) + "@r45.test"}, 'Pessoa de Teste',
              ${flags.isActive ?? true}, ${flags.isBookable ?? true},
              ${flags.isSharedResource ?? false})`);
    return id;
  }

  async function insertHours(
    tenant: string,
    userId: string,
    locationId: string,
    row: { isActive?: boolean; validUntil?: string | null } = {},
  ): Promise<void> {
    await db.execute(raw`insert into availability_templates
        (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active, valid_until)
      values (${randomUUID()}, ${tenant}, ${userId}, ${locationId}, 1, '09:00', '18:00',
              ${row.isActive ?? true}, ${row.validUntil ?? null}::date)`);
  }

  async function publicCatalog(): Promise<{
    locations: { id: string }[];
    services: { id: string; locationIds: string[] }[];
  }> {
    const res = await guestCatalog(
      new Request(`https://api.test/api/v1/booking/guest/catalog?tenantId=${tenantId}`, {
        // A source of its own, so the route's per-source limit never reads
        // another suite's calls.
        headers: { "x-forwarded-for": `198.51.100.${1 + Math.floor(Math.random() * 250)}` },
      }),
    );
    expect(res.status).toBe(200);
    return (await res.json()) as Awaited<ReturnType<typeof publicCatalog>>;
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    ({ drizzleAppointmentsStore: store } = await import("@/lib/appointments/store"));
    ({ isGuestSellable } = await import("./sellable"));
    ({ GET: guestCatalog } = await import("@/app/api/v1/booking/guest/catalog/route"));

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    patientId = randomUUID();
    serviceId = randomUUID();
    serviceOnlyAtNoHoursId = randomUUID();

    for (const [id, name] of [
      [tenantId, "R45 Clinica"],
      [otherTenantId, "R45 Outra Clinica"],
    ] as const) {
      await db.execute(raw`insert into tenants (id, name, slug)
        values (${id}, ${name}, ${"r45-" + id.slice(0, 8)})`);
    }

    for (const c of CASES) {
      loc[c.key] = randomUUID();
      await db.execute(raw`insert into locations (id, tenant_id, name, is_active)
        values (${loc[c.key]}, ${tenantId}, ${"Local " + c.key}, ${c.key !== "archived"})`);
    }

    await db.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientId}, ${tenantId}, 'Paciente de Teste')`);

    // One person per location, each differing from the staffed one in exactly
    // one way. `noHours` gets nobody at all.
    await insertHours(tenantId, await insertUser(tenantId), loc.staffed);
    await insertHours(tenantId, await insertUser(tenantId), loc.expiredHours, {
      validUntil: "2020-01-01",
    });
    await insertHours(tenantId, await insertUser(tenantId), loc.inactiveHours, { isActive: false });
    await insertHours(tenantId, await insertUser(tenantId, { isActive: false }), loc.inactiveUser);
    await insertHours(tenantId, await insertUser(tenantId, { isBookable: false }), loc.notBookable);
    await insertHours(
      tenantId,
      await insertUser(tenantId, { isSharedResource: true }),
      loc.sharedResource,
    );
    await insertHours(tenantId, await insertUser(tenantId), loc.archived);

    // ANOTHER TENANT, fully staffed. Its location must never surface in this
    // tenant's lists, and its therapist must never staff this tenant's clinics.
    otherTenantLocationId = randomUUID();
    await db.execute(raw`insert into locations (id, tenant_id, name)
      values (${otherTenantLocationId}, ${otherTenantId}, 'Local de outra clinica')`);
    await insertHours(otherTenantId, await insertUser(otherTenantId), otherTenantLocationId);

    // A schedule row filed under the OTHER tenant at this tenant's location, and
    // one filed under this tenant for the other tenant's user.
    await insertHours(otherTenantId, await insertUser(otherTenantId), loc.foreignHours);
    await insertHours(tenantId, await insertUser(otherTenantId), loc.foreignUser);

    // A patient-bookable service priced at EVERY location of this tenant, so the
    // only thing that can keep a location out of a list is the location itself.
    await db.execute(raw`insert into services
        (id, tenant_id, name, duration_min, price_cents, patient_bookable, internal_only)
      values (${serviceId}, ${tenantId}, 'Osteopatia', 60, 5000, true, false)`);
    for (const c of CASES) {
      await db.execute(raw`insert into service_location_prices
          (id, tenant_id, service_id, location_id, price_cents)
        values (${randomUUID()}, ${tenantId}, ${serviceId}, ${loc[c.key]}, 5000)`);
    }

    // And one priced ONLY where nobody works, to prove it leaves the public
    // list with its location instead of staying as a row nobody can pick.
    await db.execute(raw`insert into services
        (id, tenant_id, name, duration_min, price_cents, patient_bookable, internal_only)
      values (${serviceOnlyAtNoHoursId}, ${tenantId}, 'Fisioterapia', 60, 5000, true, false)`);
    await db.execute(raw`insert into service_location_prices
        (id, tenant_id, service_id, location_id, price_cents)
      values (${randomUUID()}, ${tenantId}, ${serviceOnlyAtNoHoursId}, ${loc.noHours}, 5000)`);
  });

  afterAll(async () => {
    if (!db) return;
    // TABLE BY TABLE ACROSS BOTH TENANTS, not tenant by tenant: the two
    // cross-tenant schedule rows reference the other tenant's user or this
    // tenant's location, so each table has to be empty for both before the
    // table it points at is touched.
    const both = [tenantId, otherTenantId];
    for (const t of both) await db.execute(raw`delete from service_location_prices where tenant_id = ${t}`);
    for (const t of both) await db.execute(raw`delete from services where tenant_id = ${t}`);
    for (const t of both) await db.execute(raw`delete from availability_templates where tenant_id = ${t}`);
    for (const t of both) await db.execute(raw`delete from patients where tenant_id = ${t}`);
    for (const t of both) await db.execute(raw`delete from users where tenant_id = ${t}`);
    for (const t of both) await db.execute(raw`delete from locations where tenant_id = ${t}`);
    for (const t of both) await db.execute(raw`delete from tenants where id = ${t}`);
  });

  it("the fixture holds what the arms below assume (guards a vacuous pass)", async () => {
    const [counts] = (await db.execute(raw`
      select (select count(*)::int from locations where tenant_id = ${tenantId}) as locations,
             (select count(*)::int from availability_templates where tenant_id = ${tenantId}) as hours,
             (select count(*)::int from service_location_prices where tenant_id = ${tenantId}) as prices
    `)) as unknown as [{ locations: number; hours: number; prices: number }];
    // `noHours` has no schedule row, and `foreignHours` has one that is filed
    // under the other tenant, so this tenant holds two fewer rows than locations.
    expect(counts).toEqual({ locations: CASES.length, hours: CASES.length - 2, prices: CASES.length + 1 });
  });

  it("door 1, the logged-in catalogue lists exactly the two staffed locations", async () => {
    const catalog = await store.getCatalog(principal());
    expect(listedKeys(catalog.locations.map((l) => l.id)).sort()).toEqual([...expectedListed].sort());
    expect(catalog.locations.map((l) => l.id)).not.toContain(otherTenantLocationId);
    // A service bound to no location is offered at the listed locations only.
    const service = catalog.services.find((s) => s.id === serviceId);
    expect(listedKeys(service?.locationIds ?? []).sort()).toEqual([...expectedListed].sort());
  });

  for (const c of CASES) {
    it(`door 2, the logged-in write guard ${c.listed ? "accepts" : "refuses"} "${c.key}": ${c.why}`, async () => {
      expect(await store.isBookableLocation(principal(), loc[c.key])).toBe(c.listed);
    });
  }

  it("door 2 refuses another tenant's staffed location", async () => {
    expect(await store.isBookableLocation(principal(), otherTenantLocationId)).toBe(false);
  });

  it("door 3, the public catalogue lists exactly the two staffed locations", async () => {
    const body = await publicCatalog();
    expect(listedKeys(body.locations.map((l) => l.id)).sort()).toEqual([...expectedListed].sort());
    expect(body.locations.map((l) => l.id)).not.toContain(otherTenantLocationId);
  });

  it("door 3 offers a service only at listed locations, and drops one offered nowhere else", async () => {
    const body = await publicCatalog();
    const service = body.services.find((s) => s.id === serviceId);
    expect(listedKeys(service?.locationIds ?? []).sort()).toEqual([...expectedListed].sort());
    // Priced only where nobody works: it must not be a row nobody can pick.
    expect(body.services.map((s) => s.id)).not.toContain(serviceOnlyAtNoHoursId);
  });

  for (const c of CASES) {
    it(`door 4, the public submit check ${c.listed ? "accepts" : "refuses"} "${c.key}"`, async () => {
      expect(await isGuestSellable({ tenantId, serviceId, locationId: loc[c.key] })).toBe(c.listed);
    });
  }

  it("door 4 refuses a service at the location where nobody works, though it is priced there", async () => {
    expect(
      await isGuestSellable({ tenantId, serviceId: serviceOnlyAtNoHoursId, locationId: loc.noHours }),
    ).toBe(false);
  });

  it("THE LIST AND THE SUBMIT CHECK AGREE on every location, which is the point of one fragment", async () => {
    const body = await publicCatalog();
    const listed = new Set(body.locations.map((l) => l.id));
    for (const c of CASES) {
      const accepted = await isGuestSellable({ tenantId, serviceId, locationId: loc[c.key] });
      expect(accepted, `"${c.key}" is listed=${listed.has(loc[c.key])} but accepted=${accepted}`).toBe(
        listed.has(loc[c.key]),
      );
    }
  });

  it("giving the unstaffed location a bookable therapist lists it, through all four doors", async () => {
    // The other half of every refusal above: the location was hidden for want
    // of a therapist and for no other reason.
    const before = await publicCatalog();
    expect(before.locations.map((l) => l.id)).not.toContain(loc.noHours);

    await insertHours(tenantId, await insertUser(tenantId), loc.noHours);

    expect((await store.getCatalog(principal())).locations.map((l) => l.id)).toContain(loc.noHours);
    expect(await store.isBookableLocation(principal(), loc.noHours)).toBe(true);
    const after = await publicCatalog();
    expect(after.locations.map((l) => l.id)).toContain(loc.noHours);
    expect(after.services.map((s) => s.id)).toContain(serviceOnlyAtNoHoursId);
    expect(await isGuestSellable({ tenantId, serviceId, locationId: loc.noHours })).toBe(true);
  });
});
