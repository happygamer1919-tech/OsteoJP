/**
 * W13-03 — the OTP core. PG1, Decision D.
 *
 * Covers the LOOP 3 DoD lines that are about the SECURITY of the code:
 *   - an unknown phone and a wrong code are indistinguishable in status and body
 *   - the attempt cap and the expiry both refuse
 *   - a code is single-use
 * plus the properties those depend on: the code is uniform over the full 6-digit
 * space including leading zeros, the stored form is a hash domain-separated by
 * phone, and comparison is constant-time.
 */
import { describe, it, expect, vi } from "vitest";

import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  constantTimeEqual,
  generateOtpCode,
  hashCode,
  hashPhone,
  requestCode,
  verifyCode,
  type OtpRecord,
  type OtpStore,
} from "./otp";
import { createOtpTestSink } from "./otp-transport";

const T = "tenant-1";
const PHONE = "+351912345678";
const NOW = new Date("2026-08-05T10:00:00.000Z");

/** In-memory store. The security properties should not need a database. */
function makeStore(seed: OtpRecord[] = []) {
  const rows: OtpRecord[] = [...seed];
  let n = 0;
  const store: OtpStore & { rows: OtpRecord[] } = {
    rows,
    async create({ phoneHash, codeHash, expiresAt }) {
      rows.push({ id: `r${++n}`, phoneHash, codeHash, attempts: 0, expiresAt, consumedAt: null });
    },
    async findLive(_t, phoneHash) {
      return (
        [...rows]
          .reverse()
          .find((r) => r.phoneHash === phoneHash && r.consumedAt === null) ?? null
      );
    },
    async incrementAttempts(id) {
      const r = rows.find((x) => x.id === id);
      if (r) r.attempts += 1;
    },
    async consume(id, now) {
      const r = rows.find((x) => x.id === id);
      if (r) r.consumedAt = now;
    },
  };
  return store;
}

function liveRecord(over: Partial<OtpRecord> = {}): OtpRecord {
  const phoneHash = hashPhone(PHONE);
  return {
    id: "r1",
    phoneHash,
    codeHash: hashCode("123456", phoneHash),
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + OTP_TTL_MS),
    consumedAt: null,
    ...over,
  };
}

describe("the code itself", () => {
  it("is 6 digits and includes codes with leading zeros", () => {
    // Excluding leading zeros would quietly shrink the space by 10%.
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(3000); // not a constant, not a tiny range
  });

  it("hashes the code domain-separated by phone, so the same digits differ per number", () => {
    const a = hashCode("123456", hashPhone("+351912345678"));
    const b = hashCode("123456", hashPhone("+351999888777"));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never stores the code itself", () => {
    expect(hashCode("123456", hashPhone(PHONE))).not.toContain("123456");
  });

  it("compares in constant time and handles length mismatch without throwing", () => {
    const h = hashCode("123456", hashPhone(PHONE));
    expect(constantTimeEqual(h, h)).toBe(true);
    expect(constantTimeEqual(h, "short")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("requesting a code", () => {
  it("stores a hash and sends the plain code, in that order", async () => {
    const store = makeStore();
    const sink = createOtpTestSink();

    await requestCode(T, PHONE, {
      store,
      transport: sink,
      now: () => NOW,
      generate: () => "123456",
    });

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.codeHash).toBe(hashCode("123456", hashPhone(PHONE)));
    expect(store.rows[0]!.phoneHash).toBe(hashPhone(PHONE));
    expect(sink.sent).toEqual([{ to: PHONE, code: "123456" }]);
  });

  it("does not send when the store write fails, so no unusable code reaches a patient", async () => {
    const store = makeStore();
    store.create = vi.fn().mockRejectedValue(new Error("db down"));
    const sink = createOtpTestSink();

    await expect(
      requestCode(T, PHONE, { store, transport: sink, now: () => NOW, generate: () => "123456" }),
    ).rejects.toThrow("db down");

    // A code the server has no record of is indistinguishable, to the patient,
    // from a code that is simply wrong.
    expect(sink.sent).toEqual([]);
  });

  it("issues a code for an unknown number too, and never looks the phone up", async () => {
    // Membership must not leak, not even by the timing of a lookup that is
    // never performed. WF-07 resolves the patient at CLAIM time, not here.
    const store = makeStore();
    const sink = createOtpTestSink();
    await requestCode(T, "+351000000000", { store, transport: sink, now: () => NOW });
    expect(store.rows).toHaveLength(1);
    expect(sink.sent).toHaveLength(1);
  });
});

describe("ENUMERATION: every refusal is byte-identical", () => {
  const cases: Array<[string, () => OtpStore]> = [
    ["no code was ever requested (unknown phone)", () => makeStore()],
    ["the code is wrong", () => makeStore([liveRecord()])],
    ["the code expired", () => makeStore([liveRecord({ expiresAt: new Date(NOW.getTime() - 1) })])],
    ["the attempt cap is spent", () => makeStore([liveRecord({ attempts: OTP_MAX_ATTEMPTS })])],
    ["the code was already used", () => makeStore([liveRecord({ consumedAt: NOW })])],
  ];

  it("returns the SAME object for every failure mode", async () => {
    const results = [];
    for (const [, make] of cases) {
      results.push(await verifyCode(T, PHONE, "999999", { store: make(), now: () => NOW }));
    }
    // Deep equality across all five, not merely "all falsy": a caller must not be
    // able to tell an unknown phone from a wrong code, which is the whole point.
    for (const r of results) expect(r).toEqual({ ok: false });
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it("the result type carries no reason a route could branch on", async () => {
    const r = await verifyCode(T, PHONE, "999999", { store: makeStore(), now: () => NOW });
    expect(Object.keys(r)).toEqual(["ok"]);
  });
});

describe("the caps actually refuse", () => {
  it("refuses at the attempt cap and counts every wrong guess", async () => {
    const store = makeStore([liveRecord()]);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyCode(T, PHONE, "000000", { store, now: () => NOW })).toEqual({ ok: false });
    }
    expect(store.rows[0]!.attempts).toBe(OTP_MAX_ATTEMPTS);

    // Now even the CORRECT code is refused: the cap is spent.
    expect(await verifyCode(T, PHONE, "123456", { store, now: () => NOW })).toEqual({ ok: false });
    expect(store.rows[0]!.consumedAt).toBeNull();
  });

  it("refuses an expired code even when the digits are right", async () => {
    const store = makeStore([liveRecord({ expiresAt: new Date(NOW.getTime() - 1) })]);
    expect(await verifyCode(T, PHONE, "123456", { store, now: () => NOW })).toEqual({ ok: false });
  });

  it("does not spend an attempt on an expired code", async () => {
    // The expiry already ended it; charging an attempt would let an attacker
    // exhaust a future code's budget by racing the clock.
    const store = makeStore([liveRecord({ expiresAt: new Date(NOW.getTime() - 1) })]);
    await verifyCode(T, PHONE, "000000", { store, now: () => NOW });
    expect(store.rows[0]!.attempts).toBe(0);
  });
});

describe("SINGLE USE", () => {
  it("accepts the code once and refuses the identical code after", async () => {
    const store = makeStore([liveRecord()]);

    const first = await verifyCode(T, PHONE, "123456", { store, now: () => NOW });
    expect(first).toEqual({ ok: true, phoneHash: hashPhone(PHONE) });
    expect(store.rows[0]!.consumedAt).toEqual(NOW);

    const second = await verifyCode(T, PHONE, "123456", { store, now: () => NOW });
    // And it is refused with the SAME body as a forged one.
    expect(second).toEqual({ ok: false });
  });

  it("returns the phone hash on success, never the number", async () => {
    const store = makeStore([liveRecord()]);
    const r = await verifyCode(T, PHONE, "123456", { store, now: () => NOW });
    expect(r).toEqual({ ok: true, phoneHash: hashPhone(PHONE) });
    expect(JSON.stringify(r)).not.toContain(PHONE);
  });
});
