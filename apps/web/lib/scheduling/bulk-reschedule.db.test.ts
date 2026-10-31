/**
 * bulk-reschedule.db.test.ts - APPT-BULK-01 against a real database:
 * "Alterar várias marcações", `bulkRescheduleAppointments`.
 *
 * runScoped is REAL, so appointments_rls, the audit_log policies, the slot
 * locks and 0061's double-confirmed constraint all run as on production. Only
 * the request context, the client IP and the reminder send are mocked; the
 * send is a spy, so "one reminder call per action" is counted exactly.
 *
 * What it proves, each against the single drawer move as the yardstick:
 *   - preview writes nothing: the rows and the audit log read the same after;
 *   - apply writes, per changed row, one `appointment.reschedule` audit row
 *     whose metadata has exactly the keys and values a drawer move writes,
 *     and makes ONE reminder call holding every saved row;
 *   - a refused row (therapist hours, a conflict, two confirmed visits at once)
 *     is skipped and writes nothing, while the others save;
 *   - the per-row tick passes a conflict and never the double-confirmed
 *     constraint;
 *   - a therapist is refused; a reception scoped to another clinic moves
 *     nothing (RLS and the clinic scope).
 *
 * Times are pinned: Wednesdays in March 2027, before the change to summer
 * time, so UTC reads as Lisbon. Names are invented.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  enqueueRemindersAfterCommit: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  // The candidates read asks getRequestContext (a result, not a redirect).
  return { ...actual, requireRequestContext: h.requireRequestContext, getRequestContext: h.requireRequestContext };
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: h.enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit: h.enqueueStatusNotificationsAfterCommit,
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("APPT-BULK-01: Alterar várias marcações against Postgres", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");
  let reads: typeof import("./bulk-reschedule-read-actions");

  let tenantId: string;
  let loc: string;
  let locOther: string;
  let serviceId: string;
  let reception: string;
  let receptionOther: string;
  let therapistUser: string;
  let tOld: string;
  let tNew: string;
  let tMornings: string;

  /** Wednesdays of March 2027, before 2027-03-28, so UTC equals Lisbon. */
  const at = (day: number, hour: number) => new Date(Date.UTC(2027, 2, day, hour, 0, 0));
  const DAYS = [10, 17, 24] as const;
  const MINUTES = 45;
  const endOf = (start: Date) => new Date(start.getTime() + MINUTES * 60_000);

  type Role = "reception" | "admin" | "therapist" | "owner";
  const actAs = (role: Role, userId: string) => h.requireRequestContext.mockResolvedValue({ tenantId, role, userId });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");
    reads = await import("./bulk-reschedule-read-actions");

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Bulk Co', ${"bulk-" + tenantId.slice(0, 8)})`);

    reception = randomUUID();
    receptionOther = randomUUID();
    therapistUser = randomUUID();
    tOld = randomUUID();
    tNew = randomUUID();
    tMornings = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(reception, "Rececao Teste", false);
    await person(receptionOther, "Rececao Outra Clinica", false);
    await person(therapistUser, "Terapeuta Utilizador", true);
    await person(tOld, "Terapeuta Antigo", true);
    await person(tNew, "Terapeuta Novo", true);
    await person(tMornings, "Terapeuta Manhas", true);

    loc = randomUUID();
    locOther = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${loc}, ${tenantId}, 'Clinica Teste')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locOther}, ${tenantId}, 'Clinica Outra')`);
    for (const u of [reception, therapistUser, tOld, tNew, tMornings]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${loc})`);
    }
    await sql.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${receptionOther}, ${locOther})`,
    );
    // ONE therapist has declared hours: Wednesday (weekday 3) 09:00 to 13:00.
    await sql.execute(raw`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time)
      values (${tenantId}, ${tMornings}, ${loc}, 3, '09:00', '13:00')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
    actAs("reception", reception);
  });

  const clean = async () => {
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_care_team where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
  };

  afterEach(async () => {
    actAs("reception", reception);
    h.enqueueRemindersAfterCommit.mockClear();
    await clean();
  });

  afterAll(async () => {
    if (!sql) return;
    await clean();
    await sql.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  async function patient(name: string): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id)
      values (${id}, ${tenantId}, ${name}, ${loc})`);
    return id;
  }

  async function book(patientId: string, practitionerId: string, start: Date): Promise<string> {
    const r = await actions.createAppointment({
      patientId,
      practitionerId,
      locationId: loc,
      serviceId,
      room: null,
      startsAt: start.toISOString(),
      endsAt: endOf(start).toISOString(),
      notes: null,
      allowConflict: false,
      recurrence: null,
      packId: null,
    });
    if (!r.ok) throw new Error(`setup booking failed: ${r.error}`);
    return r.data.id;
  }

  /** Three Wednesday visits at 15:00 with the old therapist, earliest first. */
  async function threeVisits(p: string): Promise<string[]> {
    const ids: string[] = [];
    for (const day of DAYS) ids.push(await book(p, tOld, at(day, 15)));
    h.enqueueRemindersAfterCommit.mockClear();
    return ids;
  }

  async function stored(id: string): Promise<Row> {
    const [r] = await rows(raw`select practitioner_id::text as practitioner_id, location_id::text as location_id,
        status::text as status,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as starts_at,
        to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as ends_at
      from appointments where id = ${id}`);
    if (!r) throw new Error(`appointment ${id} not found`);
    return r;
  }

  async function auditLog(): Promise<Row[]> {
    return rows(raw`select action, entity_id::text as entity_id, metadata from audit_log
      where tenant_id = ${tenantId} order by created_at, action`);
  }

  async function snapshot(ids: string[]) {
    return { rows: await Promise.all(ids.map(stored)), audit: await auditLog() };
  }

  /** The rows as the panel sends them: each with the start it was planned from. */
  async function seen(ids: string[], extra: Record<string, unknown> = {}) {
    const out = [];
    for (const id of ids) {
      const [r] = await rows(raw`select starts_at from appointments where id = ${id}`);
      out.push({ id, expectedStartsAt: new Date(String(r!.starts_at)).toISOString(), ...((extra[id] as object) ?? {}) });
    }
    return out;
  }

  const move = async (p: string, ids: string[], mode: "preview" | "apply", extra: Record<string, unknown> = {}) =>
    actions.bulkRescheduleAppointments({
      patientId: p,
      rows: await seen(ids, extra),
      change: { practitionerId: tNew, time: "10:00" },
      mode,
    });

  it("preview: every row comes back ok, and NOTHING is written", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const before = await snapshot(ids);

    const r = await move(p, ids, "preview");
    expect(r.ok && r.data.rows.map((x) => [x.id, x.verdict.kind, x.applied])).toEqual(
      ids.map((id) => [id, "ok", false]),
    );
    expect(r.ok && r.data.rows[0]!.after).toEqual({
      startsAt: at(10, 10).toISOString(),
      endsAt: endOf(at(10, 10)).toISOString(),
      practitionerId: tNew,
      locationId: loc,
    });

    expect(await snapshot(ids)).toEqual(before);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });

  it("apply: each row moved, one appointment.reschedule audit row each with a drawer move's metadata, ONE reminder call", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const auditBefore = (await auditLog()).length;

    const r = await move(p, ids, "apply");
    expect(r.ok && [r.data.okCount, r.data.skippedCount]).toEqual([3, 0]);

    for (const [i, day] of DAYS.entries()) {
      expect(await stored(ids[i]!)).toMatchObject({
        practitioner_id: tNew,
        location_id: loc,
        starts_at: at(day, 10).toISOString().slice(0, 19),
        ends_at: endOf(at(day, 10)).toISOString().slice(0, 19),
      });
    }

    const written = (await auditLog()).slice(auditBefore);
    const reschedules = written.filter((a) => a.action === "appointment.reschedule");
    expect(reschedules.map((a) => a.entity_id).sort()).toEqual([...ids].sort());
    for (const a of reschedules) {
      const i = ids.indexOf(String(a.entity_id));
      expect(a.metadata).toEqual({
        practitionerId: tNew,
        locationId: loc,
        startsAt: at(DAYS[i]!, 10).toISOString(),
        endsAt: endOf(at(DAYS[i]!, 10)).toISOString(),
        scope: "one",
        allowConflict: false,
      });
    }
    // Besides those, only the care team's own record of the therapist it gained.
    expect(written.filter((a) => a.action !== "appointment.reschedule").map((a) => a.action)).toEqual([
      "care_team.auto_assign",
    ]);

    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledWith(
      tenantId,
      DAYS.map((day, i) => ({
        appointmentId: ids[i],
        startsAt: at(day, 10),
        practitionerId: tNew,
        status: "scheduled",
      })),
    );
  });

  it("the yardstick: a drawer move of the same kind writes an audit row with the same keys and values", async () => {
    const p = await patient("Paciente Um");
    const [first, second] = await threeVisits(p);
    expect(await move(p, [first!], "apply")).toMatchObject({ ok: true });
    const r = await actions.rescheduleAppointment(second!, {
      startsAt: at(17, 10).toISOString(),
      endsAt: endOf(at(17, 10)).toISOString(),
      practitionerId: tNew,
      locationId: loc,
      scope: "one",
      allowConflict: false,
    });
    expect(r).toEqual({ ok: true, data: { id: second } });
    const rs = (await auditLog()).filter((a) => a.action === "appointment.reschedule");
    const bulk = rs.find((a) => a.entity_id === first)!.metadata as Record<string, unknown>;
    const drawer = rs.find((a) => a.entity_id === second)!.metadata as Record<string, unknown>;
    expect(Object.keys(bulk).sort()).toEqual(Object.keys(drawer).sort());
    expect({ ...bulk, startsAt: null, endsAt: null }).toEqual({ ...drawer, startsAt: null, endsAt: null });
  });

  it("a therapist's working hours refuse every row; nothing is written, even with the tick", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const before = await snapshot(ids);
    const r = await actions.bulkRescheduleAppointments({
      patientId: p,
      rows: await seen(ids, Object.fromEntries(ids.map((id) => [id, { allowConflict: true }]))),
      change: { practitionerId: tMornings },
      mode: "apply",
    });
    expect(r.ok && r.data.rows.map((x) => x.verdict)).toEqual(
      ids.map(() => ({
        kind: "refused",
        error: "outside_availability",
        availabilityWindows: [{ startTime: "09:00", endTime: "13:00" }],
      })),
    );
    expect(await snapshot(ids)).toEqual(before);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });

  it("a conflict on one row skips that row only; its tick passes it, and the audit row records the override", async () => {
    const p = await patient("Paciente Um");
    const other = await patient("Paciente Dois");
    const ids = await threeVisits(p);
    // The new therapist is booked at 10:00 on the middle Wednesday.
    await book(other, tNew, at(17, 10));
    h.enqueueRemindersAfterCommit.mockClear();
    const middleBefore = await stored(ids[1]!);

    const first = await move(p, ids, "apply");
    expect(first.ok && first.data.rows.map((x) => [x.id, x.verdict.kind])).toEqual([
      [ids[0], "ok"],
      [ids[1], "conflict"],
      [ids[2], "ok"],
    ]);
    expect(await stored(ids[1]!)).toEqual(middleBefore);
    expect(
      (await auditLog()).filter((a) => a.action === "appointment.reschedule").map((a) => a.entity_id).sort(),
    ).toEqual([ids[0], ids[2]].sort());
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);

    const second = await move(p, [ids[1]!], "apply", { [ids[1]!]: { allowConflict: true } });
    expect(second.ok && second.data.rows[0]!.verdict).toEqual({ kind: "ok" });
    const audit = (await auditLog()).find((a) => a.action === "appointment.reschedule" && a.entity_id === ids[1]);
    expect((audit!.metadata as { allowConflict: boolean }).allowConflict).toBe(true);
  });

  it("the tick never passes two CONFIRMED visits at once (0061): that row is refused and unchanged", async () => {
    const p = await patient("Paciente Um");
    const other = await patient("Paciente Dois");
    const ids = await threeVisits(p);
    const blocker = await book(other, tNew, at(17, 10));
    await sql.execute(raw`update appointments set status = 'confirmed' where id in (${blocker}, ${ids[1]!})`);
    h.enqueueRemindersAfterCommit.mockClear();
    const before = await stored(ids[1]!);

    const r = await move(p, [ids[1]!], "apply", { [ids[1]!]: { allowConflict: true } });
    expect(r.ok && r.data.rows[0]!.verdict).toEqual({ kind: "refused", error: "double_booked" });
    expect(await stored(ids[1]!)).toEqual(before);
    expect((await auditLog()).filter((a) => a.action === "appointment.reschedule")).toEqual([]);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });

  it("+7 days on a CONFIRMED weekly series: every visit moves a week, latest first, with no double-confirmed refusal", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    await sql.execute(raw`update appointments set status = 'confirmed' where tenant_id = ${tenantId}`);
    const change = { shiftDays: 7 };
    const asked = await seen(ids);
    const rowsOf = (mode: "preview" | "apply") =>
      actions.bulkRescheduleAppointments({ patientId: p, rows: asked, change, mode });

    const preview = await rowsOf("preview");
    expect(preview.ok && preview.data.rows.map((x) => x.verdict.kind)).toEqual(["ok", "ok", "ok"]);
    const apply = await rowsOf("apply");
    expect(apply.ok && apply.data.rows.map((x) => [x.verdict.kind, x.applied])).toEqual([
      ["ok", true],
      ["ok", true],
      ["ok", true],
    ]);
    // 15:00 Lisbon each time: the last lands on 2027-03-31, after the change
    // to summer time, where 15:00 WEST is 14:00 UTC. The wall clock holds.
    expect(await Promise.all(ids.map(async (id) => (await stored(id)).starts_at))).toEqual([
      "2027-03-17T15:00:00",
      "2027-03-24T15:00:00",
      "2027-03-31T14:00:00",
    ]);
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);
  });

  it("-7 days on a CONFIRMED weekly series: every visit moves a week earlier", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    await sql.execute(raw`update appointments set status = 'confirmed' where tenant_id = ${tenantId}`);
    const r = await actions.bulkRescheduleAppointments({
      patientId: p,
      rows: await seen(ids),
      change: { shiftDays: -7 },
      mode: "apply",
    });
    expect(r.ok && r.data.okCount).toBe(3);
    for (const [i, day] of DAYS.entries()) {
      expect((await stored(ids[i]!)).starts_at).toBe(at(day - 7, 15).toISOString().slice(0, 19));
    }
  });

  it("a retried save carrying the old starts moves nothing a second time", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const asked = ids.map((id, i) => ({ id, expectedStartsAt: at(DAYS[i]!, 15).toISOString() }));
    const send = () =>
      actions.bulkRescheduleAppointments({ patientId: p, rows: asked, change: { shiftDays: 7 }, mode: "apply" });
    expect((await send()).ok).toBe(true);
    const after = await snapshot(ids);
    const again = await send();
    expect(again.ok && again.data.rows.map((x) => x.verdict.kind)).toEqual([
      "already_saved",
      "already_saved",
      "already_saved",
    ]);
    expect(again.ok && [again.data.okCount, again.data.alreadySavedCount]).toEqual([0, 3]);
    expect(await snapshot(ids)).toEqual(after);
  });

  it("a DOUBLE SUBMIT (two applies of the same plan at once): each visit is saved exactly once", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const asked = await seen(ids);
    const send = () =>
      actions.bulkRescheduleAppointments({ patientId: p, rows: asked, change: { shiftDays: 7 }, mode: "apply" });
    const [a, b] = await Promise.all([send(), send()]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // Each visit: one save says ok, the other already_saved.
    for (const id of ids) {
      const kinds = [a, b].map((r) => r.data.rows.find((x) => x.id === id)!.verdict.kind).sort();
      expect(kinds).toEqual(["already_saved", "ok"]);
    }
    expect(a.data.okCount + b.data.okCount).toBe(3);
    // Exactly one reschedule audit row per visit, and one reminder target per visit in all.
    const rs = (await auditLog()).filter((x) => x.action === "appointment.reschedule");
    expect(rs.map((x) => x.entity_id).sort()).toEqual([...ids].sort());
    const targets = h.enqueueRemindersAfterCommit.mock.calls.flatMap((c) => c[1] as { appointmentId: string }[]);
    expect(targets.map((t) => t.appointmentId).sort()).toEqual([...ids].sort());
    for (const [i, day] of DAYS.entries()) {
      expect((await stored(ids[i]!)).starts_at).toBe(
        day + 7 === 31 ? "2027-03-31T14:00:00" : at(day + 7, 15).toISOString().slice(0, 19),
      );
    }
  });

  it("a therapist is refused, the list and the change both; nothing is written", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const before = await snapshot(ids);
    actAs("therapist", tOld);
    expect(await move(p, ids, "apply")).toEqual({ ok: false, error: "forbidden" });
    expect(await reads.listBulkRescheduleCandidatesAction(p)).toEqual({ ok: false, error: "forbidden" });
    expect(await snapshot(ids)).toEqual(before);
  });

  it("a reception scoped to ANOTHER clinic moves nothing here (RLS and the clinic scope)", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    const before = await snapshot(ids);
    actAs("reception", receptionOther);
    const r = await move(p, ids, "apply");
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.okCount).toBe(0);
    expect(await snapshot(ids)).toEqual(before);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });

  it("the candidate list is this patient's future Agendada/Confirmada visits, oldest first", async () => {
    const p = await patient("Paciente Um");
    const ids = await threeVisits(p);
    await sql.execute(raw`update appointments set status = 'cancelled' where id = ${ids[2]!}`);
    const r = await reads.listBulkRescheduleCandidatesAction(p);
    expect(r.ok && r.data.map((c) => c.id)).toEqual([ids[0], ids[1]]);
    expect(r.ok && r.data[0]).toMatchObject({ practitionerId: tOld, practitionerName: "Terapeuta Antigo", batchId: null });
  });
});
