import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-web-surface-limiter-adoption, route 1: the staff sign-in is limited.
 *
 * ==========================================================================
 * THE SUBJECT IS THE ORDER AND THE INDISTINGUISHABILITY, NOT "IT COUNTS"
 * ==========================================================================
 * That the limiter counts is `@osteojp/rate-limit`'s own suite. What can go
 * wrong HERE is the wiring: limiting after the auth call (useless), limiting
 * before the shape check (an attacker exhausts a real person's budget with
 * empty submissions), keying on the raw email (personal data in a durable
 * store), or announcing the refusal (an oracle telling an attacker the address
 * is worth continuing with).
 */

const hit = vi.fn();
const signInWithPassword = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword } }),
}));
vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return { ...real, createDurableRateLimitStore: () => ({ hit }) };
});

const form = (email: string, password: string) => {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  return f;
};

/** count -> the store's answer, so a case can drive the verdict directly. */
const counting = (n: number) =>
  hit.mockResolvedValue({ count: n, resetAt: new Date(Date.now() + 60_000) });

describe("the staff login is rate limited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({ error: { message: "bad" } });
  });

  it("does NOT spend budget on a submission with no password", async () => {
    // The shape check comes first, so garbage cannot exhaust a real person's
    // allowance without ever reaching the auth server. Same ordering /r/[token]
    // settled on.
    const { login } = await import("./actions");
    counting(1);
    const r = await login({ error: null }, form("ana@osteojp.pt", ""));
    expect(r.error).toContain("obrigatórios");
    expect(hit).not.toHaveBeenCalled();
  });

  it("checks BOTH axes before touching the auth server", async () => {
    const { login } = await import("./actions");
    counting(1);
    await login({ error: null }, form("ana@osteojp.pt", "pw"));
    // credential axis, then source axis.
    expect(hit).toHaveBeenCalledTimes(2);
    const order = hit.mock.calls.map((c) => String(c[0]));
    expect(order[0]).toContain("staff_login:cred:");
    expect(order[1]).toContain("staff_login_ip");
  });

  it("NEVER puts the email address in the bucket key", async () => {
    // A bucket key lives in a durable store. An email address there is personal
    // data at rest for no reason.
    const { login } = await import("./actions");
    counting(1);
    await login({ error: null }, form("ana@osteojp.pt", "pw"));
    const keys = hit.mock.calls.map((c) => String(c[0])).join(" ");
    expect(keys).not.toContain("ana@osteojp.pt");
    expect(keys).not.toContain("ana");
  });

  it("buckets the SAME account regardless of case", async () => {
    // "Ana@" and "ana@" are one account to Supabase. If they were two buckets
    // the limit would be bypassed by holding down the shift key.
    const { login } = await import("./actions");
    counting(1);
    await login({ error: null }, form("Ana@OsteoJP.pt", "pw"));
    const first = String(hit.mock.calls[0][0]);
    vi.clearAllMocks();
    counting(1);
    await login({ error: null }, form("  ana@osteojp.pt ", "pw"));
    expect(String(hit.mock.calls[0][0])).toBe(first);
  });

  it("refuses over the limit WITHOUT reaching the auth server", async () => {
    const { login } = await import("./actions");
    counting(99);
    const r = await login({ error: null }, form("ana@osteojp.pt", "pw"));
    expect(r.error).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("says exactly what a WRONG PASSWORD says - no oracle", async () => {
    // A distinct "too many attempts" would confirm to an attacker that the
    // address is worth continuing with, undoing the non-revealing copy
    // SPEC-staff-screens 11.5 already requires one line below.
    const { login } = await import("./actions");

    counting(99);
    const limited = await login({ error: null }, form("ana@osteojp.pt", "pw"));

    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({ error: { message: "bad" } });
    counting(1);
    const wrong = await login({ error: null }, form("ana@osteojp.pt", "pw"));

    expect(limited.error).toBe(wrong.error);
  });
});
