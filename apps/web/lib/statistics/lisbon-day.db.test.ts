/**
 * lisbon-day.db.test.ts: R29. PAINEL AND INDICADORES COUNT DAYS AT LISBON
 * MIDNIGHT, against a real Postgres, through the real `getStatistics` and
 * `getKpiReports` (runScoped, RLS, the owner's statistics:read).
 *
 * THE GATE: a visit at 00:30 Lisbon on a summer-time date is counted on that
 * Lisbon day, and winter dates are unchanged. Before R29 the period bounds were
 * UTC midnights, so that visit (23:30 UTC the evening before) was counted on the
 * previous day, and an invoice issued at 00:30 Lisbon on the first of a month
 * was put in the previous month.
 *
 * FIXED DATES, NOT NOW-RELATIVE: every instant below is a constant, so the
 * suite reads the same at any hour it runs. Its own tenant, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** 2026-07-15 00:30 WEST (UTC+1): the summer visit. */
const SUMMER_0030 = "2026-07-14T23:30:00.000Z";
/** 2026-01-15 00:30 WET (UTC+0): the winter visit. */
const WINTER_0030 = "2026-01-15T00:30:00.000Z";
/** 2026-01-14 23:30 WET: the winter control, the evening before. */
const WINTER_2330 = "2026-01-14T23:30:00.000Z";
/** 2026-08-01 00:30 WEST: an invoice issued in the first half hour of August. */
const AUGUST_0030 = "2026-07-31T23:30:00.000Z";
/** 2026-01-15 00:30 WET: a winter invoice. */
const JANUARY_0030 = "2026-01-15T00:30:00.000Z";

const SUMMER_CENTS = 1_000;
const WINTER_CENTS = 20_000;

d("R29: Painel and Indicadores count days at Lisbon midnight", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let getStatistics: typeof import("./queries").getStatistics;
  let getKpiReports: typeof import("./kpi-queries").getKpiReports;

  const tenant = randomUUID();
  const owner = randomUUID();
  const therapist = randomUUID();
  const location = randomUUID();
  const patient = randomUUID();
  const apptSummer = randomUUID();
  const apptWinter = randomUUID();
  const apptWinterEve = randomUUID();

  const actor = () => ({ tenantId: tenant, role: "owner" as const, userId: owner });
  const stats = (from: string, to: string) => getStatistics(actor(), { from, to });

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ getStatistics } = await import("./queries"));
    ({ getKpiReports } = await import("./kpi-queries"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'r29 lisbon day', ${"r29-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${location}::uuid, ${tenant}::uuid, 'Clinica R29 (teste)')`,
    );
    for (const [id, tag, name] of [
      [owner, "own", "Dona R29"],
      [therapist, "ter", "Terapeuta R29"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${tag + "-" + id.slice(0, 8) + "@r29.test"}, ${name})`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, patient_number)
          values (${patient}::uuid, ${tenant}::uuid, 'Utente Exemplo R29', 92901)`,
    );
    const appt = (id: string, startsAt: string) =>
      raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
          values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${therapist}::uuid, ${location}::uuid,
                  ${startsAt}::timestamptz, ${new Date(new Date(startsAt).getTime() + 30 * 60000).toISOString()}::timestamptz,
                  'completed'::appointment_status, ${owner}::uuid)`;
    await db.execute(appt(apptSummer, SUMMER_0030));
    await db.execute(appt(apptWinter, WINTER_0030));
    await db.execute(appt(apptWinterEve, WINTER_2330));

    const invoice = (appointment: string, cents: number, issuedAt: string) =>
      raw`insert into invoices (tenant_id, patient_id, appointment_id, amount_cents, status, issued_at)
          values (${tenant}::uuid, ${patient}::uuid, ${appointment}::uuid, ${cents},
                  'issued'::invoice_status, ${issuedAt}::timestamptz)`;
    await db.execute(invoice(apptSummer, SUMMER_CENTS, AUGUST_0030));
    await db.execute(invoice(apptWinter, WINTER_CENTS, JANUARY_0030));
  });

  afterAll(async () => {
    if (!live || !db) return;
    await db.execute(raw`delete from invoices where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  it("PREMISE: the fixture holds three visits and two invoices, all visible to the owner", async () => {
    const all = await stats("2026-01-01", "2026-12-31");
    expect(all.appointmentCount).toBe(3);
    expect(all.revenueTotalCents).toBe(SUMMER_CENTS + WINTER_CENTS);
  });

  it("GATE (Painel): the 00:30 Lisbon summer visit is counted on 15 July, not on 14 July", async () => {
    expect((await stats("2026-07-15", "2026-07-15")).appointmentCount).toBe(1);
    expect((await stats("2026-07-14", "2026-07-14")).appointmentCount).toBe(0);
  });

  it("GATE (Indicadores): the same visit is on 15 July in the daily report and the top therapists", async () => {
    const day = await getKpiReports(actor(), { from: "2026-07-15", to: "2026-07-15" });
    expect(day.dailyByTherapist.rows.map((r) => r.period)).toEqual(["2026-07-15"]);
    expect(day.topTherapists.map((t) => t.count)).toEqual([1]);
    const dayBefore = await getKpiReports(actor(), { from: "2026-07-14", to: "2026-07-14" });
    expect(dayBefore.dailyByTherapist.rows).toEqual([]);
    expect(dayBefore.topTherapists).toEqual([]);
  });

  it("winter is unchanged: 00:30 on 15 January is the 15th, 23:30 on the 14th is the 14th", async () => {
    expect((await stats("2026-01-15", "2026-01-15")).appointmentCount).toBe(1);
    expect((await stats("2026-01-14", "2026-01-14")).appointmentCount).toBe(1);
    const kpi = await getKpiReports(actor(), { from: "2026-01-14", to: "2026-01-15" });
    expect(kpi.dailyByTherapist.rows.map((r) => r.period)).toEqual(["2026-01-14", "2026-01-15"]);
  });

  it("an invoice issued at 00:30 Lisbon on 1 August is August revenue, on both pages", async () => {
    const aug1 = await stats("2026-08-01", "2026-08-01");
    expect(aug1.revenueTotalCents).toBe(SUMMER_CENTS);
    expect(aug1.revenueByMonth).toEqual([{ period: "2026-08", valueCents: SUMMER_CENTS, count: 1 }]);
    expect((await stats("2026-07-01", "2026-07-31")).revenueTotalCents).toBe(0);

    const year = await stats("2026-01-01", "2026-12-31");
    expect(year.revenueByMonth.map((m) => m.period)).toEqual(["2026-01", "2026-08"]);

    const kpi = await getKpiReports(actor(), { from: "2026-01-01", to: "2026-12-31" });
    expect(kpi.revenueByMonth).toEqual([
      { period: "2026-01", valueCents: WINTER_CENTS },
      { period: "2026-08", valueCents: SUMMER_CENTS },
    ]);
  });
});
