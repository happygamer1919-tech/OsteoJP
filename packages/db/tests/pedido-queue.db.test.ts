/**
 * pedido-queue.db.test.ts
 *
 * W13-04 — the SQL semantics of the reception confirm queue, against a real
 * Postgres. The queue itself lives in apps/web/lib/notifications/centre.ts
 * (`listPendingRequests`); what is asserted here is the pair of guarantees that
 * a mocked test cannot reach, because both are enforced by the DATABASE:
 *
 *   1. THE PREDICATE. The queue is `staff_notifications` of kind
 *      `appointment_request`, inner-joined to `appointments`, kept where the
 *      appointment is still `scheduled`. A confirmed pedido and a cancelled
 *      (that is, declined) pedido both leave the queue by that one predicate.
 *   2. RLS CONFINES IT PER RECIPIENT. Migration 0055 pins the SELECT policy to
 *      `recipient_user_id = auth.uid()`, so the fan-out that gives reception and
 *      both therapists a row does NOT give any of them each other's. This is the
 *      half a query-shape test would pass while production leaked.
 *
 * The query text below is the same shape the Drizzle builder emits. It is
 * deliberately re-stated rather than imported: packages/db cannot import from
 * apps/web, and the point of this suite is the DATABASE's answer, not the
 * builder's.
 *
 * CORRECTNESS. RLS is ENABLE-not-FORCE, so every assertion runs on the
 * role-switched `authenticated` connection via asRole, never on the owner (which
 * BYPASSes RLS by ownership and would pass for the wrong reason). asRole always
 * rolls back. A negative control makes a vacuous pass impossible.
 *
 * GATING: requires a live privileged DATABASE_URL with migrations applied.
 * Skipped without one, identical to every other packages/db suite.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Ids = {
  tenant: string;
  therapistRole: string;
  receptionRole: string;
  therapist: string;
  reception: string;
  location: string;
  service: string;
  patient: string;
};

const newIds = (): Ids => ({
  tenant: randomUUID(),
  therapistRole: randomUUID(),
  receptionRole: randomUUID(),
  therapist: randomUUID(),
  reception: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
});

const T = newIds();

const START = "2026-11-09T09:00:00Z";
const END = "2026-11-09T10:00:00Z";

async function seed(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Pedido Queue', ${`pedido-q-${x.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.therapistRole}, ${x.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${x.receptionRole}, ${x.tenant}, 'reception', 'Reception')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.therapist}, ${x.tenant}, ${x.therapistRole},
                    ${`t-${x.therapist}@example.pt`}, 'Seed Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${x.reception}, ${x.tenant}, ${x.receptionRole},
                    ${`r-${x.reception}@example.pt`}, 'Seed Reception')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${x.location}, ${x.tenant}, 'Linda-a-Velha')`;
  await sql`insert into services (id, tenant_id, location_id, name)
            values (${x.service}, ${x.tenant}, ${x.location}, 'Consulta')`;
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.patient}, ${x.tenant}, 'Seed Patient')`;
}

type Tx = Parameters<Parameters<typeof asRole>[3]>[0];

/** One appointment in a given lifecycle status. Owner-seeded (setup, never an
 *  assertion), so it survives the rolled-back assertion transactions. */
async function seedAppointment(
  sql: Sql,
  x: Ids,
  status: string,
  origin: "staff" | "patient_portal" = "patient_portal",
): Promise<string> {
  const rows = await sql`
    insert into appointments
      (tenant_id, patient_id, practitioner_id, location_id, service_id,
       starts_at, ends_at, status, origin)
    values
      (${x.tenant}, ${x.patient}, ${x.therapist}, ${x.location}, ${x.service},
       ${START}, ${END}, ${status}, ${origin})
    returning id`;
  const id = rows[0]?.id as string | undefined;
  if (!id) throw new Error("seed: appointment insert returned no id");
  return id;
}

/** The appointment_request fan-out for one appointment: reception + therapist,
 *  which is exactly what apps/api resolveRecipients writes (R2). */
async function seedRequestFanout(sql: Sql, x: Ids, appointmentId: string): Promise<void> {
  for (const recipient of [x.reception, x.therapist]) {
    await sql`
      insert into staff_notifications
        (tenant_id, recipient_user_id, kind, appointment_id, patient_id,
         previous_starts_at, new_starts_at, occurred_at)
      values
        (${x.tenant}, ${recipient}, 'appointment_request', ${appointmentId},
         ${x.patient}, ${START}, ${START}, now())`;
  }
}

/**
 * The queue, as the database answers it for whoever the claims name.
 *
 * SR-31: FROM `appointments`, selected on `origin`, with the notification LEFT
 * joined for its instant. Transcribed from `apps/web/lib/notifications/centre.ts`
 * `listPendingRequests`.
 */
async function queue(tx: Tx): Promise<string[]> {
  const rows = await tx`
    select a.id
    from appointments a
    left join patients p on p.id = a.patient_id
    left join staff_notifications n
      on n.appointment_id = a.id and n.kind = 'appointment_request'
    where a.origin = 'patient_portal'
      and a.status = 'scheduled'
    order by a.starts_at asc`;
  return [...new Set(rows.map((r) => r.id as string))];
}

/**
 * THE PRE-SR-31 QUEUE, kept verbatim so the change can be measured as a DELTA
 * rather than asserted.
 *
 * A test that only checked the new query would prove the new query. What has to
 * be shown is that the visible set grew by EXACTLY the pedidos whose
 * best-effort notification emit was lost, and shrank by nothing.
 */
async function queueBeforeSR31(tx: Tx): Promise<string[]> {
  const rows = await tx`
    select a.id
    from staff_notifications n
    join appointments a on a.id = n.appointment_id
    left join patients p on p.id = n.patient_id
    where n.kind = 'appointment_request'
      and a.status = 'scheduled'
    order by a.starts_at asc`;
  return [...new Set(rows.map((r) => r.id as string))];
}

describe.skipIf(!live)("W13-04 — the reception confirm queue", () => {
  let sql: Sql;
  let pending = "";
  let confirmed = "";
  let cancelled = "";
  let staffRow = "";
  let lostEmit = "";

  beforeAll(async () => {
    sql = connect();
    await seed(sql, T);

    pending = await seedAppointment(sql, T, "scheduled");
    confirmed = await seedAppointment(sql, T, "confirmed");
    cancelled = await seedAppointment(sql, T, "cancelled");
    // A staff-created appointment with NO appointment_request notification.
    // origin 'staff' now, which is what actually keeps it out of the queue.
    staffRow = await seedAppointment(sql, T, "scheduled", "staff");

    // THE ROW THIS WHOLE CARD IS ABOUT: a portal pedido whose best-effort
    // notification emit was LOST. The appointment exists, is marked
    // patient_portal, is still awaiting a decision - and before SR-31 nobody was
    // ever told about it, while the patient had been shown "pedido recebido".
    lostEmit = await seedAppointment(sql, T, "scheduled");

    await seedRequestFanout(sql, T, pending);
    await seedRequestFanout(sql, T, confirmed);
    await seedRequestFanout(sql, T, cancelled);
    // Deliberately NO fan-out for lostEmit.
  });

  afterAll(async () => {
    if (!sql) return;
    // staff_notifications.tenant_id has NO ON DELETE CASCADE. Migration 0055
    // cascades `recipient_user_id` and says so explicitly ("recipient_user_id
    // DOES cascade, and that is the one place"), because a notification is a
    // message TO someone. The tenant reference is a plain FK, so the seeded
    // rows have to go first or the tenant delete is REFUSED — which is what
    // failed this suite's teardown on its first CI run, after all seven
    // assertions had already passed.
    await sql`delete from staff_notifications where tenant_id = ${T.tenant}`;
    await sql`delete from tenants where id = ${T.tenant}`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: RLS is in force — ANOTHER TENANT sees nothing", async () => {
    // If this returns rows, RLS is off and every assertion below is meaningless.
    //
    // THE CONTROL MOVED FROM "a non-recipient" TO "another tenant", AND THE
    // REASON IS A REAL BEHAVIOUR CHANGE RECORDED BELOW - not a test bent to fit.
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(randomUUID(), "admin", randomUUID()),
      queue,
    );
    expect(rows).toEqual([]);
  });

  it("SR-31 WIDENS the queue to an UNASSIGNED admin, and this is the change to read", async () => {
    // BEFORE: the queue was FROM staff_notifications, whose 0055 policy pins
    // SELECT to recipient_user_id = auth.uid(). An admin who was not a fan-out
    // recipient saw nothing, whatever their location scope.
    //
    // AFTER: the queue is FROM appointments, so `appointments_rls` governs. For
    // an admin with NO staff_locations rows that predicate is
    // `NOT viewer_has_location_assignment()`, which is TRUE - PL-09's documented
    // NO-LOCKOUT fallback, the same one that already gives them every
    // appointment on the agenda and every row in /patients.
    //
    // SO IT IS NOT NEW DATA. It is the same appointment, by another door, and
    // the pedido queue was the one surface that hid it - incidentally, because
    // they happened not to be a recipient. What the change costs is that the
    // queue's audience is now the appointment scope rather than the fan-out
    // list, and that is worth a WF-03 sitting rather than a silent deploy.
    const unassignedAdmin = randomUUID();
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(T.tenant, "admin", unassignedAdmin),
      queue,
    );
    expect(rows).toContain(pending);

    // And the pre-SR-31 query, on the same fixture, showed them nothing.
    const before = await asRole(
      sql,
      "authenticated",
      claimsFor(T.tenant, "admin", unassignedAdmin),
      queueBeforeSR31,
    );
    expect(before).toEqual([]);
  });

  it("lists the pedido that is still awaiting a decision", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), queue);
    expect(rows).toContain(pending);
  });

  it("THE DELTA: the queue grows by EXACTLY the lost-emit pedido, and shrinks by nothing", async () => {
    // A test that only checked the new query would prove the new query. What has
    // to be shown is that the visible set grew by exactly the pedidos whose
    // notification was lost - and lost NOTHING that was visible before.
    const claims = claimsFor(T.tenant, "reception", T.reception);
    const before = new Set(await asRole(sql, "authenticated", claims, queueBeforeSR31));
    const after = new Set(await asRole(sql, "authenticated", claims, queue));

    const gained = [...after].filter((id) => !before.has(id));
    const lost = [...before].filter((id) => !after.has(id));

    expect(gained).toEqual([lostEmit]);
    expect(lost).toEqual([]);
  });

  it("the lost-emit pedido was INVISIBLE before and is visible now", async () => {
    const claims = claimsFor(T.tenant, "reception", T.reception);
    expect(await asRole(sql, "authenticated", claims, queueBeforeSR31)).not.toContain(lostEmit);
    expect(await asRole(sql, "authenticated", claims, queue)).toContain(lostEmit);
  });

  it("a STAFF appointment with no notification still stays out - origin is the gate", async () => {
    // The obvious wrong version of this change would surface every appointment
    // that happens to lack a notification. `origin` is what separates a portal
    // pedido whose emit was lost from a staff booking that never had one.
    const claims = claimsFor(T.tenant, "reception", T.reception);
    expect(await asRole(sql, "authenticated", claims, queue)).not.toContain(staffRow);
  });

  it("EXCLUDES a confirmed pedido — reception already decided", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), queue);
    expect(rows).not.toContain(confirmed);
  });

  it("EXCLUDES a cancelled (declined) pedido by the same predicate", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), queue);
    expect(rows).not.toContain(cancelled);
  });

  it("EXCLUDES a staff appointment that has no appointment_request row", async () => {
    // The inner join is what makes the queue a list of PEDIDOS rather than a
    // list of every unconfirmed appointment in the clinic.
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), queue);
    expect(rows).not.toContain(staffRow);
  });

  it("RLS confines the queue per recipient: the therapist gets their own row", async () => {
    // Both are recipients of the same fan-out, so both see the pedido — through
    // their OWN notification row, never each other's.
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "therapist", T.therapist), queue);
    expect(rows).toContain(pending);
  });

  it("one recipient reads exactly ONE notification row per pedido", async () => {
    // Proves the per-recipient confinement quantitatively: the fan-out wrote two
    // rows for `pending`, and a single caller must see one of them. Without the
    // RLS predicate this count would be 2 and the queue would render the same
    // pedido twice.
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(T.tenant, "reception", T.reception),
      (tx) => tx`
        select count(*)::int as n
        from staff_notifications n
        where n.kind = 'appointment_request' and n.appointment_id = ${pending}`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});
