import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * OSTEOJP-WEB-8 - the auth guard must tell three outcomes apart.
 *
 * WHAT THE DEFECT ACTUALLY WAS: `requireRequestContext` threw a bare Error for
 * every failure, which in a Server Component render is an unhandled 500. A
 * logged-out person opening /clinical/[id] got a server error page.
 *
 * WHAT THESE TESTS PIN IS THE DISTINCTION, not just the redirect. Making the
 * guard redirect for EVERYTHING would fix the 500 and quietly introduce a worse
 * bug: a Supabase outage would present as everybody being logged out, with
 * nothing on the error channel. So each branch is asserted separately, and the
 * "unavailable" ones assert that it does NOT redirect.
 */

const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims } }),
}));

const redirect = vi.fn((path: string) => {
  // Mirrors Next's control-flow throw, so a test that expected a return value
  // cannot pass by accident.
  const e = new Error("NEXT_REDIRECT");
  (e as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path}`;
  throw e;
});
vi.mock("next/navigation", () => ({ redirect }));

const captureException = vi.fn();
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException, captureMessage }));

const { AuthRetryableFetchError, AuthSessionMissingError } = await import("@supabase/supabase-js");
const { getRequestContext, requireRequestContext, resolveRequestContext, LOGIN_PATH } =
  await import("./context");

const CLAIMS = {
  tenant_id: "11111111-1111-1111-1111-111111111111",
  user_role: "reception",
  sub: "22222222-2222-2222-2222-222222222222",
};

beforeEach(() => {
  getClaims.mockReset();
  redirect.mockClear();
  captureException.mockClear();
  captureMessage.mockClear();
});

describe("resolveRequestContext - the three outcomes", () => {
  it("ok: a verified token yields the context", async () => {
    getClaims.mockResolvedValue({ data: { claims: CLAIMS }, error: null });
    const r = await resolveRequestContext();
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.ctx).toEqual({
      tenantId: CLAIMS.tenant_id, role: "reception", userId: CLAIMS.sub,
    });
  });

  it("anonymous: no claims and no error is a plain logged-out visitor", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await resolveRequestContext()).toEqual({ kind: "anonymous", reason: "no-session" });
  });

  it("anonymous: AuthSessionMissingError is the Auth server saying no", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() });
    expect(await resolveRequestContext()).toEqual({ kind: "anonymous", reason: "no-session" });
  });

  it("unavailable: AuthRetryableFetchError is a TRANSPORT failure, not a logout", async () => {
    const err = new AuthRetryableFetchError("fetch failed", 0);
    getClaims.mockResolvedValue({ data: null, error: err });
    const r = await resolveRequestContext();
    expect(r.kind).toBe("unavailable");
    if (r.kind === "unavailable") expect(r.cause).toBe(err);
  });

  it("unavailable: a REJECTED getClaims (DNS, socket reset) is never a logout", async () => {
    const boom = new TypeError("fetch failed");
    getClaims.mockRejectedValue(boom);
    const r = await resolveRequestContext();
    expect(r.kind).toBe("unavailable");
    if (r.kind === "unavailable") expect(r.cause).toBe(boom);
  });

  it("anonymous/unusable-claims: a verified token we cannot use", async () => {
    for (const bad of [
      { ...CLAIMS, tenant_id: "" },
      { ...CLAIMS, user_role: "wizard" },
      { ...CLAIMS, sub: undefined },
    ]) {
      getClaims.mockResolvedValue({ data: { claims: bad }, error: null });
      expect(await resolveRequestContext()).toEqual({
        kind: "anonymous", reason: "unusable-claims",
      });
    }
  });
});

describe("getRequestContext - the contract is unchanged, and still fails closed", () => {
  it("returns the context when there is one", async () => {
    getClaims.mockResolvedValue({ data: { claims: CLAIMS }, error: null });
    expect(await getRequestContext()).not.toBeNull();
  });

  it("returns null - never redirects, never throws - on EVERY failure", async () => {
    const failures = [
      { data: null, error: null },
      { data: null, error: new AuthSessionMissingError() },
      { data: null, error: new AuthRetryableFetchError("x", 0) },
      { data: { claims: { ...CLAIMS, user_role: "wizard" } }, error: null },
    ];
    for (const f of failures) {
      getClaims.mockResolvedValue(f);
      expect(await getRequestContext()).toBeNull();
    }
    // This is what the server actions depend on: a value, not a navigation.
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("requireRequestContext - OSTEOJP-WEB-8", () => {
  it("redirects a logged-out visitor to /login instead of throwing a bare Error", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    await expect(requireRequestContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(LOGIN_PATH);
  });

  it("does NOT report a plain logout - an expired cookie is not an incident", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() });
    await expect(requireRequestContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("an Auth OUTAGE reports to Sentry and does NOT redirect", async () => {
    // The important half of the fix. Redirecting here would report our outage
    // as this person's logout, with nothing on the error channel.
    const err = new AuthRetryableFetchError("fetch failed", 0);
    getClaims.mockResolvedValue({ data: null, error: err });
    await expect(requireRequestContext()).rejects.toThrow("AUTH_UNAVAILABLE");
    expect(redirect).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).toBe(err);
    expect(captureException.mock.calls[0]?.[1]).toMatchObject({ level: "error" });
  });

  it("carries the cause on the rethrown error, so the boundary can see it", async () => {
    const err = new AuthRetryableFetchError("fetch failed", 0);
    getClaims.mockResolvedValue({ data: null, error: err });
    await expect(requireRequestContext()).rejects.toMatchObject({ cause: err });
  });

  it("an unusable verified token redirects AND reports at warning level", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...CLAIMS, user_role: "wizard" } }, error: null });
    await expect(requireRequestContext()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(LOGIN_PATH);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0]?.[1]).toMatchObject({ level: "warning" });
  });

  it("returns the context and reports nothing on the happy path", async () => {
    getClaims.mockResolvedValue({ data: { claims: CLAIMS }, error: null });
    await expect(requireRequestContext()).resolves.toMatchObject({ role: "reception" });
    expect(redirect).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("Next control-flow signals are never swallowed", () => {
  /**
   * The regression that broke the build within minutes of the first fix: the
   * classifying try/catch caught `DynamicServerError` - what `cookies()` throws
   * under static generation to say "this route is dynamic" - and reported it as
   * an Auth outage. `pnpm build` failed on /clinical/new and /admin/services.
   *
   * Each digest below is a signal Next throws deliberately, and each must pass
   * through resolveRequestContext untouched.
   */
  const signals: Array<[string, string]> = [
    ["DYNAMIC_SERVER_USAGE", "cookies() during static generation"],
    ["NEXT_NOT_FOUND", "notFound()"],
    ["NEXT_REDIRECT;replace;/somewhere", "a redirect() from deeper in the stack"],
  ];

  for (const [digest, why] of signals) {
    it(`rethrows ${digest} (${why}) instead of calling it an outage`, async () => {
      const signal = Object.assign(new Error(digest), { digest });
      getClaims.mockRejectedValue(signal);
      await expect(resolveRequestContext()).rejects.toBe(signal);
      expect(captureException).not.toHaveBeenCalled();
    });
  }

  it("still classifies a REAL rejection as unavailable", () => {
    // The passthrough must not be so broad that it stops classifying anything.
    const boom = new TypeError("fetch failed");
    getClaims.mockRejectedValue(boom);
    return expect(resolveRequestContext()).resolves.toMatchObject({
      kind: "unavailable",
      cause: boom,
    });
  });

  it("an error carrying a NON-Next digest is still an outage, not a signal", async () => {
    const odd = Object.assign(new Error("nope"), { digest: "SOMETHING_ELSE" });
    getClaims.mockRejectedValue(odd);
    await expect(resolveRequestContext()).resolves.toMatchObject({ kind: "unavailable" });
  });
});
