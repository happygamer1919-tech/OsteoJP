/**
 * weekly-blocks.db.test.ts - BLOQUEIOS DE REPETICAO SEMANAL ON THE STAFF SIDE,
 * PROVEN AGAINST A REAL POSTGRES UNDER REAL RLS.
 *
 *   - THE CONFLICT CHECK: reception books into a weekly-blocked hour and is
 *     refused with `conflict`, exactly as over a time_off row; "Guardar mesmo
 *     assim" (allowConflict) books it; the hour after the rule books with no
 *     override (the control that the harness can book at all).
 *   - THE BAND: listTherapistBlocksAndHours returns the expanded weekly block
 *     for the therapist's agenda week.
 *   - THE PAGE'S WRITES under the INSERT/DELETE policies: reception adds and
 *     removes a rule for a therapist at its clinic, the audit row is written in
 *     the same transaction, a duplicate is `duplicate`, a therapist naming a
 *     colleague is `forbidden`.
 *
 * GATING: a live DATABASE_URL AND the weekly table, which arrives with the
 * PENDING migration NEXT-AFTER-0109_weekly_blocks.sql. Skipped without it; from
 * the promotion on it THROWS on a database without the table.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: h.enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit: h.enqueueStatusNotificationsAfterCommit,
}));

const live = Boolean(process.env.DATABASE_URL);

async function tablePresent(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const r = (await getDbAdmin().execute(
    raw`select to_regclass('public.therapist_weekly_blocks') is not null as present`,
  )) as unknown as { present: boolean }[];
  const present = r[0]?.present === true;
  const dir = join(__dirname, "..", "..", "..", "..", "packages", "db", "migrations");
  const promoted = readdirSync(dir).some(
    (f) => f.endsWith(".sql") && readFileSync(join(dir, f), "utf8").includes("CREATE TABLE public.therapist_weekly_blocks"),
  );
  if (!present && promoted) throw new Error("THE WEEKLY TABLE IS PROMOTED BUT ABSENT HERE. Nothing was measured.");
  return present;
}

const PRESENT = await tablePresent();
const d = live && PRESENT ? describe : describe.skip;

d(`weekly blocks on the staff side [${PRESENT ? "TABLE PRESENT" : "TABLE ABSENT"}]`, () => {
  let sql: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let create: typeof import("./actions").createAppointment;
  let weekly: typeof import("@/lib/admin/weekly-blocks");
  let band: typeof import("./day-availability").listTherapistBlocksAndHours;

  const tenantId = randomUUID();
  const receptionId = randomUUID();
  const therapistId = randomUUID();
  const colleagueId = randomUUID();
  const loc = randomUUID();
  const serviceId = randomUUID();
  const patientId = randomUUID();
  let ruleId = "";

  /** Monday 2027-02-08, WET: Lisbon wall clock = UTC. */
  const at = (hhmm: string) => new Date(`2027-02-08T${hhmm}:00.000Z`);
  const ctx = (role: "reception" | "therapist", userId: string) => ({ tenantId, role, userId });
  const as = (role: "reception" | "therapist", userId: string) => h.requireRequestContext.mockResolvedValue(ctx(role, userId));

  const book = (start: string, end: string, allowConflict?: boolean) =>
    create({
      patientId,
      practitionerId: therapistId,
      practitionerTwoId: null,
      locationId: loc,
      serviceId,
      room: null,
      startsAt: at(start).toISOString(),
      endsAt: at(end).toISOString(),
      notes: null,
      allowConflict,
    });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ createAppointment: create } = await import("./actions"));
    weekly = await import("@/lib/admin/weekly-blocks");
    ({ listTherapistBlocksAndHours: band } = await import("./day-availability"));

    await sql.execute(raw`insert into tenants (id, name, slug) values (${tenantId}, 'Weekly Staff Co', ${"ws-" + tenantId.slice(0, 8)})`);
    const person = (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"ws-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(receptionId, "Rececao WS", false);
    await person(therapistId, "Terapeuta WS", true);
    await person(colleagueId, "Colega WS", true);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${loc}, ${tenantId}, 'Clinica WS (teste)')`);
    for (const u of [receptionId, therapistId, colleagueId]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${loc})`);
    }
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientId}, ${tenantId}, 'Paciente WS')`);
  });

  afterEach(async () => {
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from therapist_weekly_blocks where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("reception adds a Monday 09:00-11:00 rule through the page's write, under RLS, audited", async () => {
    const out = await weekly.createWeeklyBlock(ctx("reception", receptionId) as never, {
      userId: therapistId,
      weekday: 1,
      startTime: "09:00",
      endTime: "11:00",
    });
    ruleId = out.id;
    const rows = (await sql.execute(raw`select created_by::text as c from therapist_weekly_blocks where id = ${ruleId}`)) as unknown as { c: string }[];
    expect(rows).toEqual([{ c: receptionId }]);
    const audit = (await sql.execute(raw`select count(*)::int as n from audit_log
      where tenant_id = ${tenantId} and action = 'weekly_block.create' and entity_id = ${ruleId}`)) as unknown as { n: number }[];
    expect(audit[0]!.n).toBe(1);
  });

  it("the same rule again is `duplicate`; a therapist naming a colleague is `forbidden`", async () => {
    const code = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return null;
      } catch (e) {
        return (e as { code?: string }).code ?? String(e);
      }
    };
    expect(
      await code(() =>
        weekly.createWeeklyBlock(ctx("reception", receptionId) as never, { userId: therapistId, weekday: 1, startTime: "09:00", endTime: "11:00" }),
      ),
    ).toBe("duplicate");
    expect(
      await code(() =>
        weekly.createWeeklyBlock(ctx("therapist", therapistId) as never, { userId: colleagueId, weekday: 2, startTime: "09:00", endTime: "11:00" }),
      ),
    ).toBe("forbidden");
  });

  it("CONTROL: the hour after the rule books with no override", async () => {
    as("reception", receptionId);
    const r = await book("11:00", "12:00");
    expect(r.ok).toBe(true);
  });

  it("a booking inside the rule is refused as `conflict`, like a time_off block", async () => {
    as("reception", receptionId);
    const r = await book("09:30", "10:30");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("'Guardar mesmo assim' books over the rule, as it does over time_off", async () => {
    as("reception", receptionId);
    const r = await book("09:30", "10:30", true);
    expect(r.ok).toBe(true);
  });

  it("the agenda band for that week carries the weekly block", async () => {
    const { blocks } = await band(ctx("reception", receptionId) as never, {
      therapistId,
      rangeStart: new Date("2027-02-08T00:00:00Z"),
      rangeEnd: new Date("2027-02-15T00:00:00Z"),
    });
    expect(blocks.map((b) => [b.id, b.startsAt.toISOString(), b.endsAt.toISOString(), b.note])).toEqual([
      [`weekly:${ruleId}:2027-02-08`, "2027-02-08T09:00:00.000Z", "2027-02-08T11:00:00.000Z", "Bloqueio semanal"],
    ]);
  });

  it("reception removes the rule; the same booking then needs no override", async () => {
    await weekly.deleteWeeklyBlock(ctx("reception", receptionId) as never, ruleId);
    as("reception", receptionId);
    const r = await book("09:30", "10:30");
    expect(r.ok).toBe(true);
  });
});
