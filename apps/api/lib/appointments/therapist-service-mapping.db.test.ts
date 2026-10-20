/**
 * therapist-service-mapping.db.test.ts - Q-M (owner ruling, 2026-10-20): ON THE
 * PATIENT PATH A THERAPIST IS OFFERED, GIVEN SLOTS AND ASSIGNED ONLY FOR A
 * SERVICE THEY ARE MAPPED TO IN `therapist_services`. PROVEN AGAINST A REAL
 * POSTGRES, THROUGH THE REAL STORE.
 *
 * Q-M supersedes PL-06a (2026-07-28, "the mapping is a PRESELECTION, not a
 * RESTRICTION") for the patient-facing surfaces only. Reception reported, on
 * the day of the ruling, that the patient app's therapist step listed people
 * who do not deliver the chosen service. The staff agenda keeps PL-06a; that
 * half is proven in apps/web.
 *
 * THE FIXTURE, AND WHY THE HOURS DIFFER. Four bookable therapists at one clinic,
 * every weekday templated:
 *   A  NO mapped service           09:00-21:00  (the widest hours, sorts first)
 *   B  mapped to Fisioterapia only 09:00-18:00
 *   C  mapped to Osteopatia only   09:00-12:00
 *   D  mapped to BOTH              09:00-12:00  (many rows per therapist)
 * Because the unmapped therapists work hours nobody mapped works, a slot grid
 * that leaked them would show it as a start time, not as a count. And because A
 * sorts first by name, an assignment that leaked A would pick A.
 *
 * EVERY REFUSAL HAS ITS CONTROL. B is refused for Osteopatia and offered for
 * Fisioterapia, so "B is not listed" cannot pass on a B that the query drops
 * for some other reason. C is assigned and offered, so "nothing came back" can
 * never stand in for "the filter works".
 *
 * WRITES NOTHING BUT ITS OWN TENANT. The booking path is driven with the real
 * store's reads and a recording `createBooking`, so the assignment the real SQL
 * makes is observed without inserting an appointment.
 *
 * GATING: needs a live DATABASE_URL with migrations applied (see
 * .github/workflows/db-tests.yml, which runs `vitest run .db.test.ts` in this
 * app). Skipped without one. Invented names only.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/patient-change", () => ({
  emitPatientChange: vi.fn(async () => ({ delivered: true })),
}));

import type { AppointmentsStore } from "./booking";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** A fixed instant for the slot horizon: before Lisbon's 2027 clock change. */
const NOW = new Date("2027-03-01T00:00:00.000Z");

const lisbonHHMM = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/** 10:00 Lisbon, ten days from the real clock (bookAppointment refuses the past). */
function tenAmLisbonInTenDays(): Date {
  const day = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const utcHour of ["10", "09"]) {
    const candidate = new Date(`${day}T${utcHour}:00:00.000Z`);
    if (lisbonHHMM(candidate.toISOString()) === "10:00") return candidate;
  }
  throw new Error("could not place 10:00 Lisbon");
}

d("Q-M: the patient path offers and assigns only therapists mapped to the service", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let booking: typeof import("./booking");
  let realStore: AppointmentsStore;
  let AppointmentError: typeof import("./errors").AppointmentError;

  const tenantId = randomUUID();
  const locationId = randomUUID();
  const patientId = randomUUID();
  const osteo = randomUUID();
  const fisio = randomUUID();
  const A = randomUUID(); // no mapped service
  const B = randomUUID(); // Fisioterapia only
  const C = randomUUID(); // Osteopatia only
  const D = randomUUID(); // both

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  /** The real reads, a recording write, and a fake read-back of the new row. */
  function storeRecording(): { store: AppointmentsStore; created: string[] } {
    const created: string[] = [];
    const store: AppointmentsStore = {
      ...realStore,
      priorTherapistId: async () => null,
      createBooking: async (_p, args) => {
        created.push(args.practitionerId);
        return randomUUID();
      },
      getOwn: async (_p, id) => ({
        id,
        startsAt: new Date().toISOString(),
        endsAt: new Date().toISOString(),
        status: "scheduled",
        serviceName: null,
        locationName: null,
        practitionerName: null,
        room: null,
      }),
    };
    return { store, created };
  }

  const roster = async (serviceId: string): Promise<string[]> =>
    (
      await booking.listBookableTherapists(principal(), { serviceId, locationId }, realStore)
    ).map((t) => t.id);

  const offeredTimes = async (serviceId: string, practitionerId: string | null): Promise<string[]> => {
    const iso = await booking.listOpenSlots(
      principal(),
      { serviceId, locationId, practitionerId },
      realStore,
      NOW,
    );
    return [...new Set(iso.map(lisbonHHMM))].sort();
  };

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    booking = await import("./booking");
    ({ drizzleAppointmentsStore: realStore } = await import("./store"));
    ({ AppointmentError } = await import("./errors"));

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Q-M Mapping Co', ${"qm-" + tenantId.slice(0, 8)})`);
    await db.execute(raw`insert into locations
        (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
      values (${locationId}, ${tenantId}, 'Clinica Q-M (teste)', '08:00', '21:00', 60)`);
    await db.execute(raw`insert into services
        (id, tenant_id, name, duration_min, is_active, patient_bookable)
      values (${osteo}, ${tenantId}, 'Osteopatia (teste)', 60, true, true),
             (${fisio}, ${tenantId}, 'Fisioterapia (teste)', 60, true, true)`);
    await db.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientId}, ${tenantId}, 'Paciente Q-M')`);

    const therapists: Array<[string, string, string]> = [
      [A, "Terapeuta A Sem Servico", "21:00"],
      [B, "Terapeuta B Fisioterapia", "18:00"],
      [C, "Terapeuta C Osteopatia", "12:00"],
      [D, "Terapeuta D Ambos", "12:00"],
    ];
    for (const [id, name, endTime] of therapists) {
      await db.execute(raw`insert into users
          (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"qm-" + id.slice(0, 8) + "@t.test"}, ${name}, true, true)`);
      for (let weekday = 0; weekday < 7; weekday++) {
        await db.execute(raw`insert into availability_templates
            (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
          values (${randomUUID()}, ${tenantId}, ${id}, ${locationId},
                  ${weekday}, '09:00', ${endTime}, true)`);
      }
    }

    // The mapping. A gets none; D gets two rows.
    for (const [therapist, service] of [
      [B, fisio],
      [C, osteo],
      [D, osteo],
      [D, fisio],
    ] as const) {
      await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
        values (${tenantId}, ${therapist}, ${service})`);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from therapist_services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ------------------------------ the roster ----------------------------- */

  it("the roster for Osteopatia is exactly the two therapists mapped to it", async () => {
    expect((await roster(osteo)).sort()).toEqual([C, D].sort());
  });

  it("a therapist mapped only to ANOTHER service is not listed (B for Osteopatia)", async () => {
    expect(await roster(osteo)).not.toContain(B);
  });

  it("control: that same therapist IS listed for the service they are mapped to", async () => {
    expect((await roster(fisio)).sort()).toEqual([B, D].sort());
  });

  it("a therapist with ZERO mapped services is hidden for every service", async () => {
    expect(await roster(osteo)).not.toContain(A);
    expect(await roster(fisio)).not.toContain(A);
  });

  /* ------------------------------- the slots ----------------------------- */

  it("'Escolham por mim' slots never come from an unmapped therapist", async () => {
    // A works until 21:00 and B until 18:00; only C and D (09:00-12:00) are
    // mapped to Osteopatia. Any start from 12:00 on would be A's or B's.
    expect(await offeredTimes(osteo, null)).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("control: the same sweep for Fisioterapia offers B's afternoon and not A's evening", async () => {
    const times = await offeredTimes(fisio, null);
    expect(times).toContain("14:00");
    expect(times[times.length - 1]).toBe("17:00");
  });

  it("a CHOSEN therapist who is not mapped to the service gets no slots", async () => {
    expect(await offeredTimes(osteo, A)).toEqual([]);
    expect(await offeredTimes(osteo, B)).toEqual([]);
  });

  it("control: a chosen therapist who IS mapped gets their hours", async () => {
    expect(await offeredTimes(osteo, C)).toEqual(["09:00", "10:00", "11:00"]);
  });

  /* ------------------------------- the submit ---------------------------- */

  it("a submitted practitionerId that is not mapped to the service is REFUSED (no_therapist)", async () => {
    for (const unmapped of [A, B]) {
      const { store, created } = storeRecording();
      const attempt = booking.bookAppointment(
        principal(),
        { serviceId: osteo, locationId, startsAt: tenAmLisbonInTenDays(), practitionerId: unmapped },
        store,
        new Date(),
      );
      await expect(attempt).rejects.toBeInstanceOf(AppointmentError);
      await expect(attempt).rejects.toMatchObject({ code: "no_therapist" });
      expect(created).toEqual([]);
    }
  });

  it("control: a submitted practitionerId that IS mapped books that therapist", async () => {
    const { store, created } = storeRecording();
    await booking.bookAppointment(
      principal(),
      { serviceId: osteo, locationId, startsAt: tenAmLisbonInTenDays(), practitionerId: C },
      store,
      new Date(),
    );
    expect(created).toEqual([C]);
  });

  it("'Escolham por mim' at submit assigns a mapped therapist, never the unmapped one who sorts first", async () => {
    // At 10:00 all four work and none is busy. Without the filter the
    // deterministic fallback picks the lowest name, which is A.
    const { store, created } = storeRecording();
    await booking.bookAppointment(
      principal(),
      { serviceId: osteo, locationId, startsAt: tenAmLisbonInTenDays(), practitionerId: null },
      store,
      new Date(),
    );
    expect(created).toEqual([C]);
  });

  it("a service nobody is mapped to: an empty roster, no slots, and a refused submit", async () => {
    // Removing every Osteopatia row leaves the service in the catalogue with
    // nobody to deliver it online. The rows are put back after, so the arms
    // above do not depend on test order.
    await db.execute(raw`delete from therapist_services
      where tenant_id = ${tenantId} and service_id = ${osteo}`);
    try {
      expect(await roster(osteo)).toEqual([]);
      expect(await offeredTimes(osteo, null)).toEqual([]);
      const { store, created } = storeRecording();
      await expect(
        booking.bookAppointment(
          principal(),
          { serviceId: osteo, locationId, startsAt: tenAmLisbonInTenDays(), practitionerId: null },
          store,
          new Date(),
        ),
      ).rejects.toMatchObject({ code: "no_therapist" });
      expect(created).toEqual([]);
    } finally {
      await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
        values (${tenantId}, ${C}, ${osteo}), (${tenantId}, ${D}, ${osteo})`);
    }
  });
});
