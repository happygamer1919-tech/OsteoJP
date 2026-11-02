/**
 * in-use-read.db.test.ts: "Packs em uso" against a real database, as each role.
 *
 * WRITTEN, NOT RUN BY ITS AUTHOR (2026-11-02, machine-heat rule: no Docker).
 * It is DB-gated like every *.db.test.ts and runs where DATABASE_URL is set.
 *
 * What it proves that the pure suite cannot:
 *  1. The rows are narrowed by the DATABASE under the viewer's session: a
 *     therapist sees only the pacotes of patients they may open.
 *  2. RESERVADAS counts EVERY consuming visit of the pacote, a colleague's
 *     included (0108's function), not only the visits the therapist's own RLS
 *     shows. An RLS-only count would read 1 here where the truth is 2.
 *  3. A spent pacote with nothing ahead is not listed; a cancelled visit does
 *     not count; a soft-deleted patient's pacote is not listed.
 *  4. The search narrows the rows and leaves the count alone.
 *
 * Fixture built, never borrowed (memory: the CI database has no catalogue), and
 * every id is run-scoped.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("Packs em uso: what each role reads", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPacksInUse: typeof import("./in-use-read").listPacksInUse;

  const tenant = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  const pack = randomUUID();
  const spentPack = randomUUID();
  const owner = randomUUID();
  const reception = randomUUID();
  const therapistA = randomUUID();
  const therapistB = randomUUID();
  /** Treated by A (and by B once). */
  const ana = randomUUID();
  /** Treated only by B. */
  const bruno = randomUUID();
  /** Soft-deleted: never listed. */
  const gone = randomUUID();
  // Opened in beforeAll by the application's own writer, which picks the ids.
  let anaPack = "";
  let anaSpent = "";
  let brunoPack = "";
  let gonePack = "";

  const now = Date.now();
  const at = (days: number) => new Date(now + days * 86_400_000);

  const actor = (role: "owner" | "reception" | "therapist", userId: string) => ({
    tenantId: tenant,
    role,
    userId,
  });

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ listPacksInUse } = await import("./in-use-read"));
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`insert into public.tenants (id, name, slug) values (${tenant}, 'packs-in-use', ${`piu-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(sql`insert into public.locations (id, tenant_id, name) values (${location}, ${tenant}, 'LV (teste)')`);
    for (const [id, name] of [
      [owner, "Dono"],
      [reception, "Rececao"],
      [therapistA, "Terapeuta A"],
      [therapistB, "Terapeuta B"],
    ] as const) {
      await db.execute(
        sql`insert into public.users (id, tenant_id, email, full_name, is_active, is_bookable)
            values (${id}, ${tenant}, ${`u-${id.slice(0, 8)}@piu.test`}, ${name}, true, true)`,
      );
    }
    await db.execute(
      sql`insert into public.services (id, tenant_id, name, duration_min, is_active)
          values (${service}, ${tenant}, 'Fisioterapia (teste)', 45, true)`,
    );
    await db.execute(
      sql`insert into public.service_packs (id, tenant_id, base_service_id, name, session_count, price_cents)
          values (${pack}, ${tenant}, ${service}, 'Fisioterapia 10', 10, 45000),
                 (${spentPack}, ${tenant}, ${service}, 'Fisioterapia 2', 2, 9000)`,
    );
    await db.execute(
      sql`insert into public.patients (id, tenant_id, full_name) values
            (${ana}, ${tenant}, 'Ana Teste Pacote'),
            (${bruno}, ${tenant}, 'Bruno Teste Pacote')`,
    );
    await db.execute(
      sql`insert into public.patients (id, tenant_id, full_name, deleted_at)
          values (${gone}, ${tenant}, 'Apagado Teste Pacote', now())`,
    );
    // The instances are opened by the application's own writer, as a pacote
    // booking opens them. The frozen-column guard
    // (scripts/pack-sessions-remaining-is-frozen.test.mjs) admits that one
    // writer, so this suite never names the pre-0067 column itself.
    const { runScoped } = await import("@/lib/auth/context");
    const { bookPackSessionTx } = await import("./instances");
    const open = async (patient: string, packId: string): Promise<string> => {
      const a = actor("owner", owner);
      const r = await runScoped(a, (tx) => bookPackSessionTx(tx, a, patient, packId));
      if (!r || !r.registered) throw new Error("fixture: the instance was not opened");
      return r.instanceId;
    };
    anaPack = await open(ana, pack);
    anaSpent = await open(ana, spentPack);
    brunoPack = await open(bruno, pack);
    gonePack = await open(gone, pack);

    const appt = (patient: string, practitioner: string, days: number, status: string, inst: string | null) => {
      const start = at(days);
      const end = new Date(start.getTime() + 45 * 60_000);
      return db.execute(
        sql`insert into public.appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
               starts_at, ends_at, status, pack_instance_id, created_by)
            values (${randomUUID()}, ${tenant}, ${patient}, ${practitioner}, ${location}, ${service},
                    ${start}, ${end}, ${status}, ${inst}, ${owner})`,
      );
    };
    // Ana's 10-pack: one past visit with A, one future visit with B (A's
    // colleague), and one CANCELLED visit, which must not count.
    await appt(ana, therapistA, -3, "completed", anaPack);
    await appt(ana, therapistB, 7, "scheduled", anaPack);
    await appt(ana, therapistA, 9, "cancelled", anaPack);
    // Ana's 2-pack: both sessions spent, both in the past. Not in use.
    await appt(ana, therapistA, -20, "completed", anaSpent);
    await appt(ana, therapistA, -13, "no_show", anaSpent);
    // Bruno: B only.
    await appt(bruno, therapistB, 2, "scheduled", brunoPack);
    // The deleted patient has a visit too, so only the delete keeps it off.
    await appt(gone, therapistA, 4, "scheduled", gonePack);
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    for (const stmt of [
      sql`delete from public.audit_log where tenant_id = ${tenant}`,
      sql`delete from public.appointments where tenant_id = ${tenant}`,
      sql`delete from public.patient_pack_instances where tenant_id = ${tenant}`,
      sql`delete from public.patients where tenant_id = ${tenant}`,
      sql`delete from public.service_packs where tenant_id = ${tenant}`,
      sql`delete from public.services where tenant_id = ${tenant}`,
      sql`delete from public.users where tenant_id = ${tenant}`,
      sql`delete from public.locations where tenant_id = ${tenant}`,
      sql`delete from public.tenants where id = ${tenant}`,
    ]) {
      await db.execute(stmt);
    }
  });

  it("owner: both running pacotes, A to Z; the spent one and the deleted patient's are not listed", async () => {
    const page = await listPacksInUse(actor("owner", owner), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, brunoPack]);
    expect(page.totalInUse).toBe(2);
  });

  it("owner: RESERVADAS 2 and LIVRES 8 on Ana's pacote (the cancelled visit is not counted)", async () => {
    const page = await listPacksInUse(actor("owner", owner), "");
    const row = page.rows.find((r) => r.instanceId === anaPack)!;
    expect(row.reserved).toBe(2);
    expect(row.free).toBe(8);
    expect(row.done).toBe(1);
    expect(row.upcoming).toBe(1);
    expect(row.packPriceCents).toBe(45000);
  });

  it("reception (no clinic row): the same two pacotes", async () => {
    const page = await listPacksInUse(actor("reception", reception), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, brunoPack]);
  });

  it("therapist A: only Ana's pacote, and RESERVADAS still counts B's visit", async () => {
    const page = await listPacksInUse(actor("therapist", therapistA), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack]);
    expect(page.rows[0]!.reserved).toBe(2);
    expect(page.rows[0]!.sessions).toHaveLength(2);
  });

  it("therapist B: Ana (treated once) and Bruno", async () => {
    const page = await listPacksInUse(actor("therapist", therapistB), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, brunoPack]);
  });

  it("search narrows the rows and leaves the count", async () => {
    const page = await listPacksInUse(actor("owner", owner), "bruno");
    expect(page.rows.map((r) => r.instanceId)).toEqual([brunoPack]);
    expect(page.totalInUse).toBe(2);
  });
});
