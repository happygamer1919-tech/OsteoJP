import { describe, expect, it } from "vitest";
import { CANONICAL_HOST, canonicalHostRedirect } from "./canonical-host";

/**
 * OSTEOJP-WEB-7.
 *
 * MOST OF THESE ASSERT THAT NOTHING HAPPENS, and that is deliberate. A
 * canonical-host redirect that fires when it should not is a site nobody can
 * reach: a preview deployment that bounces reviewers to production, or a
 * colleague's laptop redirecting itself off localhost. The failure directions
 * are not symmetric, so the not-redirected cases carry the weight.
 */
const at = (u: string) => new URL(u);
const PROD = "production";

describe("canonicalHostRedirect - it redirects", () => {
  it("sends the vercel.app production host to the canonical one", () => {
    const r = canonicalHostRedirect(
      at("https://osteojp-platform.vercel.app/clinical/new"),
      "osteojp-platform.vercel.app",
      PROD,
    );
    expect(r?.toString()).toBe(`https://${CANONICAL_HOST}/clinical/new`);
  });

  it("preserves the path AND the query string", () => {
    const r = canonicalHostRedirect(
      at("https://osteojp-platform.vercel.app/patients?q=maria&sort=lastVisit&page=3"),
      "osteojp-platform.vercel.app",
      PROD,
    );
    expect(r?.toString()).toBe(
      `https://${CANONICAL_HOST}/patients?q=maria&sort=lastVisit&page=3`,
    );
  });

  it("upgrades http to https", () => {
    const r = canonicalHostRedirect(at("http://old.example.com/agenda"), "old.example.com", PROD);
    expect(r?.protocol).toBe("https:");
    expect(r?.host).toBe(CANONICAL_HOST);
  });

  it("drops a port from the target", () => {
    const r = canonicalHostRedirect(at("https://other.example.com:8443/x"), "other.example.com:8443", PROD);
    expect(r?.toString()).toBe(`https://${CANONICAL_HOST}/x`);
  });

  it("is case-insensitive about the Host header, but does not redirect the canonical host to itself", () => {
    // Host is case-insensitive. A comparison that forgot would loop forever.
    expect(canonicalHostRedirect(at("https://app.osteojp.pt/x"), "App.OsteoJP.PT", PROD)).toBeNull();
  });
});

describe("canonicalHostRedirect - it does NOT redirect", () => {
  it("leaves the canonical host alone", () => {
    expect(canonicalHostRedirect(at("https://app.osteojp.pt/agenda"), CANONICAL_HOST, PROD)).toBeNull();
  });

  it("leaves the canonical host with a port alone", () => {
    expect(canonicalHostRedirect(at("https://app.osteojp.pt/a"), `${CANONICAL_HOST}:443`, PROD)).toBeNull();
  });

  it("leaves VERCEL PREVIEW deployments alone, so previews keep working", () => {
    expect(
      canonicalHostRedirect(
        at("https://osteojp-platform-abc123-scope.vercel.app/agenda"),
        "osteojp-platform-abc123-scope.vercel.app",
        "preview",
      ),
    ).toBeNull();
  });

  it("leaves LOCAL DEVELOPMENT alone (VERCEL_ENV unset)", () => {
    expect(canonicalHostRedirect(at("http://localhost:3000/agenda"), "localhost:3000", undefined)).toBeNull();
    expect(canonicalHostRedirect(at("http://localhost:3000/agenda"), "localhost:3000", "development")).toBeNull();
  });

  it("leaves every localhost spelling alone even if VERCEL_ENV said production", () => {
    // Belt and braces: the env gate already covers this, and it should not be
    // the only thing standing between a developer and a redirect loop.
    for (const h of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "web.localhost"]) {
      expect(canonicalHostRedirect(at("http://localhost:3000/x"), h, PROD)).toBeNull();
    }
  });

  it("serves the request when there is no Host header to judge", () => {
    expect(canonicalHostRedirect(at("https://x/y"), null, PROD)).toBeNull();
    expect(canonicalHostRedirect(at("https://x/y"), "", PROD)).toBeNull();
    expect(canonicalHostRedirect(at("https://x/y"), "   ", PROD)).toBeNull();
  });
});

describe("the exact host condition, stated once", () => {
  it("redirects if and only if VERCEL_ENV is production AND the host is neither canonical nor local", () => {
    const cases: Array<[string, string | null, string | undefined, boolean]> = [
      ["https://a/x", "osteojp-platform.vercel.app", "production", true],
      ["https://a/x", "osteojp-platform.vercel.app", "preview", false],
      ["https://a/x", "osteojp-platform.vercel.app", undefined, false],
      ["https://a/x", CANONICAL_HOST, "production", false],
      ["https://a/x", "localhost:3000", "production", false],
      ["https://a/x", null, "production", false],
    ];
    for (const [url, host, env, expected] of cases) {
      expect(canonicalHostRedirect(at(url), host, env) !== null, `${host} / ${env}`).toBe(expected);
    }
  });
});
