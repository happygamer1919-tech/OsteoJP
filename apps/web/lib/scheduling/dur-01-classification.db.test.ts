/**
 * dur-01-classification.db.test.ts - DUR-01 (docs/data-op-dur-01.md), against a
 * real database and the app's REAL scheduling checks.
 *
 * The held data op classifies every future one-minute row the Fisiozero
 * importer wrote, and writes only the rows nothing stands in the way of. Its
 * stages carry the app's rule INLINE, because appointment_conflicts and
 * is_unconfirmed_pedido read jwt_tenant_id() and answer nothing in a psql
 * session. "The same rule" is a claim until something compares the two, so
 * this suite does: it runs stage 1's own BASE block (read out of
 * scripts/data/dur-01-1-measure.sql, byte for byte) over a seeded tenant, and
 * for every candidate asks the app, under runScoped with RLS, what its
 * reschedule would ask - findConflictsForWindow filtered by blockingConflicts,
 * checkAvailability, checkClinicClosure and checkClinicWindow - and requires
 * the two to agree, row for row, flag for flag.
 *
 * Every arm has its opposite in the seed, so an always-true or always-false
 * mirror fails. The dates are fixed, in January 2031 (Lisbon on UTC), never
 * relative to now.
 *
 * runScoped is REAL. Only the request context is mocked, as in
 * nesa-both-roles-conflict.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const STAGE1 = readFileSync(join(__dirname, "../../../../scripts/data/dur-01-1-measure.sql"), "utf8");
const BEGIN = "-- >>> DUR-01 BASE BEGIN";
const END = "-- <<< DUR-01 BASE END";

/** Stage 1's BASE block, byte for byte, as a query over one tenant's verdicts. */
function baseQuery(tenantId: string): string {
  const a = STAGE1.indexOf(BEGIN);
  const b = STAGE1.indexOf(END);
  if (a < 0 || b < a) throw new Error("stage 1 has no BASE block");
  if (!/^[0-9a-f-]{36}$/.test(tenantId)) throw new Error("not a uuid");
  return `WITH\n${STAGE1.slice(a, b + END.length)}\n
SELECT v.id::text AS id, v.hits_booking, v.hits_block, v.in_closure, v.out_of_window, v.outside_hours,
       v.is_twin, v.verdict, (v.proposed_end IS NOT NULL) AS has_window
  FROM v WHERE v.tenant_id = '${tenantId}'::uuid ORDER BY v.id`;
}

type Stub = {
  label: string;
  practitionerId: string;
  practitionerTwoId?: string | null;
  locationId: string;
  serviceId: string;
  patientId: string;
  startsAt: string;
  room?: string | null;
};
type Flags = { booking: boolean; block: boolean; closure: boolean; window: boolean; hours: boolean };

d("DUR-01: stage 1's inline rule agrees with the app's own checks, row for row", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let runScoped: typeof import("@/lib/auth/context").runScoped;
  let conflict: typeof import("./conflict");
  let availability: typeof import("./availability-enforcement");
  let clinic: typeof import("./clinic-closure-enforcement");

  const tenantId = randomUUID();
  const ownerId = randomUUID();
  const t = Array.from({ length: 16 }, () => randomUUID());
  const nesa = randomUUID();
  const lv = randomUUID();
  const cb = randomUUID();
  const osteo = randomUUID();
  const nesaService = randomUUID();
  const patients = Array.from({ length: 40 }, () => randomUUID());

  /** Wednesday 2031-01-15, Lisbon on UTC. */
  const at = (hhmm: string) => `2031-01-15T${hhmm}:00.000Z`;
  /** The source row's own end, one minute later, in its naive local form. */
  const plusOneMinute = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number) as [number, number];
    const total = h * 60 + m + 1;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  /** The stubs, one per arm and its opposite; `want` is what the app must say. */
  const stubs: Array<Stub & { id: string; want: Flags }> = [];
  const none: Flags = { booking: false, block: false, closure: false, window: false, hours: false };
  const stub = (s: Stub, want: Partial<Flags>) => stubs.push({ ...s, id: randomUUID(), want: { ...none, ...want } });

  beforeAll(async () => {
    const db = await import("@osteojp/db");
    sql = db.getDbAdmin();
    ({ runScoped } = await import("@/lib/auth/context"));
    conflict = await import("./conflict");
    availability = await import("./availability-enforcement");
    clinic = await import("./clinic-closure-enforcement");

    await sql.execute(raw`insert into tenants (id, name, slug) values (${tenantId}, 'DUR-01 Classification Co', ${"dur01-" + tenantId.slice(0, 8)})`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${ownerId}, ${tenantId}, ${"o-" + ownerId.slice(0, 8) + "@t.test"}, 'Dono', true, false)`);
    for (const [i, id] of t.entries()) {
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"t" + i + "-" + id.slice(0, 8) + "@t.test"}, ${"Terapeuta " + i}, true, true)`);
    }
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values (${nesa}, ${tenantId}, ${"nesa-" + nesa.slice(0, 8) + "@t.test"}, 'NESA', true, false, true)`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, opens_at, closes_at)
      values (${lv}, ${tenantId}, 'Linda-a-Velha (teste)', '08:00', '20:00')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, opens_at, closes_at, midday_closed_from, midday_closed_to)
      values (${cb}, ${tenantId}, 'Castelo Branco (teste)', '08:00', '20:00', '13:00', '14:00')`);
    for (const u of [ownerId, ...t, nesa]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${lv})`);
    }
    for (const u of [ownerId, t[9]!, t[10]!]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${cb})`);
    }
    await sql.execute(raw`insert into services (id, tenant_id, name, duration_min) values (${osteo}, ${tenantId}, 'Osteopatia', 60)`);
    await sql.execute(raw`insert into services (id, tenant_id, name, duration_min) values (${nesaService}, ${tenantId}, 'NESA', 60)`);
    for (const p of patients) {
      await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${p}, ${tenantId}, 'Paciente')`);
    }

    // Therapist hours: t[0] all day; t[13] until 10:30; t[14] until 10:30 and 10:30 to 12:00.
    const hours = async (u: string, from: string, to: string) =>
      sql.execute(raw`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
        values (${tenantId}, ${u}, ${lv}, 3, ${from}, ${to}, true)`);
    await hours(t[0]!, "08:00", "20:00");
    await hours(t[13]!, "08:00", "10:30");
    await hours(t[14]!, "08:00", "10:30");
    await hours(t[14]!, "10:30", "12:00");
    // Blocks on t[0]: one inside a window, one from a proposed end.
    await sql.execute(raw`insert into time_off (tenant_id, user_id, starts_at, ends_at, reason)
      values (${tenantId}, ${t[0]!}, ${at("15:30")}::timestamptz, ${at("16:30")}::timestamptz, 'other')`);
    await sql.execute(raw`insert into time_off (tenant_id, user_id, starts_at, ends_at, reason)
      values (${tenantId}, ${t[0]!}, ${at("18:00")}::timestamptz, ${at("19:00")}::timestamptz, 'other')`);

    let pi = 0;
    const next = () => patients[pi++]!;
    const neighbour = async (n: {
      practitionerId: string;
      practitionerTwoId?: string | null;
      locationId?: string;
      from: string;
      to: string;
      status?: string;
      origin?: string;
      room?: string | null;
      serviceId?: string;
      patientId?: string;
    }) => {
      const id = randomUUID();
      await sql.execute(raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id,
          service_id, starts_at, ends_at, status, origin, room)
        values (${id}, ${tenantId}, ${n.patientId ?? next()}, ${n.practitionerId}, ${n.practitionerTwoId ?? null},
          ${n.locationId ?? lv}, ${n.serviceId ?? osteo}, ${at(n.from)}::timestamptz, ${at(n.to)}::timestamptz,
          ${n.status ?? "scheduled"}::appointment_status, ${n.origin ?? "staff"}, ${n.room ?? null})`);
      return id;
    };
    const base = (label: string, practitionerId: string, startsAt: string, extra: Partial<Stub> = {}): Stub => ({
      label, practitionerId, locationId: lv, serviceId: osteo, patientId: next(), startsAt, ...extra,
    });

    // THE THERAPIST ARM, and its opposite: a neighbour inside, and one starting at the proposed end.
    stub(base("therapist, inside", t[0]!, "10:00"), { booking: true });
    await neighbour({ practitionerId: t[0]!, from: "10:30", to: "11:00", status: "confirmed" });
    stub(base("therapist, at the proposed end", t[1]!, "10:00"), {});
    await neighbour({ practitionerId: t[1]!, from: "11:00", to: "12:00" });
    // CANCELLED AND NO-SHOW neighbours hold nothing.
    stub(base("cancelled neighbour", t[1]!, "13:00"), {});
    await neighbour({ practitionerId: t[1]!, from: "13:30", to: "14:00", status: "cancelled" });
    stub(base("no-show neighbour", t[1]!, "15:00"), {});
    await neighbour({ practitionerId: t[1]!, from: "15:15", to: "15:45", status: "no_show" });
    // THE PEDIDO: portal-origin and notified rows hold nothing until confirmed.
    stub(base("portal pedido neighbour", t[2]!, "09:00"), {});
    await neighbour({ practitionerId: t[2]!, from: "09:30", to: "10:00", origin: "patient_portal" });
    stub(base("notified pedido neighbour", t[2]!, "11:00"), {});
    const notified = await neighbour({ practitionerId: t[2]!, from: "11:30", to: "12:00" });
    await sql.execute(raw`insert into staff_notifications (tenant_id, recipient_user_id, kind, appointment_id, patient_id,
        previous_starts_at, new_starts_at, occurred_at)
      select ${tenantId}, ${ownerId}, 'appointment_request', a.id, a.patient_id, a.starts_at, a.starts_at, now()
        from appointments a where a.id = ${notified}`);
    stub(base("the same pedido, confirmed", t[2]!, "13:00"), { booking: true });
    await neighbour({ practitionerId: t[2]!, from: "13:30", to: "14:00", status: "confirmed", origin: "patient_portal" });
    // THE ROOM ARM, case and space, and the same room name at another clinic.
    stub(base("room clash", t[3]!, "09:00", { room: "Sala 1 " }), { booking: true });
    await neighbour({ practitionerId: t[4]!, from: "09:30", to: "10:00", room: "SALA 1" });
    stub(base("same room name, other clinic", t[3]!, "11:00", { room: "Sala 2" }), {});
    await neighbour({ practitionerId: t[9]!, locationId: cb, from: "11:30", to: "12:00", room: "Sala 2" });
    // THE RESOURCE ARMS: a stub on NESA against NESA as Terapeuta 2, and a person
    // stub naming NESA as Terapeuta 2 (the shape STAFF-10 v2 leaves) against NESA as Terapeuta.
    stub(base("NESA stub, NESA as Terapeuta 2 elsewhere", nesa, "09:00", { serviceId: nesaService }), { booking: true });
    await neighbour({ practitionerId: t[5]!, practitionerTwoId: nesa, from: "09:30", to: "10:00" });
    stub(base("person stub naming NESA as Terapeuta 2, NESA booked", t[6]!, "14:00", { practitionerTwoId: nesa, serviceId: nesaService }), { booking: true });
    await neighbour({ practitionerId: nesa, from: "14:30", to: "15:30", serviceId: nesaService });
    stub(base("person naming a PERSON as Terapeuta 2 holds nothing of theirs", t[7]!, "09:00", { practitionerTwoId: t[8]! }), {});
    await neighbour({ practitionerId: t[8]!, from: "09:30", to: "10:00" });
    // THE BLOCK ARM, and a block from the proposed end.
    stub(base("block inside", t[0]!, "15:00"), { block: true });
    stub(base("block from the proposed end", t[0]!, "17:00"), {});
    // THE CLOSURE, at CB, and the same time at LV.
    stub(base("closure", t[9]!, "12:30", { locationId: cb }), { closure: true });
    stub(base("no closure at LV", t[11]!, "12:30"), {});
    // THE CLINIC WINDOW: after the last start, and at it exactly.
    stub(base("after the last start", t[11]!, "19:30"), { window: true });
    stub(base("at the last start", t[12]!, "19:00"), {});
    // THE THERAPIST'S HOURS: not covered, covered by two adjacent windows, covered by one.
    stub(base("hours end at 10:30", t[13]!, "10:00"), { hours: true });
    stub(base("adjacent windows merge", t[14]!, "10:00"), {});
    stub(base("inside one window", t[0]!, "08:00"), {});
    // A NESA TWIN: the app sees nothing, stage 1 holds it.
    const twinPatient = next();
    stub(base("twin person half", t[15]!, "11:00", { serviceId: nesaService, patientId: twinPatient }), {});
    await neighbour({ practitionerId: nesa, from: "11:00", to: "12:00", serviceId: nesaService, patientId: twinPatient });

    for (const s of stubs) {
      await sql.execute(raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id,
          service_id, starts_at, ends_at, status, room)
        values (${s.id}, ${tenantId}, ${s.patientId}, ${s.practitionerId}, ${s.practitionerTwoId ?? null}, ${s.locationId},
          ${s.serviceId}, ${at(s.startsAt)}::timestamptz, ${at(s.startsAt)}::timestamptz + interval '1 minute',
          'scheduled', ${s.room ?? null})`);
      await sql.execute(raw`insert into migration_staging_rows (tenant_id, batch_id, source_system, entity_type, source_id,
          raw, status, imported_entity_id)
        values (${tenantId}, ${tenantId}, 'fisiozero', 'appointment', ${"dur01-" + s.id},
          jsonb_build_object('inicio', ${"2031-01-15 " + s.startsAt}::text, 'fim', ${"2031-01-15 " + plusOneMinute(s.startsAt)}::text),
          'imported', ${s.id})`);
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from migration_staging_rows where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from time_off where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** What the app's reschedule would ask about one stub extended to its default. */
  async function appFlags(s: Stub & { id: string }): Promise<Flags> {
    const startsAt = new Date(at(s.startsAt));
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const ctx = { tenantId, role: "owner" as const, userId: ownerId };
    return runScoped(ctx, async (tx) => {
      const found = conflict.blockingConflicts(
        await conflict.findConflictsForWindow(tx, {
          practitionerId: s.practitionerId,
          practitionerTwoId: s.practitionerTwoId ?? null,
          locationId: s.locationId,
          room: s.room ?? null,
          startsAt,
          endsAt,
          excludeIds: [s.id],
        }),
      );
      const av = await availability.checkAvailability(tx, { practitionerId: s.practitionerId, locationId: s.locationId, startsAt, endsAt });
      const cl = await clinic.checkClinicClosure(tx, { locationId: s.locationId, startsAt, endsAt });
      const cw = await clinic.checkClinicWindow(tx, { locationId: s.locationId, startsAt });
      return {
        booking: found.some((c) => c.kind === "therapist" || c.kind === "room"),
        block: found.some((c) => c.kind === "time_off"),
        closure: !cl.ok,
        window: !cw.ok,
        hours: !av.ok,
      };
    });
  }

  it("CONTROL: the seed is what each arm expects the app to say, so the comparison below is not vacuous", async () => {
    for (const s of stubs) {
      expect({ label: s.label, ...(await appFlags(s)) }).toEqual({ label: s.label, ...s.want });
    }
    // Every flag is true on some stub and false on another.
    for (const k of ["booking", "block", "closure", "window", "hours"] as const) {
      expect(stubs.some((s) => s.want[k])).toBe(true);
      expect(stubs.some((s) => !s.want[k])).toBe(true);
    }
  });

  it("stage 1's BASE reads every stub, and agrees with the app on every flag of every row", async () => {
    const got = await rows(raw.raw(baseQuery(tenantId)));
    const byId = new Map(got.map((r) => [String(r.id), r]));
    expect(got.length).toBe(stubs.length);
    for (const s of stubs) {
      const r = byId.get(s.id);
      expect(r, s.label).toBeTruthy();
      expect(r!.has_window, s.label).toBe(true);
      const app = await appFlags(s);
      expect(
        {
          label: s.label,
          booking: r!.hits_booking,
          block: r!.hits_block,
          closure: r!.in_closure,
          window: r!.out_of_window,
          hours: r!.outside_hours,
        },
      ).toEqual({ label: s.label, ...app });
    }
  });

  it("the NESA twin: the app sees no conflict, and stage 1 holds it as verdict 08", async () => {
    const s = stubs.find((x) => x.label === "twin person half")!;
    const app = await appFlags(s);
    expect(app).toEqual(none);
    const r = (await rows(raw.raw(baseQuery(tenantId)))).find((x) => String(x.id) === s.id)!;
    expect(r.is_twin).toBe(true);
    expect(r.verdict).toBe("08 PART OF A NESA TWIN");
  });

  it("THE NO-CLAIMS TRAP: appointment_conflicts called with no JWT finds nothing where the inline rule finds the row", async () => {
    const s = stubs.find((x) => x.label === "therapist, inside")!;
    const startsAt = at(s.startsAt);
    const [r] = await rows(raw`select count(*)::int as n from public.appointment_conflicts(
        ${s.practitionerId}::uuid, ${s.locationId}::uuid, null::text, ${startsAt}::timestamptz,
        ${startsAt}::timestamptz + interval '60 minutes', array[${s.id}]::uuid[])`);
    expect(Number(r?.n)).toBe(0);
    const v = (await rows(raw.raw(baseQuery(tenantId)))).find((x) => String(x.id) === s.id)!;
    expect(v.hits_booking).toBe(true);
  });
});
