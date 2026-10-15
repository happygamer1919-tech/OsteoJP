import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it, vi } from "vitest";

/**
 * OBS-08. The three public link pages send only their origin as Referer
 * (`strict-origin`, never the path that carries the code), and no other path is
 * touched.
 *
 * Reads the headers the exported config really returns (after the Sentry
 * wrapper), and matches each source the way Next's router does: strict, and
 * without regard to case, since `experimental.caseSensitiveRoutes` is not set.
 */
type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

async function configuredRules(): Promise<HeaderRule[]> {
  // next.config.ts warns at load when the source map upload variables are absent.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const config = (await import("../../next.config")).default as { headers?: () => Promise<HeaderRule[]> };
    expect(typeof config.headers).toBe("function");
    return await (config.headers as () => Promise<HeaderRule[]>)();
  } finally {
    warn.mockRestore();
  }
}

/** Every header the config gives this pathname, in the order Next applies them. */
async function headersFor(pathname: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rule of await configuredRules()) {
    const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true, sensitive: false });
    if (match(pathname) === false) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

// Synthetic: eight base64url characters, and a token of the reschedule link's
// shape that no secret signed.
const CODE = "Ab3xK9Qz";
const TOKEN = `eyJ0IjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAwIn0.${"A".repeat(43)}`;

describe("Referrer-Policy on the link pages", () => {
  const linkPages = [
    `/c/${CODE}`,
    `/s/${CODE}`,
    `/r/${TOKEN}`,
    // A trailing slash is not matched here: Next answers `/c/<code>/` with a
    // redirect to `/c/<code>` first, and that is the page that renders.
    `/s/${CODE}/x`,
    `/C/${CODE}`,
    `/R/${TOKEN}`,
  ];

  it.each(linkPages)("%s is served with Referrer-Policy: strict-origin", async (pathname) => {
    expect(await headersFor(pathname)).toEqual({ "referrer-policy": "strict-origin" });
  });

  const otherPaths = [
    "/",
    "/login",
    "/agenda",
    "/clientes",
    "/settings",
    "/reminders",
    "/recuperacao",
    "/patients/1",
    "/api/v1/c/thing",
    "/api/version",
    "/_next/static/chunks/app/c/%5Bcode%5D/page.js",
    "/marcacoes/c/x",
  ];

  it.each(otherPaths)("%s gets no header from the config", async (pathname) => {
    expect(await headersFor(pathname)).toEqual({});
  });

  it("the config names exactly the three link pages and that one header", async () => {
    const rules = await configuredRules();
    expect(rules.map((rule) => rule.source)).toEqual(["/c/:path*", "/s/:path*", "/r/:path*"]);
    for (const rule of rules) {
      expect(rule.headers).toEqual([{ key: "Referrer-Policy", value: "strict-origin" }]);
    }
  });
});
