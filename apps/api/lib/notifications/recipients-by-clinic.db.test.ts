/**
 * recipients-by-clinic.db.test.ts - WHO A PATIENT'S CHANGE REACHES, against a
 * real Postgres.
 *
 * THE DEFECT, reported by the clinic on 2026-10-16 on the staff side: a
 * receptionist assigned to one clinic was told of another clinic's changes,
 * and her own reads (0073's location rule) cannot show that patient or that
 * visit, so the centre printed "Paciente não identificado". This resolver sent
 * every patient change (booking, request, cancellation, reschedule) to EVERY
 * active reception user in the tenant, the portal half of the same defect.
 *
 * THE RULE ASSERTED: a reception user is a recipient when they have no
 * staff_locations row (they see every clinic) or a row for the appointment's
 * clinic. The assigned practitioner still is.
 *
 * THE UNASSIGNED RECEPTIONIST IS THE POSITIVE CONTROL: a rule that refused
 * everybody would pass the "LV-only reception gets nothing" assertion for the
 * wrong reason.
 *
 * SKIP CONTRACT: gates on DATABASE_URL, like every *.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PatientChangeEvent } from "./patient-change";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("resolveRecipients: reception only where they can see the clinic", () => {
  let resolveRecipients: typeof import("./centre").resolveRecipients;

  const tenantId = randomUUID();
  const roleReception = randomUUID();
  const roleTherapist = randomUUID();
  const locLV = randomUUID();
  const locCB = randomUUID();
  const recLV = randomUUID();
  const recCB = randomUUID();
  const recBoth = randomUUID();
  const recNone = randomUUID();
  const recInactive = randomUUID();
  const therapist = randomUUID();
  const patientId = randomUUID();
  const apptLV = randomUUID();
  const apptCB = randomUUID();
  const START = "2027-01-13T11:00:00.000Z";
  const END = "2027-01-13T12:00:00.000Z";

  const event = (appointmentId: string): PatientChangeEvent => ({
    kind: "cancelled",
    tenantId,
    appointmentId,
    patientId,
    audience: { reception: true, practitionerIds: [therapist] },
    previousStartsAt: START,
    newStartsAt: START,
    occurredAt: START,
  });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    const db = getDbAdmin();
    ({ resolveRecipients } = await import("./centre"));

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Fanout API Co', ${"fanapi-" + tenantId.slice(0, 8)})`);
    await db.execute(raw`insert into roles (id, tenant_id, slug, name) values
      (${roleReception}, ${tenantId}, 'reception', 'Rececao'),
      (${roleTherapist}, ${tenantId}, 'therapist', 'Terapeuta')`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values
      (${locLV}, ${tenantId}, 'Linda-a-Velha'), (${locCB}, ${tenantId}, 'Castelo Branco')`);
    for (const [id, role, active] of [
      [recLV, roleReception, true],
      [recCB, roleReception, true],
      [recBoth, roleReception, true],
      [recNone, roleReception, true],
      [recInactive, roleReception, false],
      [therapist, roleTherapist, true],
    ] as const) {
      await db.execute(raw`insert into users (id, tenant_id, role_id, email, full_name, is_active)
        values (${id}, ${tenantId}, ${role}, ${id.slice(0, 8) + "@fanapi.invalid"}, 'Staff', ${active})`);
    }
    for (const [u, l] of [
      [recLV, locLV],
      [recCB, locCB],
      [recBoth, locLV],
      [recBoth, locCB],
    ] as const) {
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenantId}, ${u}, ${l})`);
    }
    await db.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientId}, ${tenantId}, 'Paciente')`);
    for (const [id, loc] of [
      [apptLV, locLV],
      [apptCB, locCB],
    ] as const) {
      await db.execute(raw`insert into appointments
          (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
        values (${id}, ${tenantId}, ${patientId}, ${therapist}, ${loc},
                ${START}::timestamptz, ${END}::timestamptz, 'cancelled')`);
    }
  });

  it("a Linda-a-Velha change reaches LV, both-clinic and unassigned reception, and the therapist", async () => {
    expect(new Set(await resolveRecipients(event(apptLV)))).toEqual(
      new Set([recLV, recBoth, recNone, therapist]),
    );
  });

  it("a Castelo Branco change never reaches Linda-a-Velha-only reception", async () => {
    const got = new Set(await resolveRecipients(event(apptCB)));
    expect(got).toEqual(new Set([recCB, recBoth, recNone, therapist]));
    expect(got.has(recLV)).toBe(false);
    expect(got.has(recInactive)).toBe(false);
  });
});
