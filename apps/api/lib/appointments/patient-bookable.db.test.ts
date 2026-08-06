/**
 * patient-bookable.db.test.ts — W13-04 / migration 0057, against a REAL Postgres.
 *
 * ONE QUESTION, AND IT IS THE ONE LOOP 4 MADE A DEFINITION-OF-DONE LINE:
 * "The backfill must not change what any patient can book on the day it
 * applies. Prove that in the DoD."
 *
 * W13-04 UPDATE: the allowlist this compares against is DELETED from the
 * application and is now frozen in this file as ALLOWLIST_AT_0057. The test is
 * therefore about the MIGRATION, which still runs on every fresh database, and
 * no longer about live behaviour — live behaviour is the column's value, which
 * JP's ruling deliberately widened beyond these four names.
 *
 * That is not provable against a mock. It is a claim that a SQL expression —
 * translate/lower/btrim/regexp_replace — agrees with a TypeScript function,
 * `normalizeServiceName`, on real rows. Two implementations of one rule in two
 * languages is exactly the shape that drifts, so the test drives real service
 * names through both and compares.
 *
 * THE FIXTURE NAMES ARE THE INTERESTING CASES, not tidy ones: accented,
 * upper-cased, double-spaced, padded, and near-misses that must stay FALSE.
 * A backfill that matched "Osteopatia Desportiva" because it starts with the
 * right word would quietly widen what patients can book, which is the failure
 * direction that matters.
 *
 * GATING: needs a live DATABASE_URL with migrations applied (see
 * .github/workflows/db-tests.yml). Skipped without one, and hard-required by
 * .github/scripts/assert-rls-executed.mjs so the skip cannot pass silently.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { normalizeServiceName } from "./services";

/**
 * THE ALLOWLIST AS IT WAS, frozen here on purpose.
 *
 * W13-04 deleted `isBookableServiceName` and the four names behind it, which is
 * what this test used to compare the backfill against. The comparison still has
 * a subject: migration 0057 is a committed file that runs on every fresh
 * database, so "its SQL reproduces the rule that was live the day it was
 * authored" stays a checkable claim about a migration.
 *
 * It is a HISTORICAL CONSTANT, not a rule. Nothing in the application reads it,
 * and nothing should: what a patient may book today is the column's value, set
 * from JP's ruling, and it deliberately no longer matches these four names.
 */
const ALLOWLIST_AT_0057 = [
  "osteopatia",
  "fisioterapia",
  "massagem terapeutica",
  "pilates terapeutico",
];

/** What `isBookableServiceName` did, reconstructed from the constant above. */
function wasBookableAt0057(name: string): boolean {
  return ALLOWLIST_AT_0057.includes(normalizeServiceName(name));
}

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/**
 * Every shape the clinic's catalog actually contains, plus the traps.
 * `expected` is what the ALLOWLIST decides today — the behaviour the backfill
 * must reproduce exactly, computed by the allowlist itself rather than restated,
 * so a change to either side has to be deliberate.
 */
const NAMES = [
  "Osteopatia",
  "osteopatia",
  "  OSTEOPATIA  ",
  "Fisioterapia",
  "Massagem Terapêutica",
  "massagem terapeutica",
  "Massagem  Terapêutica", // double space
  "Pilates Terapêutico",
  "PILATES TERAPEUTICO",
  // Near misses. All must stay false.
  "Osteopatia Desportiva",
  "Massagem de Relaxamento",
  "Diversos",
  "RPG",
  "Sessão Família",
  "Massagem 4 Mãos",
];

d("0057 backfill: patient_bookable reproduces the name allowlist exactly", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();

    tenantId = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Bookable Co', ${"bk-" + tenantId.slice(0, 8)})`);

    for (const name of NAMES) {
      await db.execute(raw`insert into services (id, tenant_id, name, duration_min, price_cents)
        values (${randomUUID()}, ${tenantId}, ${name}, 60, 5000)`);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /** The migration's own expression, re-run over the fixture rows. */
  async function backfillWouldMatch(): Promise<Map<string, boolean>> {
    const rows = await db.execute(raw`
      select "name",
             regexp_replace(
               btrim(lower(translate("name",
                 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))),
               '\\s+', ' ', 'g'
             ) IN ('osteopatia','fisioterapia','massagem terapeutica','pilates terapeutico')
             AS matched
        from services
       where tenant_id = ${tenantId}`);
    return new Map(rows.map((r) => [r.name as string, r.matched as boolean]));
  }

  it("agrees with the allowlist it was written from, on EVERY fixture name", async () => {
    const matched = await backfillWouldMatch();
    const disagreements = NAMES.filter(
      (name) => matched.get(name) !== wasBookableAt0057(name),
    );
    // Named, not counted: a failure should say WHICH service changed hands.
    expect(disagreements).toEqual([]);
  });

  it("is not vacuous - the fixture contains both answers", async () => {
    // A comparison over rows that are all false passes while proving nothing.
    const matched = await backfillWouldMatch();
    const values = [...matched.values()];
    expect(values.filter(Boolean).length).toBeGreaterThan(0);
    expect(values.filter((v) => !v).length).toBeGreaterThan(0);
  });

  it("does not widen: a service whose name merely CONTAINS an allowed one stays false", async () => {
    const matched = await backfillWouldMatch();
    expect(matched.get("Osteopatia Desportiva")).toBe(false);
    expect(matched.get("Massagem de Relaxamento")).toBe(false);
    expect(wasBookableAt0057("Osteopatia Desportiva")).toBe(false);
  });

  it("normalizes accents, case and whitespace the same way the application does", async () => {
    const matched = await backfillWouldMatch();
    for (const name of ["Massagem Terapêutica", "Massagem  Terapêutica", "PILATES TERAPEUTICO", "  OSTEOPATIA  "]) {
      expect([name, matched.get(name)]).toEqual([name, true]);
    }
  });

  it("the column exists, defaults false, and carries its index", async () => {
    const col = await db.execute(raw`
      select column_name, is_nullable, column_default
        from information_schema.columns
       where table_name = 'services' and column_name = 'patient_bookable'`);
    expect(col).toHaveLength(1);
    expect(col[0]!.is_nullable).toBe("NO");
    expect(String(col[0]!.column_default)).toContain("false");

    const idx = await db.execute(raw`
      select indexname from pg_indexes
       where tablename = 'services' and indexname = 'services_tenant_patient_bookable_idx'`);
    expect(idx).toHaveLength(1);
  });

  it("a NEW service is not self-bookable until someone says so", async () => {
    // Fail-closed, matching 0046's is_bookable default. A service missing from
    // the portal is a phone call; one appearing that was never offered is a
    // patient booking something the clinic does not sell.
    const id = randomUUID();
    await db.execute(raw`insert into services (id, tenant_id, name, duration_min, price_cents)
      values (${id}, ${tenantId}, 'Serviço Novo', 30, 1000)`);
    const rows = await db.execute(raw`select patient_bookable from services where id = ${id}`);
    expect(rows[0]!.patient_bookable).toBe(false);
    await db.execute(raw`delete from services where id = ${id}`);
  });
});

/**
 * W13-04 — THE REFUSAL, AGAINST REAL ROWS.
 *
 * The unit layer in `internal-only-refusal.test.ts` proves the predicate refuses
 * and that both write paths call it. What only a database can prove is that the
 * VALUES reaching the predicate are the ones the row actually holds: Drizzle
 * maps `internal_only` to `internalOnly`, and a mis-mapped or unselected column
 * arrives as `undefined`, which is falsy, which passes the check for every row.
 * That failure is invisible to a mock and green in CI.
 */
d("W13-04: getBookableService refuses what a patient may not book", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  const ids = {
    ok: randomUUID(),
    internal: randomUUID(),
    notBookable: randomUUID(),
    inactive: randomUUID(),
  };

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    tenantId = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Refusal Co', ${"rf-" + tenantId.slice(0, 8)})`);

    // The four rows the production catalog actually contains, in miniature.
    await db.execute(raw`insert into services
      (id, tenant_id, name, duration_min, price_cents, is_active, internal_only, patient_bookable)
      values
        (${ids.ok},          ${tenantId}, 'Osteopatia/Posturologia', 55, 7000, true,  false, true),
        (${ids.internal},    ${tenantId}, 'Diversos',                55,    0, true,  true,  true),
        (${ids.notBookable}, ${tenantId}, 'NESA',                    60, 5000, true,  false, false),
        (${ids.inactive},    ${tenantId}, '-',                       60,    0, false, false, true)`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  async function resolve(serviceId: string) {
    const { drizzleAppointmentsStore } = await import("./store");
    return drizzleAppointmentsStore.getBookableService(
      { tenantId, patientId: randomUUID(), role: "patient" } as never,
      serviceId,
    );
  }

  it("resolves a service JP opened to patients", async () => {
    // The positive control. Without it every assertion below could pass because
    // the function returns null for everything.
    expect(await resolve(ids.ok)).not.toBeNull();
  });

  it("REFUSES internal_only, even though the row says patient_bookable", async () => {
    // The exposure the allowlist was masking by accident: a patient who supplies
    // this id never had to see it in the catalog.
    expect(await resolve(ids.internal)).toBeNull();
  });

  it("REFUSES a service that is not patient_bookable", async () => {
    expect(await resolve(ids.notBookable)).toBeNull();
  });

  it("REFUSES an inactive service", async () => {
    expect(await resolve(ids.inactive)).toBeNull();
  });

  it("REFUSES a service belonging to another tenant", async () => {
    // Not new in W13-04, and asserted here because this is the query that would
    // leak it: the id is real, the tenant is not the caller's.
    const otherTenant = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${otherTenant}, 'Other Co', ${"ot-" + otherTenant.slice(0, 8)})`);
    const foreign = randomUUID();
    await db.execute(raw`insert into services
      (id, tenant_id, name, duration_min, price_cents, is_active, internal_only, patient_bookable)
      values (${foreign}, ${otherTenant}, 'Osteopatia/Posturologia', 55, 7000, true, false, true)`);

    expect(await resolve(foreign)).toBeNull();

    await db.execute(raw`delete from services where tenant_id = ${otherTenant}`);
    await db.execute(raw`delete from tenants where id = ${otherTenant}`);
  });
});
