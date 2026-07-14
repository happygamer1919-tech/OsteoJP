/**
 * statistics-aggregates.test.ts - W6-05 KPI math (live DB).
 *
 * Proves the Estatisticas aggregate SQL (mirrored from apps/web lib/statistics/
 * queries.ts getStatistics) computes correctly over SYNTHETIC data: revenue from
 * invoices (issued/paid), the invoice->appointment link for the per-therapist
 * revenue breakdown, appointment counts, and booked-minute utilization (cancelled
 * excluded). Money is integer cents. Runs inside a rolled-back transaction so
 * nothing persists; skipped without a live DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, connect, live } from "./rls-harness";

const p = live ? connect() : null;

afterAll(async () => {
  await p?.end();
});

type Tx = Parameters<Parameters<typeof asRole>[3]>[0];

async function seed(tx: Tx, tenant: string) {
  await tx`insert into tenants (id, name, slug) values (${tenant}, ${`ST ${tenant}`}, ${`st-${tenant}`})`;
  const therapistId = randomUUID();
  await tx`insert into users (id, tenant_id, email, full_name)
           values (${therapistId}, ${tenant}, ${`t-${therapistId}@x.test`}, ${"Dra. Teste"})`;
  const [pt] = await tx<{ id: string }[]>`
    insert into patients (tenant_id, full_name) values (${tenant}, ${"Paciente"}) returning id`;
  const [loc] = await tx<{ id: string }[]>`
    insert into locations (tenant_id, name) values (${tenant}, ${"Linda-a-Velha"}) returning id`;
  // One completed 60-minute appointment, and one cancelled 30-minute one (must be
  // EXCLUDED from utilization but COUNTED in the appointment total).
  const [appt] = await tx<{ id: string }[]>`
    insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
    values (${tenant}, ${pt!.id}, ${therapistId}, ${loc!.id},
            '2026-03-02T09:00:00Z', '2026-03-02T10:00:00Z', 'completed') returning id`;
  await tx`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
           values (${tenant}, ${pt!.id}, ${therapistId}, ${loc!.id},
                   '2026-03-03T09:00:00Z', '2026-03-03T09:30:00Z', 'cancelled')`;
  // Two revenue invoices linked to the completed appointment (issued + paid) and
  // one DRAFT that must be excluded from revenue.
  await tx`insert into invoices (tenant_id, patient_id, appointment_id, amount_cents, status, issued_at)
           values (${tenant}, ${pt!.id}, ${appt!.id}, 5000, 'issued', '2026-03-02T11:00:00Z')`;
  await tx`insert into invoices (tenant_id, patient_id, appointment_id, amount_cents, status, issued_at)
           values (${tenant}, ${pt!.id}, ${appt!.id}, 3000, 'paid', '2026-03-02T12:00:00Z')`;
  await tx`insert into invoices (tenant_id, patient_id, appointment_id, amount_cents, status, issued_at)
           values (${tenant}, ${pt!.id}, ${appt!.id}, 9999, 'draft', '2026-03-02T13:00:00Z')`;
  return { therapistId };
}

describe.skipIf(!live)("W6-05 statistics aggregates (live DB)", () => {
  it("revenue excludes draft/void; per-therapist revenue links via the appointment; utilization excludes cancelled", async () => {
    const res = await asRole(p!, "service_role", null, async (tx) => {
      const t = randomUUID();
      const { therapistId } = await seed(tx, t);

      const [rev] = await tx<{ cents: number }[]>`
        select coalesce(sum(i.amount_cents),0)::int cents
        from invoices i left join appointments a on a.id = i.appointment_id
        where i.tenant_id = ${t} and i.status in ('issued','paid')`;

      const [vol] = await tx<{ appts: number; minutes: number }[]>`
        select count(*)::int appts,
               coalesce(sum(case when a.status <> 'cancelled'
                 then extract(epoch from (a.ends_at - a.starts_at))/60 else 0 end),0)::int minutes
        from appointments a where a.tenant_id = ${t}`;

      const byTher = (await tx`
        select a.practitioner_id id, coalesce(sum(i.amount_cents),0)::int cents
        from invoices i left join appointments a on a.id = i.appointment_id
        where i.tenant_id = ${t} and i.status in ('issued','paid')
        group by a.practitioner_id order by cents desc`) as { id: string; cents: number }[];

      return { revCents: rev!.cents, appts: vol!.appts, minutes: vol!.minutes, byTher, therapistId };
    });

    // 5000 (issued) + 3000 (paid); 9999 draft excluded.
    expect(res.revCents).toBe(8000);
    // Both appointments counted; only the completed 60-min one contributes minutes.
    expect(res.appts).toBe(2);
    expect(res.minutes).toBe(60);
    // All revenue attributes to the single therapist via the appointment link.
    expect(res.byTher).toHaveLength(1);
    expect(res.byTher[0]!.id).toBe(res.therapistId);
    expect(res.byTher[0]!.cents).toBe(8000);
  });
});
