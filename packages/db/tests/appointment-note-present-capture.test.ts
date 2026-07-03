/**
 * appointment-note-present-capture.test.ts
 *
 * DB-gated proof of the soft completion gate's audit trail (Q-ROW8-1,
 * DECISIONS.md 2026-07-01): completing an appointment with NO per-visit note is
 * ALLOWED but RECORDED. The recording is a `note_present` boolean on the
 * `appointment_status_changed` analytics_events payload (0025), computed as
 * EXISTS(appointment_notes for that appointment, tenant-scoped). The emission
 * lives in apps/web (lib/scheduling/analytics.ts: writeAppointmentStatusChanged
 * Event), which the db-tests gate never imports — yet its two DB-decided
 * guarantees are settled by Postgres:
 *
 *   1. note_present TRUTH — EXISTS over appointment_notes returns true iff a note
 *      is attached, under the caller's tenant. A completed visit with a note →
 *      true; with zero notes → false.
 *   2. TENANT SCOPING — the emitted analytics_events row is confined by RLS to
 *      the owning tenant; a foreign tenant's authenticated JWT sees ZERO rows.
 *
 * DUPLICATION NOTE (same guardrail posture as appointment-clone-rls.test.ts):
 * packages/db must NOT import apps/web, so the emission's note_present SQL is
 * duplicated MINIMALLY here as one INSERT whose payload mirrors the helper. It
 * goes red if that jsonb/EXISTS shape drifts. The canonical emitter is
 * analytics.ts, unit-tested in apps/web (analytics.test.ts).
 *
 * CORRECTNESS: RLS is ENABLE-not-FORCE, so every isolation assertion runs on the
 * role-switched `authenticated` connection via asRole (never the owner, which
 * BYPASSes RLS). asRole always rolls back, so nothing an assertion writes persists.
 * A negative control (the persisted event really exists for A) makes a vacuous
 * cross-tenant pass impossible.
 *
 * GATING: requires a live, PRIVILEGED DATABASE_URL (local Supabase owner role)
 * with migrations applied. Skipped when DATABASE_URL is absent so `vitest run`
 * stays green in CI without a DB — identical to the other packages/db suites.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  role: string;
  user: string;
  location: string;
  service: string;
  patient: string;
  episode: string;
  apptWithNote: string;
  apptNoNote: string;
  // A persisted emitted event (seeded by owner) for the isolation assertions.
  persistedEvent: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  role: randomUUID(),
  user: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
  episode: randomUUID(),
  apptWithNote: randomUUID(),
  apptNoNote: randomUUID(),
  persistedEvent: randomUUID(),
});

const A = newIds();
const B = newIds();

const START = "2026-03-04T09:00:00Z";
const END = "2026-03-04T10:00:00Z";

async function seedTenant(sql: Sql, x: Ids, full: boolean): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Note Present Gate', ${`note-present-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.role}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.user}, ${x.tenant}, ${x.role}, ${`t-${x.user}@example.pt`}, 'Seed Therapist')`;
  if (!full) return;
  await sql`insert into locations (id, tenant_id, name)
            values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${x.service}, ${x.tenant}, ${x.location}, 'Consulta')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
  await sql`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title)
            values (${x.episode}, ${x.tenant}, ${x.patient}, ${x.user}, 'Ep')`;
  // Two appointments: one that WILL carry a per-visit note, one that never does.
  await sql`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status)
    values
      (${x.apptWithNote}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service}, ${START}, ${END}, 'confirmed'),
      (${x.apptNoNote}, ${x.tenant}, ${x.patient}, ${x.user}, ${x.location}, ${x.service}, ${START}, ${END}, 'confirmed')`;
  // A per-visit note (0026) on apptWithNote only.
  await sql`insert into appointment_notes
      (tenant_id, appointment_id, patient_id, episode_id, author_user_id, body)
    values (${x.tenant}, ${x.apptWithNote}, ${x.patient}, ${x.episode}, ${x.user}, 'visit note')`;
  // A persisted emitted event carrying note_present=true, for isolation checks.
  await sql`insert into analytics_events
      (id, tenant_id, event_type, entity_type, entity_id, therapist_user_id, location_id, actor_user_id, payload, occurred_at)
    values (${x.persistedEvent}, ${x.tenant}, 'appointment_status_changed', 'appointment', ${x.apptWithNote},
            ${x.user}, ${x.location}, ${x.user},
            ${JSON.stringify({
              appointment_id: x.apptWithNote,
              from_status: "confirmed",
              to_status: "completed",
              actor: x.user,
              note_present: true,
            })}::jsonb,
            ${START})`;
}

/**
 * The emission mirror: the note_present half of writeAppointmentStatusChanged
 * Event, as ONE INSERT under the caller's tenant. note_present = EXISTS over
 * appointment_notes (tenant-scoped). Returns the resolved boolean.
 */
async function emitCompletion(tx: Parameters<Parameters<typeof asRole>[3]>[0], t: Ids, appointmentId: string) {
  const rows = await tx<{ note_present: boolean }[]>`
    insert into analytics_events
      (tenant_id, event_type, entity_type, entity_id, therapist_user_id, location_id, actor_user_id, payload, occurred_at)
    values
      (${t.tenant}, 'appointment_status_changed', 'appointment', ${appointmentId},
       ${t.user}, ${t.location}, ${t.user},
       jsonb_build_object(
         'appointment_id', ${appointmentId}::text,
         'from_status', 'confirmed',
         'to_status', 'completed',
         'actor', ${t.user}::text,
         'note_present', exists(
           select 1 from appointment_notes
           where tenant_id = ${t.tenant} and appointment_id = ${appointmentId})
       ),
       now())
    returning (payload->>'note_present')::boolean as note_present`;
  return rows[0]!.note_present;
}

describe.skipIf(!live)("appointment completion — note_present capture (Q-ROW8-1)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seedTenant(sql, A, true);
    await seedTenant(sql, B, false);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  describe("note_present truth (emit under the appointment's own tenant)", () => {
    it("completion WITH a per-visit note → note_present=true", async () => {
      const notePresent = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        emitCompletion(tx, A, A.apptWithNote),
      );
      expect(notePresent).toBe(true);
    });

    it("completion with ZERO notes → note_present=false", async () => {
      const notePresent = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        emitCompletion(tx, A, A.apptNoNote),
      );
      expect(notePresent).toBe(false);
    });
  });

  describe("tenant scoping of the emitted event", () => {
    it("NEGATIVE CONTROL: tenant A's authenticated JWT sees its own emitted event", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(A.tenant), (tx) =>
        tx<{ note_present: boolean }[]>`
          select (payload->>'note_present')::boolean as note_present
          from analytics_events where id = ${A.persistedEvent}`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0]!.note_present).toBe(true);
    });

    it("a FOREIGN tenant's authenticated JWT sees ZERO rows for A's event", async () => {
      const rows = await asRole(sql, "authenticated", claimsFor(B.tenant), (tx) =>
        tx<{ id: string }[]>`
          select id from analytics_events where id = ${A.persistedEvent}`,
      );
      expect(rows.length).toBe(0);
    });
  });
});
