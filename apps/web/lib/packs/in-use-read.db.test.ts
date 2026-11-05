/**
 * in-use-read.db.test.ts: "Packs em uso" against a real database, as each role.
 *
 * WRITTEN, NOT RUN BY ITS AUTHOR (2026-11-02, machine-heat rule: no Docker).
 * It is DB-gated like every *.db.test.ts; CI's DB-gated job is its evidence.
 *
 * What it proves that the pure suite cannot:
 *  1. The rows are narrowed by the DATABASE under the viewer's session:
 *     a therapist sees the pacotes of the patients they treat, a care-team
 *     therapist those of their care-team patients at their clinic, a
 *     receptionist with a clinic those of the patients that clinic reaches.
 *  2. RESERVADAS counts EVERY consuming visit of the pacote, a colleague's
 *     included (0108's function), not only what the viewer's own RLS shows.
 *  3. A spent pacote with nothing ahead is not listed; a spent pacote with a
 *     visit still ahead IS (the "visible upcoming" term of the pre-filter);
 *     a cancelled visit does not count; a soft-deleted patient's pacote is not
 *     listed; a pacote whose patient belongs to another tenant is not listed.
 *  4. The search narrows the rows and leaves the count.
 *  5. PACK-FICHA-01, the ficha's read (`listPatientPacks`): one patient's
 *     pacotes, running and finished, never another patient's, and nothing
 *     for a viewer who cannot read that patient. Added 2026-11-05, written
 *     and not run by its author either (no Docker); CI's DB-gated job runs it.
 *
 * Fixture built, never borrowed (the CI database has no catalogue), and every
 * id is run-scoped. Timestamps go into raw SQL as ISO strings cast to
 * timestamptz: the driver refuses a JS Date in a raw statement
 * (ERR_INVALID_ARG_TYPE), the note lib/followup/record-contact.db.test.ts
 * carries over the same fix.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("Packs em uso: what each role reads", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPacksInUse: typeof import("./in-use-read").listPacksInUse;
  let listPatientPacks: typeof import("./in-use-read").listPatientPacks;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  /** Linda-a-Velha: Ana's visits. */
  const lv = randomUUID();
  /** Castelo Branco: Bruno's visit. */
  const cb = randomUUID();
  const service = randomUUID();
  const pack10 = randomUUID();
  const pack2Spent = randomUUID();
  const pack2Ahead = randomUUID();
  const owner = randomUUID();
  /** Reception with no clinic row: the whole tenant. */
  const reception = randomUUID();
  /** Reception assigned to Castelo Branco only. */
  const receptionCb = randomUUID();
  const therapistA = randomUUID();
  const therapistB = randomUUID();
  /** On Ana's care team, at Linda-a-Velha; treats nobody. */
  const careTherapist = randomUUID();
  /** Treated by A, and by B once. */
  const ana = randomUUID();
  /** Treated only by B, at Castelo Branco. */
  const bruno = randomUUID();
  /** Soft-deleted: never listed. */
  const gone = randomUUID();
  /** A patient of ANOTHER tenant, holding a pacote row in this one. */
  const stranger = randomUUID();

  // Opened in beforeAll by the application's own writer, which picks the ids.
  let anaPack = "";
  let anaSpent = "";
  let anaAhead = "";
  let brunoPack = "";
  let gonePack = "";
  let strangerPack = "";

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
    ({ listPacksInUse, listPatientPacks } = await import("./in-use-read"));
    const { sql } = await import("drizzle-orm");

    await db.execute(
      sql`insert into public.tenants (id, name, slug) values
            (${tenant}, 'packs-in-use', ${`piu-${tenant.slice(0, 8)}`}),
            (${otherTenant}, 'packs-in-use-other', ${`piu-${otherTenant.slice(0, 8)}`})`,
    );
    await db.execute(
      sql`insert into public.locations (id, tenant_id, name) values
            (${lv}, ${tenant}, 'LV (teste)'),
            (${cb}, ${tenant}, 'CB (teste)')`,
    );
    for (const [id, name] of [
      [owner, "Dono"],
      [reception, "Rececao"],
      [receptionCb, "Rececao CB"],
      [therapistA, "Terapeuta A"],
      [therapistB, "Terapeuta B"],
      [careTherapist, "Terapeuta Equipa"],
    ] as const) {
      await db.execute(
        sql`insert into public.users (id, tenant_id, email, full_name, is_active, is_bookable)
            values (${id}, ${tenant}, ${`u-${id.slice(0, 8)}@piu.test`}, ${name}, true, true)`,
      );
    }
    await db.execute(
      sql`insert into public.staff_locations (tenant_id, user_id, location_id) values
            (${tenant}, ${receptionCb}, ${cb}),
            (${tenant}, ${careTherapist}, ${lv})`,
    );
    await db.execute(
      sql`insert into public.services (id, tenant_id, name, duration_min, is_active)
          values (${service}, ${tenant}, 'Fisioterapia (teste)', 45, true)`,
    );
    await db.execute(
      sql`insert into public.service_packs (id, tenant_id, base_service_id, name, session_count, price_cents)
          values (${pack10}, ${tenant}, ${service}, 'Fisioterapia 10', 10, 45000),
                 (${pack2Spent}, ${tenant}, ${service}, 'Fisioterapia 2', 2, 9000),
                 (${pack2Ahead}, ${tenant}, ${service}, 'Osteopatia 2', 2, 13000)`,
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
    await db.execute(
      sql`insert into public.patients (id, tenant_id, full_name)
          values (${stranger}, ${otherTenant}, 'Estranho Teste Pacote')`,
    );
    await db.execute(
      sql`insert into public.patient_care_team (tenant_id, patient_id, user_id, assigned_by)
          values (${tenant}, ${ana}, ${careTherapist}, ${owner})`,
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
    anaPack = await open(ana, pack10);
    anaSpent = await open(ana, pack2Spent);
    anaAhead = await open(ana, pack2Ahead);
    brunoPack = await open(bruno, pack10);
    gonePack = await open(gone, pack10);
    // A row in THIS tenant pointing at the other tenant's patient. The join to
    // `patients` cannot return it to anybody here: patients_select hides the
    // stranger, and the join's own tenant term would too. A fixture cannot
    // tell the two apart; it proves the row is not listed.
    strangerPack = await open(stranger, pack10);

    const appt = (
      patient: string,
      practitioner: string,
      location: string,
      days: number,
      status: string,
      inst: string | null,
    ) => {
      const start = at(days);
      const end = new Date(start.getTime() + 45 * 60_000);
      return db.execute(
        sql`insert into public.appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
               starts_at, ends_at, status, pack_instance_id, created_by)
            values (${randomUUID()}, ${tenant}, ${patient}, ${practitioner}, ${location}, ${service},
                    ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz,
                    ${status}, ${inst}, ${owner})`,
      );
    };
    // Ana's 10-pack at LV: one past visit with A, one future visit with B (A's
    // colleague), and one CANCELLED visit, which must not count.
    await appt(ana, therapistA, lv, -3, "completed", anaPack);
    await appt(ana, therapistB, lv, 7, "scheduled", anaPack);
    await appt(ana, therapistA, lv, 9, "cancelled", anaPack);
    // Ana's spent 2-pack: both sessions used, both in the past. NOT in use.
    await appt(ana, therapistA, lv, -20, "completed", anaSpent);
    await appt(ana, therapistA, lv, -13, "no_show", anaSpent);
    // Ana's other 2-pack: one past, one still ahead. No free session, but in
    // use until the second visit has passed.
    await appt(ana, therapistA, lv, -6, "completed", anaAhead);
    await appt(ana, therapistA, lv, 11, "scheduled", anaAhead);
    // Bruno: B only, at Castelo Branco.
    await appt(bruno, therapistB, cb, 2, "scheduled", brunoPack);
    // The deleted patient has a visit too, so only the delete keeps it off.
    await appt(gone, therapistA, lv, 4, "scheduled", gonePack);
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    for (const stmt of [
      sql`delete from public.audit_log where tenant_id in (${tenant}, ${otherTenant})`,
      sql`delete from public.appointments where tenant_id = ${tenant}`,
      sql`delete from public.patient_pack_instances where tenant_id in (${tenant}, ${otherTenant})`,
      sql`delete from public.patient_care_team where tenant_id = ${tenant}`,
      sql`delete from public.patients where tenant_id in (${tenant}, ${otherTenant})`,
      sql`delete from public.service_packs where tenant_id = ${tenant}`,
      sql`delete from public.services where tenant_id = ${tenant}`,
      sql`delete from public.staff_locations where tenant_id = ${tenant}`,
      sql`delete from public.users where tenant_id = ${tenant}`,
      sql`delete from public.locations where tenant_id = ${tenant}`,
      sql`delete from public.tenants where id in (${tenant}, ${otherTenant})`,
    ]) {
      await db.execute(stmt);
    }
  });

  it("owner: the three running pacotes, A to Z then by pack name", async () => {
    const page = await listPacksInUse(actor("owner", owner), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, anaAhead, brunoPack]);
    expect(page.totalInUse).toBe(3);
    expect(page.truncated).toBe(false);
  });

  it("owner: the spent pacote, the deleted patient's and the other tenant's patient's are not listed", async () => {
    const ids = (await listPacksInUse(actor("owner", owner), "")).rows.map((r) => r.instanceId);
    expect(ids).not.toContain(anaSpent);
    expect(ids).not.toContain(gonePack);
    expect(ids).not.toContain(strangerPack);
  });

  it("owner: a spent pacote with a visit still ahead is listed, LIVRES 0, Por Realizar 1", async () => {
    const row = (await listPacksInUse(actor("owner", owner), "")).rows.find(
      (r) => r.instanceId === anaAhead,
    )!;
    expect(row.free).toBe(0);
    expect(row.reserved).toBe(2);
    expect(row.upcoming).toBe(1);
    expect(row.done).toBe(1);
  });

  it("owner: RESERVADAS 2 and LIVRES 8 on Ana's 10-pack (the cancelled visit is not counted)", async () => {
    const row = (await listPacksInUse(actor("owner", owner), "")).rows.find(
      (r) => r.instanceId === anaPack,
    )!;
    expect(row.reserved).toBe(2);
    expect(row.free).toBe(8);
    expect(row.done).toBe(1);
    expect(row.upcoming).toBe(1);
    expect(row.packPriceCents).toBe(45000);
  });

  it("reception with no clinic row: the same three pacotes", async () => {
    const page = await listPacksInUse(actor("reception", reception), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, anaAhead, brunoPack]);
  });

  it("reception at Castelo Branco: only Bruno's pacote", async () => {
    const page = await listPacksInUse(actor("reception", receptionCb), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([brunoPack]);
    expect(page.totalInUse).toBe(1);
    expect(page.rows[0]!.reserved).toBe(1);
    expect(page.rows[0]!.free).toBe(9);
  });

  it("therapist A: only Ana's pacotes, and RESERVADAS still counts B's visit", async () => {
    const page = await listPacksInUse(actor("therapist", therapistA), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, anaAhead]);
    const row = page.rows.find((r) => r.instanceId === anaPack)!;
    expect(row.reserved).toBe(2);
    expect(row.sessions).toHaveLength(2);
  });

  it("therapist B: Ana (treated once) and Bruno", async () => {
    const page = await listPacksInUse(actor("therapist", therapistB), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, anaAhead, brunoPack]);
  });

  it("care-team therapist at LV: Ana's pacotes in full, not Bruno's", async () => {
    const page = await listPacksInUse(actor("therapist", careTherapist), "");
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, anaAhead]);
    expect(page.rows.find((r) => r.instanceId === anaPack)!.reserved).toBe(2);
  });

  it("the cap: with cap 2 over the 3 running pacotes, the two NEWEST are read and truncated is true", async () => {
    // Opened in this order: anaPack, (anaSpent), anaAhead, brunoPack, so the
    // two newest candidates are anaAhead and brunoPack; anaPack is the one cut.
    const page = await listPacksInUse(actor("owner", owner), "", { cap: 2 });
    expect(page.truncated).toBe(true);
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaAhead, brunoPack]);
    expect(page.totalInUse).toBe(2);
  });

  it("the cap: exactly 3 running pacotes under cap 3 are all read and NOT truncated", async () => {
    const page = await listPacksInUse(actor("owner", owner), "", { cap: 3 });
    expect(page.truncated).toBe(false);
    expect(page.rows.map((r) => r.instanceId)).toEqual([anaPack, anaAhead, brunoPack]);
  });

  it("search narrows the rows and leaves the count", async () => {
    const page = await listPacksInUse(actor("owner", owner), "bruno");
    expect(page.rows.map((r) => r.instanceId)).toEqual([brunoPack]);
    expect(page.totalInUse).toBe(3);
  });

  // ---------------------------------------------------------------------
  // PACK-FICHA-01: the ficha's read, one patient at a time.
  // ---------------------------------------------------------------------
  const ids = (p: { running: { instanceId: string }[]; finished: { instanceId: string }[] }) => ({
    running: p.running.map((r) => r.instanceId),
    finished: p.finished.map((r) => r.instanceId),
  });

  it("ficha, owner on Ana: her two running pacotes, newest first, and the spent one as finished", async () => {
    const page = await listPatientPacks(actor("owner", owner), ana);
    expect(ids(page)).toEqual({ running: [anaAhead, anaPack], finished: [anaSpent] });
    expect(page.truncated).toBe(false);
    const spent = page.finished[0]!;
    expect(spent.reserved).toBe(2);
    expect(spent.free).toBe(0);
    expect(spent.sessions).toHaveLength(2);
  });

  it("ficha: the numbers match Packs em uso for the same pacote", async () => {
    const ficha = (await listPatientPacks(actor("owner", owner), ana)).running.find(
      (r) => r.instanceId === anaPack,
    )!;
    const list = (await listPacksInUse(actor("owner", owner), "")).rows.find((r) => r.instanceId === anaPack)!;
    expect(ficha.reserved).toBe(list.reserved);
    expect(ficha.free).toBe(list.free);
    expect(ficha.sessions).toEqual(list.sessions);
  });

  it("ficha: NEVER another patient's pacote (Ana's read has none of Bruno's, and the reverse)", async () => {
    const forAna = await listPatientPacks(actor("owner", owner), ana);
    const all = [...forAna.running, ...forAna.finished];
    expect(all.every((r) => r.patientId === ana)).toBe(true);
    expect(all.map((r) => r.instanceId)).not.toContain(brunoPack);
    const forBruno = await listPatientPacks(actor("owner", owner), bruno);
    expect(ids(forBruno)).toEqual({ running: [brunoPack], finished: [] });
  });

  it("ficha: a viewer who cannot read the patient gets nothing (reception CB on Ana, therapist A on Bruno)", async () => {
    expect(ids(await listPatientPacks(actor("reception", receptionCb), ana))).toEqual({ running: [], finished: [] });
    expect(ids(await listPatientPacks(actor("therapist", therapistA), bruno))).toEqual({ running: [], finished: [] });
  });

  it("ficha: therapist A on Ana sees her pacotes, RESERVADAS still counting B's visit", async () => {
    const page = await listPatientPacks(actor("therapist", therapistA), ana);
    expect(ids(page)).toEqual({ running: [anaAhead, anaPack], finished: [anaSpent] });
    expect(page.running.find((r) => r.instanceId === anaPack)!.reserved).toBe(2);
  });

  it("ficha: the care-team therapist reads Ana's pacotes, not Bruno's", async () => {
    expect(ids(await listPatientPacks(actor("therapist", careTherapist), ana)).running).toEqual([anaAhead, anaPack]);
    expect(ids(await listPatientPacks(actor("therapist", careTherapist), bruno))).toEqual({ running: [], finished: [] });
  });

  it("ficha: the other tenant's patient reads nothing here", async () => {
    expect(ids(await listPatientPacks(actor("owner", owner), stranger))).toEqual({ running: [], finished: [] });
  });

  it("ficha: the cap keeps the newest and says it stopped", async () => {
    const page = await listPatientPacks(actor("owner", owner), ana, { cap: 2 });
    expect(page.truncated).toBe(true);
    // Opened anaPack, anaSpent, anaAhead: the two newest are anaAhead and anaSpent.
    expect(ids(page)).toEqual({ running: [anaAhead], finished: [anaSpent] });
  });
});
