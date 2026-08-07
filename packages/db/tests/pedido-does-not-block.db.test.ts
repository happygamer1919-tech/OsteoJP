/**
 * pedido-does-not-block.db.test.ts
 *
 * W13-04a — JP's option B, against a real Postgres.
 *
 * THE RULING: an UNCONFIRMED PEDIDO does not occupy its slot. Staff may book
 * over it and another patient may book it, until reception confirms.
 *
 * The two assertions the ruling's own list names as waiting on this migration
 * are here, and both are DB-gated BY NATURE — the exclusion lives inside a
 * SECURITY DEFINER function, so a mocked test would be asserting against a mock
 * of the thing under test:
 *
 *   1. an unconfirmed pedido does not block STAFF booking the same slot
 *      (`appointment_conflicts`, the staff hard block on save)
 *   2. an unconfirmed pedido does not block ANOTHER PATIENT booking the same
 *      slot (the `patient`-role path, which is the one that cannot read
 *      `staff_notifications` at all)
 *
 * WHAT IS DELIBERATELY ALSO ASSERTED, because the ruling frees a slot and every
 * freeing change has a symmetric way to be wrong: a staff booking with no
 * `appointment_request` row STILL blocks, and a CONFIRMED pedido STILL blocks.
 * A migration that frees too much would pass 1 and 2 and be a double-booking
 * generator.
 *
 * CORRECTNESS. RLS is ENABLE-not-FORCE, so every assertion runs through
 * `asRole` on a role-switched connection, never on the owner (which BYPASSes
 * RLS by ownership and would pass for the wrong reason). `asRole` always rolls
 * back. A negative control makes a vacuous pass impossible.
 *
 * GATING: requires a live privileged DATABASE_URL with migrations applied.
 * Skipped without one, identical to every other packages/db suite.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live, patientClaims } from "./rls-harness";

type Ids = {
  tenant: string;
  therapistRole: string;
  receptionRole: string;
  therapist: string;
  reception: string;
  location: string;
  service: string;
  patient: string;
  otherPatient: string;
};

const T: Ids = {
  tenant: randomUUID(),
  therapistRole: randomUUID(),
  receptionRole: randomUUID(),
  therapist: randomUUID(),
  reception: randomUUID(),
  location: randomUUID(),
  service: randomUUID(),
  patient: randomUUID(),
  otherPatient: randomUUID(),
};

/** One window, contested by everything in this suite. */
const START = "2026-12-14T09:00:00Z";
const END = "2026-12-14T10:00:00Z";
const ROOM = "Sala 1";

type Tx = Parameters<Parameters<typeof asRole>[3]>[0];

async function seed(sql: Sql, x: Ids): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${x.tenant}, 'Pedido Block', ${`pedido-b-${x.tenant}`})`;
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
  await sql`insert into patients (id, tenant_id, full_name)
            values (${x.otherPatient}, ${x.tenant}, 'Other Patient')`;
}

async function seedAppointment(sql: Sql, x: Ids, status: string): Promise<string> {
  const rows = await sql`
    insert into appointments
      (tenant_id, patient_id, practitioner_id, location_id, service_id,
       starts_at, ends_at, status, room)
    values
      (${x.tenant}, ${x.patient}, ${x.therapist}, ${x.location}, ${x.service},
       ${START}, ${END}, ${status}, ${ROOM})
    returning id`;
  const id = rows[0]?.id as string | undefined;
  if (!id) throw new Error("seed: appointment insert returned no id");
  return id;
}

/** The portal fan-out: reception + the assigned therapist (R2). */
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

/** The STAFF hard block on save, exactly as apps/web findConflicts reaches it. */
async function conflicts(tx: Tx): Promise<string[]> {
  const rows = await tx`
    select id from public.appointment_conflicts(
      ${T.therapist}::uuid, ${T.location}::uuid, ${ROOM},
      ${START}::timestamptz, ${END}::timestamptz, null::uuid[]
    )`;
  return rows.map((r) => r.id as string);
}

describe.skipIf(!live)("W13-04a — an unconfirmed pedido does not occupy its slot", () => {
  let sql: Sql;
  let pedido = "";
  let confirmedPedido = "";
  let staffBooking = "";

  beforeAll(async () => {
    sql = connect();
    await seed(sql, T);

    // The pedido: scheduled, with the appointment_request fan-out.
    pedido = await seedAppointment(sql, T, "scheduled");
    await seedRequestFanout(sql, T, pedido);

    // A pedido reception ALREADY confirmed. It left `scheduled`, so the
    // exclusion no longer matches it and it must block again.
    confirmedPedido = await seedAppointment(sql, T, "confirmed");
    await seedRequestFanout(sql, T, confirmedPedido);

    // An ordinary staff booking: `scheduled`, but NO appointment_request row.
    // Same status as the pedido, and the reason status alone cannot be the
    // marker - excluding every `scheduled` row would free the whole clinic.
    staffBooking = await seedAppointment(sql, T, "scheduled");
  });

  afterAll(async () => {
    if (!sql) return;
    // staff_notifications.tenant_id has no ON DELETE CASCADE, so its rows go
    // first or the tenant delete is REFUSED - the teardown failure that hit
    // pedido-queue.db.test.ts on its first CI run, after every assertion passed.
    await sql`delete from staff_notifications where tenant_id = ${T.tenant}`;
    await sql`delete from tenants where id = ${T.tenant}`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: the function reports SOMETHING, so an empty result is not the default", async () => {
    // Without this, every "does not block" assertion below could pass because
    // the function returns nothing at all - wrong tenant, wrong window, wrong
    // arguments. The staff booking must be visible for the rest to mean anything.
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), conflicts);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("1. an unconfirmed pedido does NOT block staff booking the same slot", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), conflicts);
    expect(rows).not.toContain(pedido);
  });

  /**
   * THE SAME ANSWER FOR A CALLER WHO IS NOT A NOTIFICATION RECIPIENT.
   *
   * This is the case that decided the design. 0055 pins the staff_notifications
   * SELECT policy to `recipient_user_id = auth.uid()`, so an app-layer
   * `NOT EXISTS` would see no row for this caller, conclude "not a pedido", and
   * report a conflict - the slot busy for an admin and free for reception, each
   * screen self-consistent and the two disagreeing. SECURITY DEFINER is what
   * makes this pass.
   */
  it("1b. and it does not block an ADMIN either, who is not a recipient of the notification", async () => {
    const stranger = randomUUID();
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "admin", stranger), conflicts);
    expect(rows).not.toContain(pedido);
    // Same call, same transaction shape: the staff booking still blocks, so this
    // is not "the admin sees nothing".
    expect(rows).toContain(staffBooking);
  });

  /**
   * 2. THE PATIENT PATH. apps/api runs under `set local role patient`, which has
   * NO grant on staff_notifications - an inline read there would ERROR rather
   * than return false. This asserts the patient role can call the helper at all
   * and gets the right answer, which is the whole reason it is a granted
   * SECURITY DEFINER function.
   */
  it("2. an unconfirmed pedido does NOT block another patient booking the same slot", async () => {
    const rows = await asRole(
      sql,
      "patient",
      patientClaims(T.tenant, T.otherPatient),
      (tx) => tx`select public.is_unconfirmed_pedido(${pedido}::uuid) as blocked`,
    );
    expect(rows[0]?.blocked).toBe(true);
  });

  it("2b. and the patient role gets the SAME answers as staff for every row", async () => {
    const ask = (id: string) =>
      asRole(
        sql,
        "patient",
        patientClaims(T.tenant, T.otherPatient),
        (tx) => tx`select public.is_unconfirmed_pedido(${id}::uuid) as v`,
      ).then((r) => r[0]?.v as boolean);

    expect(await ask(pedido)).toBe(true);
    expect(await ask(confirmedPedido)).toBe(false);
    expect(await ask(staffBooking)).toBe(false);
  });

  /* ---------------------------------------------------------------- */
  /* The symmetric failures. A change that frees a slot has to be      */
  /* checked for freeing too much, not only for freeing enough.        */
  /* ---------------------------------------------------------------- */

  it("a STAFF booking still blocks — it is `scheduled` too, so status alone is not the marker", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), conflicts);
    expect(rows).toContain(staffBooking);
  });

  it("a CONFIRMED pedido blocks again — confirming is what makes it occupy the slot", async () => {
    const rows = await asRole(sql, "authenticated", claimsFor(T.tenant, "reception", T.reception), conflicts);
    expect(rows).toContain(confirmedPedido);
  });

  /**
   * TWO CONFIRMS STILL CANNOT BOTH SUCCEED, which is what makes option B safe.
   * The pedido no longer blocks, but the moment one is confirmed it does - so
   * the second confirm's transactional re-check finds it. Asserted here at the
   * SQL level; the locking and the re-check are in confirmAppointmentRequest.
   */
  it("the freed slot re-closes the instant a pedido is confirmed", async () => {
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(T.tenant, "reception", T.reception),
      async (tx) => {
        // Inside the rolled-back assertion transaction, so nothing persists.
        await tx`update appointments set status = 'confirmed' where id = ${pedido}`;
        return tx`
          select id from public.appointment_conflicts(
            ${T.therapist}::uuid, ${T.location}::uuid, ${ROOM},
            ${START}::timestamptz, ${END}::timestamptz, null::uuid[]
          )`;
      },
    );
    expect(rows.map((r) => r.id as string)).toContain(pedido);
  });

  it("the exclusion applies on the ROOM branch as well as the therapist branch", async () => {
    // A half-applied ruling - one branch excluded, the other not - would free the
    // slot on the therapist axis and keep blocking on the room axis. The room
    // branch is reached by asking with a DIFFERENT therapist and the same room.
    const otherTherapist = randomUUID();
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(T.tenant, "reception", T.reception),
      (tx) => tx`
        select id, kind from public.appointment_conflicts(
          ${otherTherapist}::uuid, ${T.location}::uuid, ${ROOM},
          ${START}::timestamptz, ${END}::timestamptz, null::uuid[]
        )`,
    );
    const ids = rows.map((r) => r.id as string);
    // Positive control: the room branch IS reporting, so the absence below is
    // the exclusion working and not the branch being unreachable.
    expect(ids).toContain(staffBooking);
    expect(rows.every((r) => r.kind === "room")).toBe(true);
    expect(ids).not.toContain(pedido);
  });

  it("is tenant-scoped, so an id from another tenant answers false rather than leaking", async () => {
    // SECURITY DEFINER bypasses RLS, so without the tenant clause the helper
    // would answer for any appointment id in the database.
    const rows = await asRole(
      sql,
      "authenticated",
      claimsFor(randomUUID(), "admin", randomUUID()),
      (tx) => tx`select public.is_unconfirmed_pedido(${pedido}::uuid) as v`,
    );
    expect(rows[0]?.v).toBe(false);
  });
});
