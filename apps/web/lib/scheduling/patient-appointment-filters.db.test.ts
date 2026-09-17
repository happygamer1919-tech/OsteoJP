/**
 * U1 / B2 — the Marcações filters narrow IN SQL, not over the loaded list.
 *
 * ==========================================================================
 * THE POSITIVE CONTROL, AND WHY IT IS BUILT THIS WAY
 * ==========================================================================
 * The fixture seeds 250 appointments for one patient and puts THE ONLY MATCH
 * for each filter far down the history — position ~200 by date, which is well
 * past any window a screen would render first. A filter implemented over an
 * already-loaded page would return nothing for these cases; a filter
 * implemented as a WHERE clause returns the row.
 *
 * That distinction is not hypothetical in this repository: /marcacoes filters
 * its Estado and Serviço dropdowns on the client, over the window it already
 * fetched (marcacoes-view.tsx). This suite is what stops the ficha's filters
 * from drifting into the same shape.
 *
 * ==========================================================================
 * "LIMPAR FILTROS" IS ASSERTED AS A RESTORED TOTAL
 * ==========================================================================
 * Clearing returns the unfiltered count, so a filter can never leave the list
 * permanently narrowed — the failure that looks like data loss to reception.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL, like every suite beside it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

/** Pinned so the fixture's dates never drift under the assertions. */
const BASE = new Date("2026-03-01T10:00:00.000Z");
const TOTAL = 250;

/** The one row every filter is aimed at, deep in the history. */
const NEEDLE_INDEX = 200;

d("patient appointment filters are applied by the database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPatientAppointments: typeof import("./data").listPatientAppointments;

  const tenant = randomUUID();
  const location = randomUUID();
  const otherLocation = randomUUID();
  const service = randomUUID();
  const otherService = randomUUID();
  const therapist = randomUUID();
  const otherTherapist = randomUUID();
  const admin = randomUUID();
  const patient = randomUUID();

  /** The admin principal: sees everything in the tenant, so any row missing is the FILTER's doing. */
  const ctx = () =>
    ({ tenantId: tenant, userId: admin, role: "admin" }) as unknown as import("@osteojp/auth").RequestContext;

  const startsAt = (i: number) => new Date(BASE.getTime() + i * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listPatientAppointments } = await import("./data"));

    await db.execute(raw`insert into tenants (id, name, slug) values (${tenant}, 'U1 filters', ${`u1-${tenant}`})`);
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values
          (${location}, ${tenant}, 'Clinica A'), (${otherLocation}, ${tenant}, 'Clinica B')`,
    );
    await db.execute(
      raw`insert into services (id, tenant_id, name) values
          (${service}, ${tenant}, 'Osteopatia'), (${otherService}, ${tenant}, 'NESA')`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource) values
          (${admin}, ${tenant}, ${`u1-admin-${admin}@example.invalid`}, 'Admin', true, false, false),
          (${therapist}, ${tenant}, ${`u1-t1-${therapist}@example.invalid`}, 'Terapeuta Um', true, true, false),
          (${otherTherapist}, ${tenant}, ${`u1-t2-${otherTherapist}@example.invalid`}, 'Terapeuta Dois', true, true, false)`,
    );
    await db.execute(raw`insert into patients (id, tenant_id, full_name) values (${patient}, ${tenant}, 'U1 Paciente')`);

    // 250 rows. Everything is the COMMON value except row NEEDLE_INDEX, which is
    // the only row carrying the other therapist, the other clinic, the other
    // service and the cancelled estado — and the only row with no note.
    for (let i = 0; i < TOTAL; i += 1) {
      const needle = i === NEEDLE_INDEX;
      const id = randomUUID();
      const start = startsAt(i);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      await db.execute(
        raw`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status, notes)
            values (${id}, ${tenant}, ${patient},
              ${needle ? otherTherapist : therapist},
              ${needle ? otherLocation : location},
              ${needle ? otherService : service},
              ${start.toISOString()}, ${end.toISOString()},
              ${needle ? "cancelled" : "completed"},
              ${needle ? null : "nota de acompanhamento"})`,
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from appointments where tenant_id = ${tenant}`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}`);
    await db.execute(raw`delete from services where tenant_id = ${tenant}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}`);
    await db.execute(raw`delete from tenants where id = ${tenant}`);
  });

  it("returns the whole history when nothing is filtered", async () => {
    const rows = await listPatientAppointments(ctx(), patient);
    expect(rows).toHaveLength(TOTAL);
  });

  it("Estado finds the ONE cancelled visit sitting 200 rows deep", async () => {
    const rows = await listPatientAppointments(ctx(), patient, { status: ["cancelled"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("cancelled");
  });

  it("Terapeuta finds the one visit with the other therapist", async () => {
    const rows = await listPatientAppointments(ctx(), patient, { practitionerId: otherTherapist });
    expect(rows).toHaveLength(1);
  });

  it("Clinica finds the one visit at the other clinic", async () => {
    const rows = await listPatientAppointments(ctx(), patient, { locationId: otherLocation });
    expect(rows).toHaveLength(1);
  });

  it("Servico finds the one visit with the other service", async () => {
    const rows = await listPatientAppointments(ctx(), patient, { serviceId: otherService });
    expect(rows).toHaveLength(1);
  });

  it("Sem nota finds the one visit carrying no note", async () => {
    const rows = await listPatientAppointments(ctx(), patient, { withoutNote: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hasNote).toBe(false);
  });

  it("a date range narrows to exactly the days inside it, upper bound EXCLUSIVE", async () => {
    // Days 10..19 inclusive = 10 rows, expressed as [day10, day20).
    const rows = await listPatientAppointments(ctx(), patient, {
      fromUtc: startsAt(10),
      toUtc: startsAt(20),
    });
    expect(rows).toHaveLength(10);
  });

  it("orders newest first by default and oldest first on request", async () => {
    const newest = await listPatientAppointments(ctx(), patient, { order: "newest" });
    const oldest = await listPatientAppointments(ctx(), patient, { order: "oldest" });
    expect(new Date(newest[0]!.startsAt).getTime()).toBeGreaterThan(
      new Date(oldest[0]!.startsAt).getTime(),
    );
    expect(newest[0]!.id).toBe(oldest[oldest.length - 1]!.id);
  });

  it("combines filters as AND, not OR", async () => {
    // The needle is the only row that is BOTH cancelled and at the other clinic.
    const both = await listPatientAppointments(ctx(), patient, {
      status: ["cancelled"],
      locationId: otherLocation,
    });
    expect(both).toHaveLength(1);
    // ...and a pairing nothing satisfies returns nothing rather than everything.
    const none = await listPatientAppointments(ctx(), patient, {
      status: ["cancelled"],
      locationId: location,
    });
    expect(none).toHaveLength(0);
  });

  it("an EMPTY estado list does not narrow, and Limpar filtros restores the total", async () => {
    const empty = await listPatientAppointments(ctx(), patient, { status: [] });
    expect(empty).toHaveLength(TOTAL);
    // "Limpar filtros" navigates to the bare tab URL, which sends no filters.
    const cleared = await listPatientAppointments(ctx(), patient);
    expect(cleared).toHaveLength(TOTAL);
  });
});
