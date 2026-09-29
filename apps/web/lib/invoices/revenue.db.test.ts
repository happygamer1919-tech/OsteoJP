/**
 * revenue.db.test.ts - T5b, REVENUE PER CLINIC, against a REAL Postgres,
 * THROUGH THE PRODUCTION FUNCTION.
 *
 * getMonthlyRevenue runs through `runScoped`, so `set local role
 * authenticated`, the JWT claims, the tenant-wide invoices RLS and the
 * location-scoped appointments RLS (0078) are all real here, and so is
 * `viewerLocationScope`'s read of `staff_locations`. What a member of staff
 * sees on Inicio is the COMPOSITE of the app-layer scope and RLS, and that is
 * the only thing this suite asserts: figures, never SQL.
 *
 * THE FIXTURE IS THE ORACLE. Every invoice exists for ONE reason, the reason
 * is in its name, and every expected figure below is a literal summed from the
 * fixture by hand. The amounts are distinct powers of ten plus a marker digit,
 * so a wrong figure names the invoice that was wrongly counted or dropped.
 *
 * `.github/workflows/db-tests.yml` globs `.db.test.ts` in apps/web, so this
 * runs there; without DATABASE_URL it skips, like every suite of its kind.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RequestContext, Role } from "@osteojp/auth";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

/** September 2026 in Lisbon: [Lisbon midnight 1 Sep, Lisbon midnight 1 Oct), as the page passes it. */
const MONTH_START = new Date("2026-08-31T23:00:00.000Z");
const MONTH_END = new Date("2026-09-30T23:00:00.000Z");
const IN_MONTH = new Date("2026-09-10T10:00:00.000Z");
const LAST_MONTH = new Date("2026-08-20T10:00:00.000Z");
/** Where every fixture marcacao sits: long before the month, so only its CLINIC matters. */
const APPT_AT = new Date("2018-06-04T09:00:00.000Z");

d("the Inicio revenue tile per clinic, against a real database (T5b)", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let getMonthlyRevenue: typeof import("./queries").getMonthlyRevenue;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const lv = randomUUID(); // "Linda-a-Velha"
  const cb = randomUUID(); // "Castelo Branco"
  const third = randomUUID(); // a third clinic nobody below is assigned to
  const otherLoc = randomUUID(); // the other tenant's clinic

  const owner = randomUUID();
  const adminLv = randomUUID();
  const receptionLv = randomUUID();
  const adminLvCb = randomUUID();
  const adminUnassigned = randomUUID();
  const therapist = randomUUID();
  const otherTenantUser = randomUUID();

  const patient = randomUUID();
  const otherPatient = randomUUID();

  const apptLv = randomUUID();
  const apptCb = randomUUID();
  const apptThird = randomUUID();
  const apptOther = randomUUID();
  /**
   * A CB marcacao CREATED BY THE LV ADMIN. The appointments RLS lets its
   * creator read it (`created_by = auth.uid()`), so the join under RLS alone
   * would hand the LV admin its invoice. Only getMonthlyRevenue's explicit
   * location condition keeps it out of the LV figure.
   */
  const apptCbByAdminLv = randomUUID();

  /** Counted, each for its clinic. */
  const LV_ISSUED = 10_000;
  const LV_PAID = 2_000;
  const CB_PAID = 300;
  const CB_CREATED_BY_ADMIN_LV = 40;
  const THIRD_ISSUED = 5;
  /** Counted only in the whole-tenant figure: an invoice with no marcacao has no clinic. */
  const NO_APPOINTMENT = 600_000;
  /** Never counted, each for its own reason. */
  const LV_DRAFT = 7_000_000;
  const LV_VOID = 8_000_000;
  const LV_LAST_MONTH = 9_000_000;
  const OTHER_TENANT = 50_000_000;

  const LV_FIGURE = LV_ISSUED + LV_PAID; // 12000
  const CB_FIGURE = CB_PAID + CB_CREATED_BY_ADMIN_LV; // 340
  const THIRD_FIGURE = THIRD_ISSUED; // 5
  const WHOLE_TENANT = LV_FIGURE + CB_FIGURE + THIRD_FIGURE + NO_APPOINTMENT; // 612345

  const ctx = (userId: string, role: Role): RequestContext => ({ tenantId: tenant, role, userId });

  let n = 9100;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ getMonthlyRevenue } = await import("./queries"));

    for (const [id, name] of [[tenant, "revenue-a"], [otherTenant, "revenue-b"]] as const) {
      await db.execute(raw`insert into tenants (id, name, slug) values (${id}::uuid, ${name}, ${name + "-" + id.slice(0, 8)})`);
    }
    for (const [id, t, name] of [
      [lv, tenant, "Loc LV"], [cb, tenant, "Loc CB"], [third, tenant, "Loc Third"], [otherLoc, otherTenant, "Loc Other"],
    ] as const) {
      await db.execute(raw`insert into locations (id, tenant_id, name) values (${id}::uuid, ${t}::uuid, ${name})`);
    }
    for (const [id, t, tag] of [
      [owner, tenant, "own"], [adminLv, tenant, "alv"], [receptionLv, tenant, "rlv"], [adminLvCb, tenant, "alc"],
      [adminUnassigned, tenant, "aun"], [therapist, tenant, "thr"], [otherTenantUser, otherTenant, "oth"],
    ] as const) {
      await db.execute(raw`insert into users (id, tenant_id, email, full_name)
                           values (${id}::uuid, ${t}::uuid, ${tag + "-" + id.slice(0, 8) + "@example.test"}, ${tag})`);
    }
    // The assignments ARE the scope. adminUnassigned has none, on purpose.
    for (const [user, loc] of [[adminLv, lv], [receptionLv, lv], [adminLvCb, lv], [adminLvCb, cb]] as const) {
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
                           values (${tenant}::uuid, ${user}::uuid, ${loc}::uuid)`);
    }

    for (const [id, t] of [[patient, tenant], [otherPatient, otherTenant]] as const) {
      await db.execute(raw`insert into patients (id, tenant_id, full_name, patient_number)
                           values (${id}::uuid, ${t}::uuid, ${"Revenue fixture " + id.slice(0, 8)}, ${n++})`);
    }
    const appt = (id: string, t: string, p: string, loc: string, practitioner: string, createdBy: string | null) =>
      raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_by)
          values (${id}::uuid, ${t}::uuid, ${p}::uuid, ${practitioner}::uuid, ${loc}::uuid,
                  ${APPT_AT.toISOString()}::timestamptz, ${new Date(APPT_AT.getTime() + 45 * 60000).toISOString()}::timestamptz,
                  'completed'::appointment_status, ${createdBy}::uuid)`;
    await db.execute(appt(apptLv, tenant, patient, lv, therapist, owner));
    await db.execute(appt(apptCb, tenant, patient, cb, therapist, owner));
    await db.execute(appt(apptThird, tenant, patient, third, therapist, owner));
    await db.execute(appt(apptCbByAdminLv, tenant, patient, cb, therapist, adminLv));
    await db.execute(appt(apptOther, otherTenant, otherPatient, otherLoc, otherTenantUser, otherTenantUser));

    const invoice = (t: string, appointment: string | null, cents: number, status: string, issuedAt: Date | null) =>
      raw`insert into invoices (tenant_id, patient_id, appointment_id, amount_cents, status, issued_at)
          values (${t}::uuid, ${t === tenant ? patient : otherPatient}::uuid, ${appointment}::uuid, ${cents},
                  ${status}::invoice_status, ${issuedAt ? issuedAt.toISOString() : null}::timestamptz)`;
    await db.execute(invoice(tenant, apptLv, LV_ISSUED, "issued", IN_MONTH));
    await db.execute(invoice(tenant, apptLv, LV_PAID, "paid", IN_MONTH));
    await db.execute(invoice(tenant, apptCb, CB_PAID, "paid", IN_MONTH));
    await db.execute(invoice(tenant, apptCbByAdminLv, CB_CREATED_BY_ADMIN_LV, "issued", IN_MONTH));
    await db.execute(invoice(tenant, apptThird, THIRD_ISSUED, "issued", IN_MONTH));
    await db.execute(invoice(tenant, null, NO_APPOINTMENT, "paid", IN_MONTH));
    await db.execute(invoice(tenant, apptLv, LV_DRAFT, "draft", IN_MONTH));
    await db.execute(invoice(tenant, apptLv, LV_VOID, "void", IN_MONTH));
    await db.execute(invoice(tenant, apptLv, LV_LAST_MONTH, "paid", LAST_MONTH));
    await db.execute(invoice(otherTenant, apptOther, OTHER_TENANT, "paid", IN_MONTH));
  });

  afterAll(async () => {
    if (!live) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    await db.execute(raw`delete from invoices where tenant_id in ${both}`);
    await db.execute(raw`delete from appointments where tenant_id in ${both}`);
    await db.execute(raw`delete from staff_locations where tenant_id in ${both}`);
    await db.execute(raw`delete from patients where tenant_id in ${both}`);
    await db.execute(raw`delete from users where tenant_id in ${both}`);
    await db.execute(raw`delete from locations where tenant_id in ${both}`);
    await db.execute(raw`delete from tenants where id in ${both}`);
  });

  const revenue = (userId: string, role: Role, locationId?: string | null) =>
    getMonthlyRevenue(ctx(userId, role), MONTH_START, MONTH_END, { locationId });

  /* ------------------------------------------------------------------ */
  /* The owner: every clinic by default, or the one chosen.             */
  /* ------------------------------------------------------------------ */

  it("the owner's default is the whole tenant: every clinic AND the invoice with no marcacao", async () => {
    expect(await revenue(owner, "owner")).toBe(WHOLE_TENANT);
    expect(WHOLE_TENANT).toBe(612_345);
  });

  it("the owner's toggle: each clinic alone, and only it", async () => {
    expect(await revenue(owner, "owner", lv)).toBe(LV_FIGURE);
    expect(await revenue(owner, "owner", cb)).toBe(CB_FIGURE);
    expect(await revenue(owner, "owner", third)).toBe(THIRD_FIGURE);
  });

  it("the owner cannot reach another tenant's clinic through the toggle", async () => {
    // The id is real, the invoice behind it is real, and RLS still says no.
    expect(await revenue(owner, "owner", otherLoc)).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* Admin and reception: exactly their own clinics.                     */
  /* ------------------------------------------------------------------ */

  it("an LV admin sees LV only, NOT the CB marcacao they created themselves", async () => {
    // 12000, not 12040: the appointments RLS lets the creator read that CB
    // marcacao, and the location condition is what keeps its invoice out.
    expect(await revenue(adminLv, "admin")).toBe(LV_FIGURE);
  });

  it("an LV receptionist sees LV only", async () => {
    expect(await revenue(receptionLv, "reception")).toBe(LV_FIGURE);
  });

  it("an admin assigned to LV and CB sees both, and not the third clinic or the unlinked invoice", async () => {
    expect(await revenue(adminLvCb, "admin")).toBe(LV_FIGURE + CB_FIGURE);
    expect(LV_FIGURE + CB_FIGURE).toBe(12_340);
  });

  it("a requested clinic moves neither an admin's nor a receptionist's figure", async () => {
    expect(await revenue(adminLv, "admin", cb)).toBe(LV_FIGURE);
    expect(await revenue(receptionLv, "reception", third)).toBe(LV_FIGURE);
    // Inside the two-clinic admin's own set it does not narrow either.
    expect(await revenue(adminLvCb, "admin", lv)).toBe(LV_FIGURE + CB_FIGURE);
  });

  it("an UNASSIGNED admin falls back to the whole tenant (PL-09), as on /invoicing", async () => {
    expect(await revenue(adminUnassigned, "admin")).toBe(WHOLE_TENANT);
  });

  it("two principals get their own scopes from the same per-request cache, in both orders", async () => {
    // resolveViewerLocationIds is memoised with React cache(), keyed on the
    // principal. Interleaving two principals catches a key that is too coarse.
    const a1 = await revenue(adminLv, "admin");
    const b1 = await revenue(adminLvCb, "admin");
    const a2 = await revenue(adminLv, "admin");
    const b2 = await revenue(adminLvCb, "admin");
    expect([a1, b1, a2, b2]).toEqual([LV_FIGURE, LV_FIGURE + CB_FIGURE, LV_FIGURE, LV_FIGURE + CB_FIGURE]);
  });

  /* ------------------------------------------------------------------ */
  /* The therapist: refused before any read (DASH-THERAPIST-REVENUE).    */
  /* ------------------------------------------------------------------ */

  it("refuses the therapist, with or without a requested clinic", async () => {
    await expect(revenue(therapist, "therapist")).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(revenue(therapist, "therapist", lv)).rejects.toMatchObject({ name: "ForbiddenError" });
  });
});
