/**
 * therapist-services.db.test.ts - Q-M (owner ruling, 2026-10-20): the owner or an admin
 * ticks SEVERAL services per therapist in Equipa, AND THE STAFF AGENDA'S
 * PRESELECTION DOES NOT MOVE. Proven against a real Postgres, through the real
 * `runScoped`, RLS and audit insert.
 *
 * WHAT THE STAFF SIDE READS. The new-appointment drawer preselects `ids[0]` of
 * `getTherapistServiceIds` (scheduling/therapist-services.ts, oldest-first), and
 * the Equipa card shows `listTherapistPrimaries`' primary. PL-06a (2026-07-28)
 * still governs the staff agenda: the mapping only preselects. So the arms below
 * read the answer through THOSE two functions after every save, not through a
 * query written for the test.
 *
 * THE ORDER IS THE POINT. The primary is the EARLIEST row. A save that deleted
 * and re-inserted the primary, or stamped a new row earlier than it, would move
 * the staff preselection while every row count stayed right. So each arm reads
 * the first id, not a set.
 *
 * NOTHING IS STUBBED BUT `server-only`. Its own tenant, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { RequestContext } from "@osteojp/auth";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("Q-M: several services per therapist, and the staff preselection stays the primary", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let setTherapistPrimaryService: typeof import("./therapist-primary-service").setTherapistPrimaryService;
  let setTherapistServices: typeof import("./therapist-primary-service").setTherapistServices;
  let listTherapistPrimaries: typeof import("./therapist-primary-service").listTherapistPrimaries;
  let getTherapistServiceIds: typeof import("@/lib/scheduling/therapist-services").getTherapistServiceIds;
  let getTherapistPrimaryServiceId: typeof import("./therapist-primary-service").getTherapistPrimaryServiceId;

  const tenant = randomUUID();
  const adminRole = randomUUID();
  const therapistRole = randomUUID();
  const admin = randomUUID();
  const therapist = randomUUID();
  const osteo = randomUUID();
  const fisio = randomUUID();
  const acup = randomUUID();
  const archived = randomUUID();

  const actor: RequestContext = { tenantId: tenant, role: "admin", userId: admin };

  /** A second member whose two mappings share ONE created_at (the tie case). */
  const tied = randomUUID();
  /** Sorts FIRST by id, and is inserted SECOND, so insertion order cannot win. */
  const tieLowId = "00000000-0000-4000-8000-0000000000a1";
  const tieHighId = "ffffffff-ffff-4fff-bfff-fffffffffff1";

  /** Another tenant: a member and a service this actor must never reach. */
  const otherTenant = randomUUID();
  const otherMember = randomUUID();
  const otherService = randomUUID();

  /** What the staff drawer preselects: the first id of its own read. */
  const staffPreselection = async (): Promise<string | undefined> =>
    (await getTherapistServiceIds(actor, therapist))[0];
  const mappedSet = async (): Promise<string[]> =>
    [...(await getTherapistServiceIds(actor, therapist))].sort();

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({
      setTherapistPrimaryService,
      setTherapistServices,
      listTherapistPrimaries,
      getTherapistPrimaryServiceId,
    } = await import("./therapist-primary-service"));
    ({ getTherapistServiceIds } = await import("@/lib/scheduling/therapist-services"));

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'qm services', ${"qms-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into roles (id, tenant_id, slug, name)
          values (${adminRole}::uuid, ${tenant}::uuid, 'admin', 'Admin'),
                 (${therapistRole}::uuid, ${tenant}::uuid, 'therapist', 'Therapist')`,
    );
    for (const [id, role, label] of [
      [admin, adminRole, "admin"],
      [therapist, therapistRole, "terapeuta"],
      [tied, therapistRole, "empate"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, role_id, email, full_name, is_bookable)
            values (${id}::uuid, ${tenant}::uuid, ${role}::uuid,
                    ${`${label}-${id.slice(0, 8)}@qm.test`}, ${`${label} QM`}, ${label !== "admin"})`,
      );
    }
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, is_active)
          values (${osteo}::uuid, ${tenant}::uuid, 'Osteopatia QM', 60, true),
                 (${fisio}::uuid, ${tenant}::uuid, 'Fisioterapia QM', 60, true),
                 (${acup}::uuid, ${tenant}::uuid, 'Acupuntura QM', 60, true),
                 (${archived}::uuid, ${tenant}::uuid, 'Arquivado QM', 60, true)`,
    );

    // THE TIE: two rows for `tied` with the SAME created_at, the higher id
    // inserted first. Nothing but an explicit tie-break makes the order stable.
    await db.execute(
      raw`insert into therapist_services (id, tenant_id, therapist_user_id, service_id, created_at)
          values (${tieHighId}::uuid, ${tenant}::uuid, ${tied}::uuid, ${fisio}::uuid, '2026-01-01T09:00:00Z'),
                 (${tieLowId}::uuid, ${tenant}::uuid, ${tied}::uuid, ${osteo}::uuid, '2026-01-01T09:00:00Z')`,
    );

    // Another tenant, out of this actor's reach.
    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${otherTenant}::uuid, 'qm other', ${"qmo-" + otherTenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name, is_bookable)
          values (${otherMember}::uuid, ${otherTenant}::uuid,
                  ${`outro-${otherMember.slice(0, 8)}@qm.test`}, 'outro QM', true)`,
    );
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, is_active)
          values (${otherService}::uuid, ${otherTenant}::uuid, 'Outro Servico QM', 60, true)`,
    );

    // The primary is set the way Equipa sets it today, in its own transaction.
    await setTherapistPrimaryService(actor, therapist, osteo);
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from therapist_services where tenant_id = ${otherTenant}::uuid`,
      raw`delete from services where tenant_id = ${otherTenant}::uuid`,
      raw`delete from users where tenant_id = ${otherTenant}::uuid`,
      raw`delete from tenants where id = ${otherTenant}::uuid`,
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from therapist_services where tenant_id = ${tenant}::uuid`,
      raw`delete from services where tenant_id = ${tenant}::uuid`,
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

  it("the starting point: one mapping, and the staff drawer preselects it", async () => {
    expect(await mappedSet()).toEqual([osteo]);
    expect(await staffPreselection()).toBe(osteo);
  });

  it("ticking TWO more services maps all three, and the staff preselection is still the primary", async () => {
    await setTherapistServices(actor, therapist, [fisio, acup]);
    expect(await mappedSet()).toEqual([osteo, fisio, acup].sort());
    expect(await staffPreselection()).toBe(osteo);
    expect((await listTherapistPrimaries(actor)).get(therapist)?.primaryServiceId).toBe(osteo);
  });

  it("unticking one removes that row only, and the preselection does not move", async () => {
    await setTherapistServices(actor, therapist, [acup]);
    expect(await mappedSet()).toEqual([osteo, acup].sort());
    expect(await staffPreselection()).toBe(osteo);
  });

  it("a post that omits the primary (its checkbox is disabled) keeps it", async () => {
    await setTherapistServices(actor, therapist, []);
    expect(await mappedSet()).toEqual([osteo]);
    expect(await staffPreselection()).toBe(osteo);
  });

  it("each save that changed something is audited, ids and counts only", async () => {
    const rows = (await db.execute(
      raw`select metadata from audit_log
           where tenant_id = ${tenant}::uuid and action = 'therapist.services.set'
             and entity_id = ${therapist}::uuid
           order by created_at`,
    )) as unknown as { metadata: Record<string, number> }[];
    expect(rows.map((r) => r.metadata)).toEqual([
      { added: 2, removed: 0, total: 3 },
      { added: 0, removed: 1, total: 2 },
      { added: 0, removed: 1, total: 1 },
    ]);
  });

  it("a mapping to a service archived since it was ticked is kept by a later save", async () => {
    await setTherapistServices(actor, therapist, [archived]);
    await db.execute(raw`update services set is_active = false where id = ${archived}::uuid`);
    await setTherapistServices(actor, therapist, [fisio]);
    expect(await mappedSet()).toEqual([osteo, fisio, archived].sort());
    expect(await staffPreselection()).toBe(osteo);
  });

  it("control: changing the PRIMARY through its own select does move the preselection", async () => {
    // Without this, every "did not move" arm above could pass on a read that
    // always answered the first service ever inserted.
    await setTherapistPrimaryService(actor, therapist, fisio);
    expect(await staffPreselection()).toBe(fisio);
    expect(await mappedSet()).toEqual([osteo, fisio, archived].sort());
  });

  /* --------------------- the tie on created_at (Q-M review) --------------------- */

  it("TIE: the card, the one-row read and the staff preselection all name the same primary", async () => {
    // Two rows share one created_at; the lower id is the primary by rule.
    const staff = (await getTherapistServiceIds(actor, tied))[0];
    const card = (await listTherapistPrimaries(actor)).get(tied)?.primaryServiceId;
    const one = await getTherapistPrimaryServiceId(actor, tied);
    expect(staff).toBe(osteo);
    expect(card).toBe(osteo);
    expect(one).toBe(osteo);
  });

  it("TIE: a save never deletes the primary; it removes only the unticked other row", async () => {
    // The disabled primary checkbox is not posted, so an empty post is the
    // real "untick everything else".
    await setTherapistServices(actor, tied, []);
    const rows = (await db.execute(
      raw`select id::text as id from therapist_services where therapist_user_id = ${tied}::uuid`,
    )) as unknown as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual([tieLowId]);
    expect((await getTherapistServiceIds(actor, tied))[0]).toBe(osteo);
  });

  /* --------------------------------- refusals -------------------------------- */

  it("refuses a role without users:manage (reception), and writes nothing", async () => {
    const reception: RequestContext = { tenantId: tenant, role: "reception", userId: admin };
    const before = await mappedSet();
    await expect(setTherapistServices(reception, therapist, [acup])).rejects.toThrow();
    expect(await mappedSet()).toEqual(before);
  });

  it("refuses a forged service id, and writes nothing", async () => {
    const before = await mappedSet();
    await expect(setTherapistServices(actor, therapist, [randomUUID()])).rejects.toMatchObject({
      code: "invalid",
    });
    expect(await mappedSet()).toEqual(before);
  });

  it("refuses a service of ANOTHER tenant (RLS hides it), and writes nothing", async () => {
    const before = await mappedSet();
    await expect(setTherapistServices(actor, therapist, [otherService])).rejects.toMatchObject({
      code: "invalid",
    });
    expect(await mappedSet()).toEqual(before);
  });

  it("refuses a member of ANOTHER tenant on both saves, and maps nothing to them", async () => {
    await expect(setTherapistServices(actor, otherMember, [fisio])).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(setTherapistPrimaryService(actor, otherMember, fisio)).rejects.toMatchObject({
      code: "not_found",
    });
    const rows = (await db.execute(
      raw`select count(*)::int as n from therapist_services where therapist_user_id = ${otherMember}::uuid`,
    )) as unknown as { n: number }[];
    expect(rows[0]!.n).toBe(0);
  });
});
