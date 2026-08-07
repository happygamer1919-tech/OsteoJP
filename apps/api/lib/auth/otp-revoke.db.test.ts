/**
 * LE-trusted-device-revoke — the revoke route, against a real database.
 *
 * THE GAP THIS CLOSES. Sign-out already cleared both cookies, so the token was
 * gone from that browser and unrecoverable. What it could not do was write
 * `revoked_at`: the column has existed since 0056 and its comment says "revoked
 * on the 4th stays an answerable question", but nothing wrote it, because there
 * was no route and the portal must never touch the database directly.
 *
 * DB-GATED BY NATURE, not by preference. The card's DoD is "a revoked row is
 * refused by /otp/trusted", and both halves of that sentence are SQL: the
 * conditional UPDATE in `revoke`, and the three-condition predicate in
 * `isTrusted`. A mocked store would agree with itself.
 *
 * THE SKIP CONTRACT matches otp-claim.db.test.ts: gated on DATABASE_URL,
 * skipped without one, and the fixtures clean up after themselves.
 */
import { createHash, randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;

/** Duplicated from otp.ts on purpose: a fixture that called the module under
 *  test would agree with it by construction even if both were wrong. */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

d("POST /auth/otp/revoke against a real database", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let revoke: (req: Request) => Promise<Response>;
  let trusted: (req: Request) => Promise<Response>;
  let makeTrustedStore: typeof import("./otp-store").createDrizzleTrustedDeviceStore;

  let tenantId: string;
  let patientId: string;

  const req = (token: string | null, ip: string) =>
    new Request("https://api.test/revoke", {
      method: "POST",
      headers: token
        ? { "x-forwarded-for": ip, cookie: `__Host-ojp_device=${token}` }
        : { "x-forwarded-for": ip },
    });

  /** A live trusted device, issued now. Returns the RAW token, as a browser holds it. */
  async function issueDevice(): Promise<string> {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    await makeTrustedStore().issue({
      tenantId,
      patientId,
      deviceTokenHash: sha(token),
      now: new Date(),
    });
    return token;
  }

  const revokedAtOf = async (token: string) => {
    const rows = await db.execute(raw`
      select revoked_at from patient_trusted_devices where device_token_hash = ${sha(token)}`);
    return (rows[0]?.revoked_at as string | null) ?? null;
  };

  beforeAll(async () => {
    const dbmod = await import("@osteojp/db");
    db = dbmod.getDbAdmin();
    revoke = (await import("../../app/api/v1/auth/otp/revoke/route")).POST;
    trusted = (await import("../../app/api/v1/auth/otp/trusted/route")).POST;
    makeTrustedStore = (await import("./otp-store")).createDrizzleTrustedDeviceStore;

    tenantId = randomUUID();
    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'OTP Revoke Co', ${"rev-" + tenantId.slice(0, 8)})`);

    patientId = randomUUID();
    await db.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${patientId}, ${tenantId}, 'Paciente Revoke', '+351900000077')`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from patient_trusted_devices where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from rate_limit_counters where key like 'otp-%'`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /* ---------------------------- the DoD ------------------------------- */

  it("NEGATIVE CONTROL: a fresh device IS trusted before anything revokes it", async () => {
    // Without this the assertion below could pass because the device was never
    // live - proving nothing about revocation. Same lesson as 0058's grant bug.
    const token = await issueDevice();
    const res = await trusted(req(token, "10.1.0.1"));
    expect(res.status).toBe(200);
    expect(await revokedAtOf(token)).toBeNull();
  });

  it("THE CARD'S DoD: after revoke, /otp/trusted REFUSES the same device", async () => {
    const token = await issueDevice();
    expect((await trusted(req(token, "10.1.0.2"))).status).toBe(200);

    const revoked = await revoke(req(token, "10.1.0.3"));
    expect(revoked.status).toBe(204);

    const after = await trusted(req(token, "10.1.0.4"));
    expect(after.status).toBe(401);
  });

  it("writes revoked_at on the ROW - the thing a cleared cookie could not do", async () => {
    const token = await issueDevice();
    expect(await revokedAtOf(token)).toBeNull();

    await revoke(req(token, "10.1.0.5"));

    const at = await revokedAtOf(token);
    expect(at).not.toBeNull();
    // Sanity: the instant is recent, not epoch or null-cast-to-a-date.
    expect(Math.abs(Date.now() - new Date(at!).getTime())).toBeLessThan(DAY);
  });

  it("re-revoking does NOT move the timestamp - 'when' stays answerable", async () => {
    // The store's conditional UPDATE is what holds this. otp-claim.db.test.ts
    // asserts it at the store level; this asserts it through the ROUTE, which is
    // the surface a lost-phone report actually reaches.
    const token = await issueDevice();
    await revoke(req(token, "10.1.0.6"));
    const first = await revokedAtOf(token);

    await revoke(req(token, "10.1.0.7"));
    expect(await revokedAtOf(token)).toBe(first);
  });

  /* ------------------------ the oracle property ----------------------- */

  it("answers 204 for an UNKNOWN token, exactly as for a live one", async () => {
    // Distinguishing them would make this route an oracle for whether a given
    // device token is live - the enumeration surface /otp/trusted was built not
    // to be. The honest outcome is identical either way: that token is not
    // usable after this call.
    const res = await revoke(req(sha("never-issued-anywhere"), "10.1.0.8"));
    expect(res.status).toBe(204);
  });

  it("answers 204 with NO cookie at all, rather than 401", async () => {
    // A 401 would tell a caller their cookie was unreadable, and would make
    // sign-out noisy for a patient who never trusted this browser.
    const res = await revoke(req(null, "10.1.0.9"));
    expect(res.status).toBe(204);
  });

  it("clears the device cookie on every path", async () => {
    // Unconditional, and it must not depend on the portal doing it too: a
    // revoked row plus a browser still presenting the token means every visit
    // pays a lookup for a credential that can never succeed again.
    for (const token of [await issueDevice(), sha("unknown"), null]) {
      const res = await revoke(req(token, "10.1.0.10"));
      expect(res.headers.get("set-cookie") ?? "").toContain("__Host-ojp_device=;");
      expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    }
  });

  it("revokes ONLY the presented device, never the patient's others", async () => {
    // The route takes no patient id, so this is structurally true - but a future
    // "helpful" widening to revoke-all-for-this-patient would be a real change
    // in behaviour and should fail here rather than in production.
    const keep = await issueDevice();
    const drop = await issueDevice();

    await revoke(req(drop, "10.1.0.11"));

    expect(await revokedAtOf(drop)).not.toBeNull();
    expect(await revokedAtOf(keep)).toBeNull();
    expect((await trusted(req(keep, "10.1.0.12"))).status).toBe(200);
  });
});
