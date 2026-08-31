/**
 * inbound-store.db.test.ts — the reception queue against a REAL Postgres.
 *
 * WHY IT MUST BE A DATABASE. Every property here belongs to the database:
 *
 *   - the queue predicate is `resolution IS NULL`, so what is IN the queue is a
 *     fact about stored state, not about a filter the code applies;
 *   - a Twilio redelivery is refused by a UNIQUE INDEX, and `onConflictDoNothing`
 *     turning that into a no-op cannot be proven against a mock that has no
 *     index to violate;
 *   - resolving "confirmada" can LOSE to 0061's exclusion constraint, and the
 *     assertion that matters is that NOTHING is written when it does - not the
 *     appointment, not the resolution.
 *
 * It also exercises the two seams the store deliberately keeps apart: the write
 * goes through withReminderTenantContext (no session, role `admin`, the webhook's
 * seam) and the reads and resolves go through runScoped with a caller context,
 * so RLS answers as that person. A test that used one seam for both would prove
 * the store agrees with itself.
 *
 * Skipped without DATABASE_URL, and hard-required in assert-rls-executed.mjs so
 * a silent skip reddens the DB-gated job.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

const H = 60 * 60 * 1000;

d("the reception reply queue against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  let locationId: string;
  let receptionist: string;

  /** The caller context the page would pass. Reception, per the ruling. */
  let ctx: { tenantId: string; role: "reception"; userId: string };

  let seq = 0;
  const nextSid = () => `SM-fixture-${(seq += 1)}-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
              values (${tenantId}, 'Queue Co', ${"q-" + tenantId.slice(0, 8)})`);

    receptionist = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
              values (${receptionist}, ${tenantId},
                      ${"r-" + receptionist.slice(0, 8) + "@t.test"}, 'Rececao', true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
              values (${locationId}, ${tenantId}, 'Sede')`);

    ctx = { tenantId, role: "reception", userId: receptionist };
  });

  // ==================================================================
  // THE USERS ARE NOT DELETED, AND THE DATABASE IS RIGHT TO REFUSE.
  // ==================================================================
  // This teardown originally ended `delete from users where tenant_id = ...`,
  // copied from redeem.db.test.ts where it is correct. It is NOT correct here,
  // and the difference is which audit table the code under test writes to.
  //
  // redeem.ts writes `patient_audit_log`, whose actor is a PATIENT and which
  // therefore has no FK to `users`. resolveReviewItem writes `audit_log`, whose
  // `actor_user_id` DOES reference `users` - ON DELETE NO ACTION, deliberately,
  // because an audit trail that loses its actor when a staff member leaves is
  // not an audit trail. So the delete raises 23503 and the whole suite errors.
  //
  // THE FIX IS NOT TO REMOVE THE ROWS THAT REFERENCE THEM. That would be the
  // "disable the guarantee to tidy up" move INC-db-gated-trigger-race was
  // opened for, and it would delete audit rows this test just asserted exist.
  // The fixture users are left behind, exactly as redeem.db.test.ts leaves its
  // tenant row behind for the same reason (0054: "Deleting a tenant that still
  // holds a patient audit trail is refused, which is the correct answer for an
  // audit trail"). CI recreates the database every run; a local run accumulates
  // a handful of tiny rows, which is the honest price of an append-only trail.
  //
  // Every read in this file is scoped to a freshly-minted id, so leftovers from
  // a previous run are invisible to a later one.
  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  async function seedPatient(name = "Paciente Teste"): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
              values (${id}, ${tenantId}, ${name})`);
    return id;
  }

  async function seedPractitioner(): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
              values (${id}, ${tenantId}, ${"p-" + id.slice(0, 8) + "@t.test"}, 'Dra', true)`);
    return id;
  }

  async function seedAppointment(args: {
    patientId: string;
    hoursFromNow?: number;
    status?: string;
    practitioner?: string;
  }): Promise<string> {
    const id = randomUUID();
    const h = args.hoursFromNow ?? 20;
    const starts = new Date(Date.now() + h * H).toISOString();
    const ends = new Date(Date.now() + (h + 1) * H).toISOString();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id,
                 starts_at, ends_at, status)
              values (${id}, ${tenantId}, ${args.patientId},
                      ${args.practitioner ?? (await seedPractitioner())}, ${locationId},
                      ${starts}, ${ends}, ${args.status ?? "scheduled"})`);
    return id;
  }

  async function file(over: Record<string, unknown> = {}) {
    const { recordInboundReply } = await import("./inbound-store");
    const args = {
      tenantId,
      providerMessageSid: nextSid(),
      fromPhone: "+351912345678",
      body: "talvez para sexta",
      classification: "review",
      reviewReason: "ambiguous",
      patientId: null,
      appointmentId: null,
      resolved: false,
      ...over,
    };
    await recordInboundReply(args as Parameters<typeof recordInboundReply>[0]);
    return args;
  }

  async function queue() {
    const { listReviewQueue } = await import("./inbound-store");
    return listReviewQueue(ctx);
  }

  async function resolve(itemId: string, resolution: "confirmed" | "cancelled" | "read") {
    const { resolveReviewItem } = await import("./inbound-store");
    return resolveReviewItem({ ctx, itemId, resolution });
  }

  /* ------------------------------- filing -------------------------------- */

  it("files a review reply and it appears in the queue with its context", async () => {
    const patientId = await seedPatient("Madalena Sousa");
    const appointmentId = await seedAppointment({ patientId });
    await file({ patientId, appointmentId, body: "pode ser mais tarde?" });

    const q = await queue();
    const row = q.find((r) => r.body === "pode ser mais tarde?");
    expect(row).toBeDefined();
    expect(row!.patientName).toBe("Madalena Sousa");
    expect(row!.appointmentId).toBe(appointmentId);
    expect(row!.appointmentStatus).toBe("scheduled");
    expect(row!.reviewReason).toBe("ambiguous");
  });

  it("THE SENDER'S NUMBER IS NEVER STORED IN CLEAR", async () => {
    // The load-bearing PII assertion. A queue row is read by staff and lives
    // indefinitely; an unmatched number is PII the clinic has no relationship
    // to. The hash still groups two messages from the same stranger.
    const sid = nextSid();
    await file({ providerMessageSid: sid, fromPhone: "+351969000111" });
    const stored = await rows(
      raw`select from_phone_hash, body from sms_inbound_events
           where tenant_id = ${tenantId} and provider_message_sid = ${sid}`,
    );
    expect(stored).toHaveLength(1);
    expect(String(stored[0]!.from_phone_hash)).not.toContain("969000111");
    expect(String(stored[0]!.from_phone_hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the same sender hashes the same way twice, so replies group", async () => {
    const { hashSender } = await import("./inbound-store");
    expect(hashSender("+351912345678")).toBe(hashSender("+351912345678"));
    expect(hashSender("+351912345678")).not.toBe(hashSender("+351912345679"));
  });

  it("an AUTO-RESOLVED reply is stored but never enters the queue", async () => {
    // A confirmed reply is still the clinic's inbound correspondence and the
    // text has to be somewhere - but nobody has to do anything about it.
    const patientId = await seedPatient();
    const appointmentId = await seedAppointment({ patientId });
    const sid = nextSid();
    await file({
      providerMessageSid: sid,
      patientId,
      appointmentId,
      body: "Sim",
      classification: "confirmada",
      reviewReason: null,
      resolved: true,
    });

    expect((await queue()).some((r) => r.body === "Sim")).toBe(false);
    const stored = await rows(
      raw`select resolution, resolved_at, resolved_by from sms_inbound_events
           where tenant_id = ${tenantId} and provider_message_sid = ${sid}`,
    );
    expect(stored[0]!.resolution).toBe("read");
    expect(stored[0]!.resolved_at).not.toBeNull();
    // No person resolved it. Naming a staff user here would invent an actor.
    expect(stored[0]!.resolved_by).toBeNull();
  });

  it("A TWILIO REDELIVERY IS A NO-OP, not a second queue item", async () => {
    const sid = nextSid();
    await file({ providerMessageSid: sid, body: "duplicado" });
    await file({ providerMessageSid: sid, body: "duplicado" });
    const stored = await rows(
      raw`select count(*)::int as n from sms_inbound_events
           where tenant_id = ${tenantId} and provider_message_sid = ${sid}`,
    );
    expect(stored[0]!.n).toBe(1);
  });

  /* ------------------------------ resolving ------------------------------ */

  it("marking READ files the reply and moves no appointment", async () => {
    const patientId = await seedPatient();
    const appointmentId = await seedAppointment({ patientId });
    await file({ patientId, appointmentId, body: "obrigado" });
    const item = (await queue()).find((r) => r.body === "obrigado")!;

    expect(await resolve(item.id, "read")).toEqual({ ok: true, applied: false });
    expect((await queue()).some((r) => r.id === item.id)).toBe(false);

    const appt = await rows(
      raw`select status from appointments where id = ${appointmentId}`,
    );
    expect(appt[0]!.status).toBe("scheduled");
  });

  it("marking CONFIRMADA moves the matched appointment and records who did it", async () => {
    const patientId = await seedPatient();
    const appointmentId = await seedAppointment({ patientId });
    await file({ patientId, appointmentId, body: "acho que sim" });
    const item = (await queue()).find((r) => r.body === "acho que sim")!;

    expect(await resolve(item.id, "confirmed")).toEqual({ ok: true, applied: true });

    const appt = await rows(
      raw`select status, confirmation_state, confirmation_channel
            from appointments where id = ${appointmentId}`,
    );
    expect(appt[0]!.status).toBe("confirmed");
    // NOT "sms". The patient's own reply writes that; a human at the desk
    // deciding on their behalf is a different fact.
    expect(appt[0]!.confirmation_channel).toBe("sms_review");

    const stored = await rows(
      raw`select resolution, resolved_by from sms_inbound_events where id = ${item.id}`,
    );
    expect(stored[0]!.resolution).toBe("confirmed");
    expect(stored[0]!.resolved_by).toBe(receptionist);

    const audit = await rows(
      raw`select metadata from audit_log
           where entity_id = ${appointmentId}
             and action = 'appointment.sms_reply_reviewed'`,
    );
    const meta = audit[0]!.metadata as Record<string, unknown>;
    expect(meta.source).toBe("reception-sms-review");
    expect(meta.applied).toBe(true);
  });

  it("marking CANCELADA cancels the matched appointment", async () => {
    const patientId = await seedPatient();
    const appointmentId = await seedAppointment({ patientId });
    await file({ patientId, appointmentId, body: "nao vou poder ir" });
    const item = (await queue()).find((r) => r.body === "nao vou poder ir")!;

    expect(await resolve(item.id, "cancelled")).toEqual({ ok: true, applied: true });
    const appt = await rows(raw`select status from appointments where id = ${appointmentId}`);
    expect(appt[0]!.status).toBe("cancelled");
  });

  it("resolves with applied:false when the reply matched NO appointment", async () => {
    // The commonest review case. The row still leaves the queue - reception
    // has read it and decided - but nothing was confirmed, and the outcome
    // says so rather than implying an appointment moved.
    await file({ body: "quem fala?" });
    const item = (await queue()).find((r) => r.body === "quem fala?")!;
    expect(await resolve(item.id, "confirmed")).toEqual({ ok: true, applied: false });

    const audit = await rows(
      raw`select metadata from audit_log
           where action = 'appointment.sms_reply_reviewed' and entity_id is null`,
    );
    expect(audit.length).toBeGreaterThan(0);
  });

  it("resolves with applied:false when the appointment is no longer scheduled", async () => {
    const patientId = await seedPatient();
    const appointmentId = await seedAppointment({ patientId, status: "completed" });
    await file({ patientId, appointmentId, body: "ja fui" });
    const item = (await queue()).find((r) => r.body === "ja fui")!;

    expect(await resolve(item.id, "confirmed")).toEqual({ ok: true, applied: false });
    const appt = await rows(raw`select status from appointments where id = ${appointmentId}`);
    expect(appt[0]!.status).toBe("completed");
  });

  it("resolving TWICE is refused — the second press is not a second move", async () => {
    const patientId = await seedPatient();
    const appointmentId = await seedAppointment({ patientId });
    await file({ patientId, appointmentId, body: "duas vezes" });
    const item = (await queue()).find((r) => r.body === "duas vezes")!;

    expect(await resolve(item.id, "read")).toEqual({ ok: true, applied: false });
    expect(await resolve(item.id, "confirmed")).toEqual({ ok: false, reason: "not_found" });
    const appt = await rows(raw`select status from appointments where id = ${appointmentId}`);
    expect(appt[0]!.status).toBe("scheduled");
  });

  it("DOUBLE CONFIRMED: the constraint refuses and NOTHING is written", async () => {
    const shared = await seedPractitioner();
    const holder = await seedPatient();
    const patientId = await seedPatient();
    const starts = new Date(Date.now() + 30 * H).toISOString();
    const ends = new Date(Date.now() + 31 * H).toISOString();

    const held = randomUUID();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
              values (${held}, ${tenantId}, ${holder}, ${shared}, ${locationId},
                      ${starts}, ${ends}, 'confirmed')`);
    const stacked = randomUUID();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
              values (${stacked}, ${tenantId}, ${patientId}, ${shared}, ${locationId},
                      ${starts}, ${ends}, 'scheduled')`);

    await file({ patientId, appointmentId: stacked, body: "confirmo pois" });
    const item = (await queue()).find((r) => r.body === "confirmo pois")!;

    expect(await resolve(item.id, "confirmed")).toEqual({
      ok: false,
      reason: "double_booked",
    });

    // NOTHING WAS WRITTEN. Not the appointment, and not the resolution - so
    // the item is STILL IN THE QUEUE, which is where a decision that could not
    // be carried out belongs.
    const appt = await rows(raw`select status from appointments where id = ${stacked}`);
    expect(appt[0]!.status).toBe("scheduled");
    expect((await queue()).some((r) => r.id === item.id)).toBe(true);
  });

  /* -------------------------------- order -------------------------------- */

  it("the queue is OLDEST FIRST — a work queue is worked from the front", async () => {
    const q = await queue();
    const times = q.map((r) => new Date(r.receivedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
