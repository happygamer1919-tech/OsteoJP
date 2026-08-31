/**
 * OSTEOJP-WEB-7 - one host serves this application, and it is app.osteojp.pt.
 *
 * ==========================================================================
 * WHY THIS EXISTS
 * ==========================================================================
 * Both of 2026-08-31's Sentry issues fired on `osteojp-platform.vercel.app`.
 * That host serves the same production deployment, so pages render - but the
 * Supabase auth cookie is scoped to `app.osteojp.pt`, so NOTHING carries a
 * session there. Every protected route is a logged-out request, which is how
 * an auth-guard defect that a signed-in user would never meet ended up filling
 * the error channel on launch day.
 *
 * IT ALSO ENDS THE SERVER-ACTION DEPLOY SKEW ON THAT HOST. A `.vercel.app`
 * project domain follows the newest production deployment, while a browser tab
 * left open on it holds action ids from the deployment it loaded. Post an
 * action after a redeploy and the id is unknown to the server. Redirecting the
 * host away removes the surface those errors live on rather than papering over
 * each one.
 *
 * ==========================================================================
 * IT FAILS OPEN, AND IN EXACTLY ONE DIRECTION
 * ==========================================================================
 * A canonical-host redirect that fires when it should not is a site nobody can
 * reach - on a preview deployment, on a colleague's laptop, or during a domain
 * change. So every uncertain case returns null and serves the request:
 *
 *   - not a Vercel PRODUCTION environment  -> null (previews, local dev, CI)
 *   - no Host header at all                -> null (cannot decide)
 *   - localhost / 127.0.0.1 / [::1] / .localhost -> null, belt and braces
 *   - already on the canonical host        -> null
 *
 * The `VERCEL_ENV === "production"` gate is what excludes previews, and it does
 * so by construction rather than by pattern-matching deployment URLs: Vercel
 * sets it to "preview" for every preview build and leaves it unset locally. A
 * regex over `.vercel.app` hostnames would have to keep up with Vercel's URL
 * format; this does not.
 */

/** The one host this application is served from. */
export const CANONICAL_HOST = "app.osteojp.pt";

/** Hosts that must never be redirected, whatever else is true. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * The URL this request should be permanently redirected to, or null to serve it.
 *
 * `host` is the raw Host header, so it may carry a port. `vercelEnv` is
 * `process.env.VERCEL_ENV`, passed in rather than read here so the decision is
 * a pure function and the tests do not have to mutate the environment.
 */
export function canonicalHostRedirect(
  url: URL,
  host: string | null | undefined,
  vercelEnv: string | undefined,
): URL | null {
  // Only a Vercel PRODUCTION environment is canonicalised. This single line is
  // what keeps previews and local development working.
  if (vercelEnv !== "production") return null;

  if (!host) return null;

  // Strip the port, and lowercase: Host is case-insensitive and a comparison
  // that forgets so would redirect App.OsteoJP.pt to itself, forever.
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!hostname) return null;

  if (isLocalHost(hostname)) return null;
  if (hostname === CANONICAL_HOST) return null;

  // Same path, same query, canonical scheme and host. The hash never reaches
  // the server, so there is nothing to preserve there.
  const target = new URL(url.toString());
  target.protocol = "https:";
  target.host = CANONICAL_HOST;
  target.port = "";
  return target;
}
