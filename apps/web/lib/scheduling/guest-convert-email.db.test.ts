/**
 * guest-convert-email.db.test.ts - 0101, strategy ruling R40. WHAT HAPPENS TO THE
 * EMAIL A VISITOR GAVE ON THE PUBLIC FORM WHEN RECEPTION CONVERTS THE REQUEST.
 *
 * THE RULE (the lead's decision of 2026-10-05, after review):
 *   a NEW patient created from the request gets the guest's email;
 *   an EXISTING patient's record is NEVER written by the convert, whether it
 *   holds an address or not. The address stays on the request row.
 *
 * WHY. The form is public and the address unverified. Filling an existing
 * patient's empty email from it would let anybody who posts the form with that
 * patient's mobile and their own address receive the patient's confirmation and
 * reminders (guest-link.db.test.ts follows that sequence to the dispatch).
 *
 * WHY A REAL DATABASE. "Never written" is a claim about a row after the real
 * transaction under RLS, and "the audit log names no address" is a claim about
 * rows a mock never writes. Every assertion below reads `patients`,
 * `guest_booking_requests` and `audit_log` back on an admin connection.
 *
 * WHAT IS STUBBED, AND NEITHER IS UNDER TEST: `requireRequestContext`, because a
 * vitest worker has no Supabase session, and `next/cache`. `runScoped`, RLS, the
 * patient insert, the request's UPDATE and the audit writes are real.
 *
 * IT NEEDS 0101 (the column), which is on main as
 * packages/db/migrations/0101_guest_request_email.sql and applied to production
 * (2026-10-05). No real name, number or address: every address is under
 * example.invalid, and every row is found by this file's own tenant id.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: string; userId: string } | null,
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

d("0101 / R40: the guest's email on convert - a new patient gets it, an existing patient's record is never written", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let convertGuestRequest: typeof import("./guest-convert").convertGuestRequest;

  const tenant = randomUUID();
  const clinic = randomUUID();
  const service = randomUUID();
  const reception = randomUUID();
  const GUEST = "guest.typed@example.invalid";
  const HELD = "patient.held@example.invalid";
  let phoneSeq = 0;
  /** A distinct Portuguese mobile per case, so each request's match set is its own patient. */
  const nextPhone = (): string => `+35191${String(7000000 + (phoneSeq += 1)).padStart(7, "0")}`;

  const convert = async (requestId: string, resolution: Parameters<typeof convertGuestRequest>[1]) => {
    acting.ctx = { tenantId: tenant, role: "reception", userId: reception };
    try {
      return await convertGuestRequest(requestId, resolution);
    } finally {
      acting.ctx = null;
    }
  };

  const seedRequest = async (phone: string, email: string | null): Promise<string> => {
    const id = randomUUID();
    await db.execute(
      raw`insert into guest_booking_requests
            (id, tenant_id, full_name, phone, service_id, location_id, requested_starts_at, requested_ends_at, email)
          values (${id}::uuid, ${tenant}::uuid, 'Fixture Guest', ${phone}, ${service}::uuid, ${clinic}::uuid,
                  '2030-01-07T09:00:00Z'::timestamptz, '2030-01-07T13:00:00Z'::timestamptz, ${email})`,
    );
    return id;
  };

  const seedPatient = async (phone: string, email: string | null): Promise<string> => {
    const id = randomUUID();
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, phone, email, primary_location_id, created_by)
          values (${id}::uuid, ${tenant}::uuid, 'Fixture Patient', ${phone}, ${email}, ${clinic}::uuid, ${reception}::uuid)`,
    );
    return id;
  };

  const emailOf = async (patientId: string): Promise<string | null> => {
    const rows = (await db.execute(raw`select email from patients where id = ${patientId}::uuid`)) as unknown as { email: string | null }[];
    return rows[0]!.email;
  };

  const convertedPatientOf = async (requestId: string): Promise<string | null> => {
    const rows = (await db.execute(
      raw`select converted_patient_id from guest_booking_requests where id = ${requestId}::uuid`,
    )) as unknown as { converted_patient_id: string | null }[];
    return rows[0]!.converted_patient_id;
  };

  /** The `patient.update` audit rows written for one patient: their metadata, as text. */
  const updateAuditsOf = async (patientId: string): Promise<string[]> => {
    const rows = (await db.execute(
      raw`select metadata::text as m from audit_log
           where tenant_id = ${tenant}::uuid and entity_id = ${patientId}::uuid and action = 'patient.update' order by created_at`,
    )) as unknown as { m: string }[];
    return rows.map((r) => r.m);
  };

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ convertGuestRequest } = await import("./guest-convert"));
    await db.execute(raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'guest-email-convert', ${"guest-email-convert-" + tenant.slice(0, 8)})`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, 'Fixture Clinic')`);
    await db.execute(raw`insert into services (id, tenant_id, name, duration_min, price_cents) values (${service}::uuid, ${tenant}::uuid, 'Fixture Service', 45, 5000)`);
    const [role] = (await db.execute(raw`select id from roles limit 1`)) as unknown as { id: string }[];
    await db.execute(
      raw`insert into users (id, tenant_id, role_id, email, full_name)
          values (${reception}::uuid, ${tenant}::uuid, ${role!.id}::uuid, ${`rec-${reception.slice(0, 8)}@example.invalid`}, 'Fixture Reception')`,
    );
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from guest_booking_requests where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from audit_log where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patient_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from patients where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from services where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  it("A NEW PATIENT gets the guest's email", async () => {
    const requestId = await seedRequest(nextPhone(), GUEST);
    const r = await convert(requestId, { kind: "new_patient" });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    const patientId = await convertedPatientOf(requestId);
    expect(patientId).toBeTruthy();
    expect(await emailOf(patientId!)).toBe(GUEST);
  });

  it("a new patient from a request WITHOUT an email has none: NULL, not an empty string", async () => {
    const requestId = await seedRequest(nextPhone(), null);
    const r = await convert(requestId, { kind: "new_patient" });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    expect(await emailOf((await convertedPatientOf(requestId))!)).toBeNull();
  });

  /** The address the REQUEST row still holds after the convert. */
  const requestEmailOf = async (requestId: string): Promise<string | null> => {
    const rows = (await db.execute(raw`select email from guest_booking_requests where id = ${requestId}::uuid`)) as unknown as { email: string | null }[];
    return rows[0]!.email;
  };

  it.each([
    ["NO email (NULL)", null],
    ["an EMPTY STRING for an email", ""],
    ["only SPACES for an email", "   "],
  ])("THE ABUSE CASE: an EXISTING patient with %s is NOT given the form's address, nothing is audited as changed, and the request keeps it", async (_what, held) => {
    const phone = nextPhone();
    const patientId = await seedPatient(phone, held);
    const requestId = await seedRequest(phone, GUEST);
    const r = await convert(requestId, { kind: "existing_patient", patientId });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    // The request WAS converted onto this patient, so this is the branch under test.
    expect(await convertedPatientOf(requestId)).toBe(patientId);
    // THE RECORD IS BYTE FOR BYTE WHAT IT WAS.
    expect(await emailOf(patientId)).toBe(held);
    expect(await updateAuditsOf(patientId)).toEqual([]);
    // And the address is not lost: it is where reception reads it.
    expect(await requestEmailOf(requestId)).toBe(GUEST);
  });

  it("an existing patient who HAS an email keeps it, and nothing is audited as changed", async () => {
    const phone = nextPhone();
    const patientId = await seedPatient(phone, HELD);
    const requestId = await seedRequest(phone, GUEST);
    const r = await convert(requestId, { kind: "existing_patient", patientId });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    expect(await convertedPatientOf(requestId)).toBe(patientId);
    expect(await emailOf(patientId)).toBe(HELD);
    expect(await updateAuditsOf(patientId)).toEqual([]);
  });

  it("an existing patient and a request WITHOUT an email: nothing changes, and a held address is not cleared", async () => {
    for (const held of [null, HELD]) {
      const phone = nextPhone();
      const patientId = await seedPatient(phone, held);
      const requestId = await seedRequest(phone, null);
      const r = await convert(requestId, { kind: "existing_patient", patientId });
      expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
      expect(await emailOf(patientId)).toBe(held);
      expect(await updateAuditsOf(patientId)).toEqual([]);
    }
  });

  it("THE CONTROL: with the SAME request, choosing CREATE NEW does save the address, so its absence above is the rule and not a dead column", async () => {
    const phone = nextPhone();
    const existing = await seedPatient(phone, null);
    const requestId = await seedRequest(phone, GUEST);
    const r = await convert(requestId, { kind: "new_patient" });
    expect(r.ok, `convert refused: ${JSON.stringify(r)}`).toBe(true);
    const created = await convertedPatientOf(requestId);
    expect(created).not.toBe(existing);
    expect(await emailOf(created!)).toBe(GUEST);
    // The household member who was already on file is untouched.
    expect(await emailOf(existing)).toBeNull();
  });

  it("THE DIALOG'S FLAG, under real RLS: true for a record with no address or another, false for the same address, and the patient's own address is not returned", async () => {
    const { listGuestRequestMatches } = await import("./guest-convert");
    const phone = nextPhone();
    const none = await seedPatient(phone, null);
    const blank = await seedPatient(phone, "  ");
    const other = await seedPatient(phone, HELD);
    const same = await seedPatient(phone, GUEST.toUpperCase());
    const requestId = await seedRequest(phone, GUEST);
    acting.ctx = { tenantId: tenant, role: "reception", userId: reception };
    const listed = await listGuestRequestMatches(requestId).finally(() => {
      acting.ctx = null;
    });
    expect(listed.ok, JSON.stringify(listed)).toBe(true);
    if (!listed.ok) return;
    const flag = new Map(listed.data.map((m) => [m.id, m.formEmailNotOnRecord]));
    expect([flag.get(none), flag.get(blank), flag.get(other), flag.get(same)]).toEqual([true, true, true, false]);
    expect(JSON.stringify(listed.data)).not.toContain("@");
  });

  it("RECEPTION'S QUEUE shows each pending request's own email, and null where the visitor gave none", async () => {
    const { listPendingGuestRequests } = await import("./guest-requests");
    const withEmail = await seedRequest(nextPhone(), GUEST);
    const without = await seedRequest(nextPhone(), null);
    // The queue takes its context as an argument; `runScoped` and RLS are real.
    const rows = await listPendingGuestRequests({ tenantId: tenant, role: "reception", userId: reception } as Parameters<typeof listPendingGuestRequests>[0]);
    const byId = new Map(rows.map((r) => [r.id, r.email]));
    expect(byId.get(withEmail)).toBe(GUEST);
    expect(byId.has(without)).toBe(true);
    expect(byId.get(without)).toBeNull();
  });

  it("NO ADDRESS IN THE AUDIT LOG: every audit row this file's converts wrote carries ids and field names only", async () => {
    const rows = (await db.execute(
      raw`select action, coalesce(metadata::text, '') as m from audit_log where tenant_id = ${tenant}::uuid`,
    )) as unknown as { action: string; m: string }[];
    // THE PREMISE: the converts above did write audit rows, of each kind.
    const actions = new Set(rows.map((r) => r.action));
    expect(actions.has("patient.guest_request_converted")).toBe(true);
    expect(actions.has("patient.create")).toBe(true);
    // NO CONVERT UPDATES A PATIENT ANY MORE, so no such row exists for this tenant at all.
    expect(actions.has("patient.update")).toBe(false);
    for (const r of rows) {
      expect(r.m, r.action).not.toContain("example.invalid");
      expect(r.m, r.action).not.toContain("@");
    }
  });
});
