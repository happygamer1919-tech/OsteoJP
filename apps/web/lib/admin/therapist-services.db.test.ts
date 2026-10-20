/**
 * therapist-services.db.test.ts - Q-M (owner ruling, 2026-10-20): reception
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

  /** What the staff drawer preselects: the first id of its own read. */
  const staffPreselection = async (): Promise<string | undefined> =>
    (await getTherapistServiceIds(actor, therapist))[0];
  const mappedSet = async (): Promise<string[]> =>
    [...(await getTherapistServiceIds(actor, therapist))].sort();

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ setTherapistPrimaryService, setTherapistServices, listTherapistPrimaries } = await import(
      "./therapist-primary-service"
    ));
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
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, role_id, email, full_name, is_bookable)
            values (${id}::uuid, ${tenant}::uuid, ${role}::uuid,
                    ${`${label}-${id.slice(0, 8)}@qm.test`}, ${`${label} QM`}, ${label === "terapeuta"})`,
      );
    }
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, is_active)
          values (${osteo}::uuid, ${tenant}::uuid, 'Osteopatia QM', 60, true),
                 (${fisio}::uuid, ${tenant}::uuid, 'Fisioterapia QM', 60, true),
                 (${acup}::uuid, ${tenant}::uuid, 'Acupuntura QM', 60, true),
                 (${archived}::uuid, ${tenant}::uuid, 'Arquivado QM', 60, true)`,
    );

    // The primary is set the way Equipa sets it today, in its own transaction.
    await setTherapistPrimaryService(actor, therapist, osteo);
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
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
});
