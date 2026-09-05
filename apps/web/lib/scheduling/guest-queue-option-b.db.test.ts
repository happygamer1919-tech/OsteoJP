/**
 * guest-queue-option-b.db.test.ts - THE ROW STAYS IN THE QUEUE, AGAINST A REAL
 * POSTGRES.
 *
 * ==========================================================================
 * WHY THIS EXISTS BESIDE guest-queue-access.test.ts RATHER THAN INSIDE IT
 * ==========================================================================
 * That suite answers "who may read this queue" and it answers it with a fake
 * query builder that returns a fixture array. The fake cannot see a WHERE
 * clause - it filters on `inArray` and ignores every other predicate - so it
 * would pass unchanged if `handled_at IS NULL` were deleted from both the list
 * and the count tomorrow.
 *
 * And `handled_at IS NULL` is the whole of the owner's option B ruling on the
 * read side. Before it, the convert wrote `status = 'confirmed'` and the row
 * left a queue that reads `status = 'pending'`; a receptionist interrupted
 * between creating the person and booking them left somebody with a record, no
 * appointment, and nothing chasing them.
 *
 * So this suite asserts the SET OF ROWS the queue answers with, at three points
 * in the life of one request, against the real predicate:
 *
 *   before the convert   listed, `converted: false`
 *   after the convert    STILL LISTED, `converted: true`      <- the ruling
 *   after the dismiss    gone, and the badge agrees with it
 *
 * ==========================================================================
 * WHAT IS REAL AND WHAT IS NOT
 * ==========================================================================
 * The QUERY is real, the dismiss ACTION is real, RLS is real (both run through
 * `runScoped` as `authenticated` under the actor's own claims). Only two things
 * are stubbed and neither is under test: `requireRequestContext`, because a
 * vitest worker has no Supabase session for the action to resolve itself from,
 * and `revalidatePath`, which needs a request scope that does not exist here.
 *
 * The CONVERT is not called. It creates a patient through the whole insert path
 * and that path has its own suites; what this file needs from it is only the
 * state it leaves behind, which is one column. Setting that column directly
 * keeps the fixture honest about what is being proven - the READ, not the write.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: "reception"; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("option B: a converted guest request stays in reception's queue until dismissed", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listPendingGuestRequests: typeof import("./guest-requests").listPendingGuestRequests;
  let countPendingGuestRequests: typeof import("./guest-requests").countPendingGuestRequests;
  let dismissGuestRequest: typeof import("./guest-convert").dismissGuestRequest;

  const tenant = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  const reception = randomUUID();
  const patient = randomUUID();
  const requestId = randomUUID();

  const ctx = () => ({ tenantId: tenant, role: "reception" as const, userId: reception });

  const ids = async () => (await listPendingGuestRequests(ctx())).map((r) => r.id);

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ listPendingGuestRequests, countPendingGuestRequests } = await import("./guest-requests"));
    ({ dismissGuestRequest } = await import("./guest-convert"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'optb', ${"optb-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${location}::uuid, ${tenant}::uuid, 'Clinica B')`,
    );
    const [role] = (await db.execute(raw`select id from roles limit 1`)) as unknown as {
      id: string;
    }[];
    await db.execute(
      raw`insert into users (id, tenant_id, role_id, email, full_name)
          values (${reception}::uuid, ${tenant}::uuid, ${role!.id}::uuid,
                  ${`rec-${reception.slice(0, 8)}@optb.test`}, 'Rececao B')`,
    );
    await db.execute(
      raw`insert into services (id, tenant_id, name, duration_min, price_cents)
          values (${service}::uuid, ${tenant}::uuid, 'Consulta', 45, 5000)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, patient_number, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Convertido B', 91001, ${reception}::uuid)`,
    );
    await db.execute(
      raw`insert into guest_booking_requests
            (id, tenant_id, full_name, phone, service_id, location_id,
             requested_starts_at, requested_ends_at)
          values (${requestId}::uuid, ${tenant}::uuid, 'Maria Convidada', '912345678',
                  ${service}::uuid, ${location}::uuid,
                  '2026-09-21T08:00:00Z'::timestamptz, '2026-09-21T12:00:00Z'::timestamptz)`,
    );
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from guest_booking_requests where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from audit_log where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from services where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  it("a fresh request is listed, and it is NOT marked converted", async () => {
    // The positive control. Every assertion below is "the row is or is not
    // here", and all of them pass over a queue that can return nothing at all.
    expect(await ids()).toContain(requestId);
    const [row] = await listPendingGuestRequests(ctx());
    expect(row!.converted).toBe(false);
    expect(await countPendingGuestRequests(ctx())).toBe(1);
  });

  it("AFTER THE CONVERT IT IS STILL THERE, and it says so - this is the ruling", async () => {
    await db.execute(
      raw`update guest_booking_requests set converted_patient_id = ${patient}::uuid
           where id = ${requestId}::uuid`,
    );

    expect(await ids(), "a converted request must NOT leave the queue").toContain(requestId);
    const [row] = await listPendingGuestRequests(ctx());
    expect(row!.converted).toBe(true);
    // The badge counts it too. A badge that disagrees with the list it
    // describes is its own defect - the sentence is `guest-requests.ts`'s own.
    expect(await countPendingGuestRequests(ctx())).toBe(1);
  });

  it("the status was NOT moved, because nobody booked anything", async () => {
    // Read from the row rather than inferred from the queue. `confirmed` would
    // be the system claiming this request became an appointment.
    const rows = (await db.execute(
      raw`select status from guest_booking_requests where id = ${requestId}::uuid`,
    )) as unknown as { status: string }[];
    expect(rows[0]!.status).toBe("pending");
  });

  it("THE DISMISS takes it out of both the list and the badge", async () => {
    acting.ctx = { tenantId: tenant, role: "reception", userId: reception };
    try {
      const result = await dismissGuestRequest(requestId);
      expect(result).toEqual({ ok: true });
    } finally {
      acting.ctx = null;
    }

    expect(await ids()).not.toContain(requestId);
    expect(await countPendingGuestRequests(ctx())).toBe(0);
  });

  it("and it STILL did not move the status - the row is dismissed, not confirmed", async () => {
    const rows = (await db.execute(
      raw`select status, handled_at, handled_by from guest_booking_requests
           where id = ${requestId}::uuid`,
    )) as unknown as { status: string; handled_at: Date | null; handled_by: string | null }[];
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.handled_at).not.toBeNull();
    expect(rows[0]!.handled_by).toBe(reception);
  });
});
