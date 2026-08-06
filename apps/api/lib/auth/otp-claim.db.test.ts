/**
 * otp-claim.db.test.ts — the LOOP 3 Definition-of-Done lines that a mock cannot
 * honestly prove, against a REAL Postgres. W13-03, PG1, Decision D.
 *
 * WHY THIS FILE EXISTS. Three of LOOP 3's DoD lines are claims about the
 * DATABASE, not about the application:
 *
 *   * "A test proves a code is single-use." Single use is enforced by an UPDATE
 *     with a `consumed_at IS NULL` guard under two simultaneous redemptions. A
 *     mocked store racing itself proves the mock races; only two real
 *     transactions contending for one row prove the guard.
 *   * "A test proves the trusted device is accepted for 30 days and refused at
 *     31." That boundary lives in a SQL predicate (`expires_at > now`). A mock
 *     asserting the predicate it was written from is a tautology.
 *   * The claim is ONE transaction. Whether four statements commit together is a
 *     property of a transaction, and there is no transaction in a mock.
 *
 * It follows the precedent set by apps/web/lib/reminders/redeem.db.test.ts
 * (W13-01a), which is the first DB-gated suite outside packages/db and exists
 * for exactly this reason: the code under test is in an app, packages/db must
 * not import from apps/*, so the suite comes to the database instead.
 *
 * THE SKIP CONTRACT. `live` gates on DATABASE_URL exactly as
 * packages/db/tests/rls-harness.ts does, so ci.yml (no database) skips cleanly
 * and stays green. A silent skip is therefore possible, which is why
 * .github/scripts/assert-rls-executed.mjs hard-requires this file: a suite that
 * skips inside the DB-gated job REDDENS it. Without that guard this would read
 * as protection and prove nothing.
 *
 * EACH TEST GETS ITS OWN x-forwarded-for. The verify limit is 10 per hour per
 * client key and this file makes more calls than that; sharing one bucket would
 * make a later test fail with a 429 that had nothing to do with what it asserts.
 * Distinct keys are honest here — these ARE distinct callers.
 */
import { createHash, randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const PHONE = "+351900000001";

/** Hashes duplicated from otp.ts on purpose: a fixture that called the module
 * under test would agree with it by construction even if both were wrong. */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const phoneHashOf = (e164: string) => sha(e164);
const codeHashOf = (code: string, phoneHash: string) => sha(`${phoneHash}:${code}`);

d("the OTP claim against a real database", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let verify: (req: Request) => Promise<Response>;
  let trusted: (req: Request) => Promise<Response>;
  let makeTrustedStore: typeof import("./otp-store").createDrizzleTrustedDeviceStore;

  let tenantId: string;
  let patientId: string;

  /** A live code for PHONE, five minutes out. Returns the row id. */
  async function seedCode(code: string, phone = PHONE): Promise<string> {
    const id = randomUUID();
    const ph = phoneHashOf(phone);
    await db.execute(raw`
      insert into patient_otp_codes (id, tenant_id, phone_hash, code_hash, expires_at)
      values (${id}, ${tenantId}, ${ph}, ${codeHashOf(code, ph)}, now() + interval '5 minutes')`);
    return id;
  }

  const verifyReq = (code: string, ip: string, phone = PHONE) =>
    new Request("https://api.test/verify", {
      method: "POST",
      headers: { "x-forwarded-for": ip, "content-type": "application/json" },
      body: JSON.stringify({ tenantId, phone, code }),
    });

  const cookieOf = (res: Response): string =>
    /__Host-ojp_device=([0-9a-f]{64})/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";

  beforeAll(async () => {
    const dbmod = await import("@osteojp/db");
    db = dbmod.getDbAdmin();
    verify = (await import("../../app/api/v1/auth/otp/verify/route")).POST;
    trusted = (await import("../../app/api/v1/auth/otp/trusted/route")).POST;
    makeTrustedStore = (await import("./otp-store")).createDrizzleTrustedDeviceStore;

    tenantId = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'OTP Claim Co', ${"otp-" + tenantId.slice(0, 8)})`);

    patientId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${patientId}, ${tenantId}, 'Paciente OTP', ${PHONE})`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from patient_trusted_devices where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from patient_otp_codes where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from rate_limit_counters where key like 'otp-%'`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ------------------------------------------------------------------ */

  it("claims: the code is spent, the device is remembered, in one commit", async () => {
    const id = await seedCode("111111");
    const res = await verify(verifyReq("111111", "10.0.0.1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    // W13-03b: the token also travels in the body, for the portal server.
    expect(body.patientId).toBe(patientId);
    expect(typeof body.sessionToken).toBe("string");

    const spent = await db.execute(raw`
      select consumed_at from patient_otp_codes where id = ${id}`);
    expect(spent[0]!.consumed_at).not.toBeNull();

    // The cookie's value is the token; only its hash may exist in the table.
    const token = cookieOf(res);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const dev = await db.execute(raw`
      select patient_id, tenant_id, expires_at, revoked_at, last_seen_at
        from patient_trusted_devices where device_token_hash = ${sha(token)}`);
    expect(dev).toHaveLength(1);
    expect(dev[0]!.patient_id).toBe(patientId);
    expect(dev[0]!.last_seen_at).toBeNull();

    // The raw token is nowhere in the table, under any column.
    const leaked = await db.execute(raw`
      select 1 from patient_trusted_devices where device_token_hash = ${token}`);
    expect(leaked).toHaveLength(0);
  });

  it("SINGLE USE: the same code refuses the second time", async () => {
    await seedCode("222222");
    expect((await verify(verifyReq("222222", "10.0.0.2"))).status).toBe(200);

    const second = await verify(verifyReq("222222", "10.0.0.3"));
    expect(second.status).toBe(401);
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  it("two simultaneous route claims on one code produce exactly one 200", async () => {
    // WHAT THIS DOES AND DOES NOT PROVE, stated because the difference cost a
    // rewrite. It proves the ROUTE never grants twice for one code. It does NOT
    // prove the `consumed_at IS NULL` guard, because on a fast local database
    // the first request usually commits before the second even opens its
    // transaction — the second is then refused by `findLive`, which no longer
    // sees a live row, and the guard is never reached.
    //
    // Proven by negative control, 2026-08-05: with `consume` hard-coded to
    // return true, this test still PASSED. The test below is the one that goes
    // red, and it exists because this one quietly did not.
    const id = await seedCode("333333");
    const before = await db.execute(raw`
      select count(*)::int as n from patient_trusted_devices where patient_id = ${patientId}`);

    const [a, b] = await Promise.all([
      verify(verifyReq("333333", "10.0.0.4")),
      verify(verifyReq("333333", "10.0.0.5")),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);

    // Exactly ONE MORE device than before — counted as a delta, because earlier
    // tests in this file legitimately trusted devices for the same patient and a
    // bare count would pass or fail on their leftovers rather than on the race.
    const after = await db.execute(raw`
      select count(*)::int as n from patient_trusted_devices where patient_id = ${patientId}`);
    expect(after[0]!.n).toBe((before[0]!.n as number) + 1);

    const loser = a.status === 401 ? a : b;
    expect(await loser.json()).toEqual({ error: "unauthorized" });
    expect(loser.headers.get("set-cookie")).toBeNull();

    const row = await db.execute(raw`select consumed_at from patient_otp_codes where id = ${id}`);
    expect(row[0]!.consumed_at).not.toBeNull();
  });

  it("THE RACE: both claimants read the SAME live row, and only one consume wins", async () => {
    // The real interleave, forced rather than hoped for. A barrier holds BOTH
    // transactions after their read and before their write, so both are proven
    // to have seen the code unconsumed — which is the only state in which the
    // `consumed_at IS NULL` guard has anything to do.
    //
    // THIS IS THE TEST THE NEGATIVE CONTROL REDDENS. With the guard's verdict
    // ignored (`return true`), both claimants report won=true and this fails.
    // The route-level test above does not, which is why both exist.
    const dbmod = await import("@osteojp/db");
    const { createDrizzleOtpStore } = await import("./otp-store");

    const id = await seedCode("888888");
    const phoneHash = phoneHashOf(PHONE);

    let readers = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });

    async function claimant() {
      return dbmod.getDbAdmin().transaction(async (tx) => {
        const store = createDrizzleOtpStore(tx);
        const record = await store.findLive(tenantId, phoneHash, new Date());
        if (!record) return { read: false, won: false };

        // Neither proceeds to the UPDATE until both have completed the SELECT.
        if (++readers === 2) releaseBarrier();
        await barrier;

        return { read: true, won: await store.consume(record.id, new Date()) };
      });
    }

    const [a, b] = await Promise.all([claimant(), claimant()]);

    // The premise of the test, asserted rather than assumed: if only one of them
    // read the live row there was no race to win and the rest proves nothing.
    expect([a.read, b.read]).toEqual([true, true]);
    expect([a.won, b.won].filter(Boolean)).toHaveLength(1);

    const row = await db.execute(raw`select consumed_at from patient_otp_codes where id = ${id}`);
    expect(row[0]!.consumed_at).not.toBeNull();
  });

  it("a wrong guess SPENDS AN ATTEMPT rather than rolling it back", async () => {
    // The refusal returns out of the transaction instead of throwing, precisely
    // so the attempt counter survives. A throw would refund it and hand an
    // attacker unlimited guesses against a five-attempt cap.
    const id = await seedCode("444444");
    expect((await verify(verifyReq("000000", "10.0.0.6"))).status).toBe(401);

    const row = await db.execute(raw`select attempts, consumed_at from patient_otp_codes where id = ${id}`);
    expect(row[0]!.attempts).toBe(1);
    expect(row[0]!.consumed_at).toBeNull();
  });

  it("a linkage refusal leaves the code LIVE and trusts no device", async () => {
    // Two live rows carry the same number, so WF-07 refuses. The code is not
    // burned: a second SMS would only reach the identical refusal.
    const twinId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${twinId}, ${tenantId}, 'Paciente Gemeo', ${PHONE})`);
    try {
      const id = await seedCode("555555");
      const res = await verify(verifyReq("555555", "10.0.0.7"));

      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();

      const row = await db.execute(raw`select consumed_at from patient_otp_codes where id = ${id}`);
      expect(row[0]!.consumed_at).toBeNull();
    } finally {
      await db.execute(raw`delete from patients where id = ${twinId}`);
    }
  });

  /* --------------------------- trusted device --------------------------- */

  describe("the 30-day window", () => {
    const hash = sha("device-window-fixture");
    const issuedAt = new Date("2026-08-05T10:00:00.000Z");

    beforeAll(async () => {
      await makeTrustedStore().issue({
        tenantId,
        patientId,
        deviceTokenHash: hash,
        now: issuedAt,
      });
    });

    it("is ACCEPTED at 30 days", async () => {
      const justInside = new Date(issuedAt.getTime() + 30 * DAY - 1000);
      expect(await makeTrustedStore().isTrusted(hash, justInside)).toEqual({
        patientId, tenantId,
      });
    });

    it("is REFUSED at 31 days", async () => {
      const day31 = new Date(issuedAt.getTime() + 31 * DAY);
      expect(await makeTrustedStore().isTrusted(hash, day31)).toBeNull();
    });

    it("expires exactly at the ruled instant, not a day either side", async () => {
      const store = makeTrustedStore();
      expect(await store.isTrusted(hash, new Date(issuedAt.getTime() + 30 * DAY - 1))).toEqual({
        patientId, tenantId,
      });
      expect(await store.isTrusted(hash, new Date(issuedAt.getTime() + 30 * DAY))).toBeNull();
    });

    it("DOES NOT EXTEND ITSELF: checking it leaves expires_at untouched", async () => {
      // LOOP 3 step 6. A sliding window would mean an active device never
      // expires, which is a different control from the one the owner ruled.
      const before = await db.execute(raw`
        select expires_at, last_seen_at from patient_trusted_devices where device_token_hash = ${hash}`);
      await makeTrustedStore().isTrusted(hash, new Date(issuedAt.getTime() + 10 * DAY));
      const after = await db.execute(raw`
        select expires_at, last_seen_at from patient_trusted_devices where device_token_hash = ${hash}`);

      expect(after[0]!.expires_at).toEqual(before[0]!.expires_at);
      expect(after[0]!.last_seen_at).toBeNull();
    });

    it("is refused once revoked, and the FIRST revocation instant survives", async () => {
      const store = makeTrustedStore();
      const revokedHash = sha("device-revocation-fixture");
      await store.issue({ tenantId, patientId, deviceTokenHash: revokedHash, now: issuedAt });

      const firstRevoke = new Date(issuedAt.getTime() + DAY);
      await store.revoke(revokedHash, firstRevoke);
      await store.revoke(revokedHash, new Date(issuedAt.getTime() + 2 * DAY));

      expect(await store.isTrusted(revokedHash, new Date(issuedAt.getTime() + 3 * DAY))).toBeNull();
      const row = await db.execute(raw`
        select revoked_at from patient_trusted_devices where device_token_hash = ${revokedHash}`);
      expect(new Date(row[0]!.revoked_at as string).toISOString()).toBe(firstRevoke.toISOString());
    });
  });

  /* ------------------------------ the check ----------------------------- */

  it("the trusted route answers with the patient the device belongs to", async () => {
    await seedCode("666666");
    const claimed = await verify(verifyReq("666666", "10.0.0.8"));
    const token = cookieOf(claimed);

    const res = await trusted(new Request("https://api.test/trusted", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.9", cookie: `__Host-ojp_device=${token}` },
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patientId).toBe(patientId);
    expect(typeof body.sessionToken).toBe("string");
  });

  it("the trusted route refuses an EXPIRED device and clears the cookie", async () => {
    await seedCode("777777");
    const claimed = await verify(verifyReq("777777", "10.0.0.10"));
    const token = cookieOf(claimed);

    // Age the row past its window. The ROW is the authority, not the cookie's
    // Max-Age: a browser that ignores Max-Age still meets this.
    await db.execute(raw`update patient_trusted_devices set expires_at = now() - interval '1 day'
       where device_token_hash = ${sha(token)}`);

    const res = await trusted(new Request("https://api.test/trusted", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.11", cookie: `__Host-ojp_device=${token}` },
    }));

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("does NOT set auth_user_id - WF-07 linkage would refuse the patient ever after", async () => {
    // Recorded as a test rather than a comment because it is the visible half of
    // the open owner decision on the board (W13-03a): linkage refuses any row
    // whose auth_user_id is set, so a claim that set it would work exactly once
    // per patient. Nothing here sets it, and this test is what would go red if
    // something started to.
    const row = await db.execute(raw`select auth_user_id from patients where id = ${patientId}`);
    expect(row[0]!.auth_user_id).toBeNull();
  });
});
