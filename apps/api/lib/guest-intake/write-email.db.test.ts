/**
 * 0101 - the public form's optional email, written by the form's own write path
 * against a REAL Postgres.
 *
 * WHAT ONLY A DATABASE CAN SHOW. The route's unit suite proves what the route
 * hands to `writeGuestBooking`. This proves the rest: drizzle's INSERT names the
 * `email` column, the row comes back with the address the visitor typed, a
 * request without one stores NULL (never the empty string, which 0101's CHECK
 * refuses), and everything `parseGuestEmail` admits, the CHECK admits.
 *
 * IT NEEDS 0101, WHICH IS APPLIED. The migration is
 * packages/db/migrations/0101_guest_request_email.sql, on main and applied to
 * production on 2026-10-05, so every stack built from the migrations has the
 * column. `schema.ts` declares it, and on a database without it every INSERT
 * here would fail with 42703: a red run, never a skip.
 *
 * SHARED DATABASE: every assertion is about rows this file created, found by its
 * own tenant id. No real name, number or address: the addresses are under
 * example.invalid.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const dLive = live ? describe : describe.skip;

type Db = ReturnType<typeof import("@osteojp/db").getDbAdmin>;

dLive("0101: the guest write stores the optional email", () => {
  const tenant = randomUUID();
  const location = randomUUID();
  const service = randomUUID();
  let db: Db;
  let writeGuestBooking: typeof import("./write").writeGuestBooking;
  let parseGuestEmail: typeof import("@osteojp/db").parseGuestEmail;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    parseGuestEmail = mod.parseGuestEmail;
    ({ writeGuestBooking } = await import("./write"));
    await db.execute(raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'guest-email-a', ${"guest-email-a-" + tenant.slice(0, 8)})`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${location}::uuid, ${tenant}::uuid, 'Fixture Clinic')`);
    await db.execute(raw`insert into services (id, tenant_id, name, duration_min, price_cents) values (${service}::uuid, ${tenant}::uuid, 'Fixture Service', 45, 4500)`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from guest_booking_requests where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from services where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  const request = (fullName: string, email: string | null) => ({
    tenantId: tenant,
    fullName,
    phone: "+351912345678",
    serviceId: service,
    locationId: location,
    practitionerId: null,
    requestedStartsAt: new Date("2030-01-07T09:00:00Z"),
    requestedEndsAt: new Date("2030-01-07T13:00:00Z"),
    sourceIpHash: null,
    email,
  });

  const stored = async (fullName: string): Promise<Array<{ email: string | null }>> =>
    (await db.execute(
      raw`select email from guest_booking_requests where tenant_id = ${tenant}::uuid and full_name = ${fullName}`,
    )) as unknown as Array<{ email: string | null }>;

  it("a request WITH an email stores exactly that address", async () => {
    await writeGuestBooking(db, request("Fixture With", "guest.with@example.invalid"), null);
    expect(await stored("Fixture With")).toEqual([{ email: "guest.with@example.invalid" }]);
  });

  it("a request WITHOUT one stores NULL, and the row is still written", async () => {
    await writeGuestBooking(db, request("Fixture Without", null), null);
    expect(await stored("Fixture Without")).toEqual([{ email: null }]);
  });

  it("everything parseGuestEmail admits, the database admits: the CHECK is never the stricter one", async () => {
    const typed = [
      "  spaced@example.invalid  ",
      "UPPER@EXAMPLE.INVALID",
      "first.last+tag@sub.example.invalid",
      "o'neil@example.invalid",
      "utilizador.ção@exemplo.invalid",
      "gu\u0085est@example.invalid",
      `${"a".repeat(304)}@example.invalid`,
    ];
    let n = 0;
    for (const t of typed) {
      const parsed = parseGuestEmail(t);
      expect(parsed.ok, JSON.stringify(t).slice(0, 40)).toBe(true);
      if (!parsed.ok) continue;
      n += 1;
      await writeGuestBooking(db, request(`Fixture Parity ${n}`, parsed.email), null);
      expect(await stored(`Fixture Parity ${n}`)).toEqual([{ email: parsed.email }]);
    }
    expect(n).toBe(typed.length);
  });

  it("THE BACKSTOP HOLDS: a value the rule refuses is refused by the CHECK too, by name, and nothing is stored", async () => {
    // The route never sends one; this is what stands behind it if a later writer does.
    for (const bad of ["", "not-an-email", "two@@example.invalid", `${"a".repeat(320)}@example.invalid`]) {
      expect(parseGuestEmail(bad === "" ? "x" : bad).ok).toBe(false);
      await expect(writeGuestBooking(db, request("Fixture Refused", bad), null)).rejects.toMatchObject({
        cause: expect.objectContaining({ constraint_name: "guest_booking_requests_email_check" }),
      });
    }
    expect(await stored("Fixture Refused")).toEqual([]);
  });
});
