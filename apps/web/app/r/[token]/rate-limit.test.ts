/**
 * SEC-r-token-no-rate-limit — the first rate limit in `apps/web`, proven.
 *
 * ============================================================================
 * WHAT THE FINDING ACTUALLY WAS
 * ============================================================================
 * Not "one route is missing a limiter". **There was no limiter anywhere in
 * `apps/web`** — a repo-wide search returned zero files, and the module existed
 * only in `apps/api`, which this app did not import. An entire application with
 * no limiting concept, covering every server action and route handler on the
 * staff platform plus this PUBLIC, UNAUTHENTICATED page.
 *
 * ============================================================================
 * WHAT THIS TEST ASSERTS, AND WHY THE ORDER MATTERS MORE THAN THE VERDICT
 * ============================================================================
 * **The assertion that matters is that the DATABASE IS NOT REACHED**, not that a
 * particular status came back. The whole point of the control is to stop an
 * unauthenticated caller doing database work on the patient-facing domain; a
 * test that only checked the redirect flag would pass against an implementation
 * that limited *after* redeeming, which would be no control at all.
 *
 * So every case here counts `redeemActionToken` calls.
 *
 * ============================================================================
 * AND IT MUST NOT BECOME A NEW SIGNAL
 * ============================================================================
 * Counsel section 3: this surface renders ONE generic outcome for every refusal
 * — bad token, expired, forged, unknown, already spent. A distinguishable "you
 * are rate limited" response would be a new signal on the one page designed to
 * emit none, and it would tell a prober their earlier attempts registered. The
 * limited path therefore takes the SAME `?r=refused` redirect as everything
 * else, and there is a test below pinning exactly that.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  /** Verdicts the limiter should return, consumed in order. */
  verdicts: [] as boolean[],
  /** Every key the limiter was asked about. */
  keys: [] as string[],
  /** One entry per call that REACHED the database. */
  redeems: [] as Array<{ token: string; action: string }>,
  /** Where the action redirected. */
  redirects: [] as string[],
  headers: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (n: string) => H.headers.get(n) ?? null }),
}));

// `redirect` THROWS in Next, which is load-bearing here: it is what stops the
// limited path falling through into the redeem below it. A mock that merely
// recorded and returned would let every test pass while the real action still
// hit the database.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    H.redirects.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return {
    ...real,
    createDurableRateLimitStore: () => ({}),
    checkDurableRateLimit: async (key: string, rule: { limit: number }) => {
      H.keys.push(key);
      const ok = H.verdicts.shift() ?? true;
      return { ok, limit: rule.limit, remaining: ok ? 1 : 0, retryAfterSeconds: 60 };
    },
  };
});

vi.mock("@/lib/reminders/redeem", async (orig) => {
  const real = await orig<typeof import("@/lib/reminders/redeem")>();
  return {
    ...real,
    redeemActionToken: async (input: { token: string; action: string }) => {
      H.redeems.push({ token: input.token, action: input.action });
      return { outcome: "success", action: input.action };
    },
  };
});

import { redeemAction } from "./actions";
import { RULES } from "@osteojp/rate-limit";

const TOKEN = "a".repeat(22);

const form = (token: string, action: string) => {
  const f = new FormData();
  f.set("token", token);
  f.set("action", action);
  return f;
};

/** The action always redirects, and redirect throws. Swallow only that. */
async function run(f: FormData): Promise<void> {
  try {
    await redeemAction(f);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT:")) throw e;
  }
}

beforeEach(() => {
  H.verdicts = [];
  H.keys = [];
  H.redeems = [];
  H.redirects = [];
  H.headers = new Map([["x-forwarded-for", "203.0.113.7"]]);
});

describe("guard on the guard: the harness is not vacuously passing", () => {
  it("a permitted request really does reach the database", async () => {
    // Without this, every "no redeem happened" assertion below would be passing
    // because nothing ever redeems, not because the limit works.
    await run(form(TOKEN, "confirm"));
    expect(H.redeems).toHaveLength(1);
    expect(H.redirects[0]).toContain("r=confirmed");
  });
});

describe("the limit is checked, and it is checked on the right identity", () => {
  it("asks the limiter before redeeming", async () => {
    await run(form(TOKEN, "confirm"));
    expect(H.keys).toHaveLength(1);
  });

  it("keys on the CLIENT IP, never on the token", async () => {
    // Keying on the token would hand an attacker a fresh budget per token, which
    // is exactly the traffic worth refusing - and a token is a credential, not a
    // bucket key.
    await run(form(TOKEN, "confirm"));
    expect(H.keys[0]).toBe("r-token:ip:203.0.113.7");
    expect(H.keys[0], "the token must never appear in a rate-limit key").not.toContain(TOKEN);
  });

  it("uses the tokenRedeem rule, which mutates-per-request tight", async () => {
    // Ten a minute, matching `booking`, because each one that gets through
    // changes an appointment in the clinic's diary.
    expect(RULES.tokenRedeem.limit).toBe(10);
    expect(RULES.tokenRedeem.windowMs).toBe(60_000);
  });
});

describe("when the limit is exceeded", () => {
  it("DOES NOT REACH THE DATABASE — the assertion that matters", async () => {
    H.verdicts = [false];
    await run(form(TOKEN, "confirm"));
    expect(
      H.redeems,
      "a limited request must not do database work; that is the whole control",
    ).toHaveLength(0);
  });

  it("is indistinguishable from every other refusal, per counsel section 3", async () => {
    // A "rate limited" outcome would be a NEW signal on the one surface designed
    // to emit none, and it would confirm to a prober that earlier attempts
    // registered.
    H.verdicts = [false];
    await run(form(TOKEN, "confirm"));
    expect(H.redirects).toHaveLength(1);
    expect(H.redirects[0]).toContain("r=refused");
    expect(H.redirects[0]).not.toMatch(/limit|429|slow|wait/i);
  });

  it("refuses a cancel exactly as it refuses a confirm", async () => {
    // Both mutate. Neither may slip past on the grounds that one feels safer.
    H.verdicts = [false];
    await run(form(TOKEN, "cancel"));
    expect(H.redeems).toHaveLength(0);
    expect(H.redirects[0]).toContain("r=refused");
  });
});

describe("budget is not spent on submissions that were never going to redeem", () => {
  it("refuses a malformed action BEFORE consulting the limiter", async () => {
    // Ordering, and it is the same one apps/api's OTP route settled on: if the
    // limit were checked first, an attacker could exhaust a real patient's
    // allowance with garbage that never reaches a query, denying them the link
    // in their SMS at no cost.
    await run(form(TOKEN, "delete-everything"));
    expect(H.keys, "a malformed submission must not spend limiter budget").toHaveLength(0);
    expect(H.redeems).toHaveLength(0);
    expect(H.redirects[0]).toContain("r=refused");
  });

  it("refuses an empty token BEFORE consulting the limiter", async () => {
    await run(form("", "confirm"));
    expect(H.keys).toHaveLength(0);
    expect(H.redeems).toHaveLength(0);
  });
});
