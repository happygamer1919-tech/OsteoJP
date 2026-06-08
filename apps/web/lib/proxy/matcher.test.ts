import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Verifies the auth-proxy matcher (apps/web/proxy.ts). The Supabase session
// proxy runs only on paths the matcher MATCHES; a path that fails to match is
// skipped entirely (never redirected to /login), which is how self-authenticating
// server-to-server endpoints are exempted.
//
// We rebuild the matcher exactly as Next.js applies it — the matcher source is a
// full-pathname regex, so we anchor it with ^…$ and test against pathnames.
const source = config.matcher[0];
const matcher = new RegExp(`^${source}$`);

// True  => proxy runs => route is session-gated.
// False => proxy skipped => route bypasses the session check (self-authed).
const isGated = (pathname: string) => matcher.test(pathname);

describe("auth proxy matcher", () => {
  // Signature/key-verified provider callbacks: must bypass the session proxy.
  const excluded = [
    "/api/webhooks/ifthenpay",
    "/api/v1/integrations/stripe/webhook",
    // Pre-existing self-authenticating endpoints (regression guard).
    "/api/inngest",
    "/api/v1/ingestion",
  ];

  it.each(excluded)("bypasses the session proxy for %s", (path) => {
    expect(isGated(path)).toBe(false);
  });

  it.each(excluded)("bypasses the session proxy for subpaths of %s", (path) => {
    expect(isGated(`${path}/extra`)).toBe(false);
  });

  // The exclusion is path-scoped, not a broad bypass: every other route stays
  // gated, including sibling/non-webhook integration routes.
  const gated = [
    "/dashboard",
    "/api/v1/patient/profile",
    "/api/v1/invoices",
    "/api/v1/integrations/stripe", // not the /webhook subpath
    "/api/v1/integrations/stripe/charge", // sibling, non-webhook
    "/api/webhooks", // not the /ifthenpay subpath
    "/api/webhooks/other",
  ];

  it.each(gated)("keeps the session proxy on %s", (path) => {
    expect(isGated(path)).toBe(true);
  });
});
