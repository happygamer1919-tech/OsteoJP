import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { canonicalHostRedirect } from "@/lib/proxy/canonical-host";

// Next 16 renamed the `middleware` file convention to `proxy`. The exported
// function is `proxy`; the matcher config is unchanged.
export async function proxy(request: NextRequest) {
  /**
   * OSTEOJP-WEB-7 - CANONICAL HOST, AND IT RUNS FIRST.
   *
   * Before the session work and before the flight-request short circuit,
   * because a flight request on the wrong host is precisely the deploy-skew
   * case this removes: a tab left open on osteojp-platform.vercel.app posting
   * a server action whose id belongs to an older deployment.
   *
   * 308 and not 301: a permanent redirect that PRESERVES THE METHOD AND BODY.
   * A 301 turns a POST into a GET, which would silently discard a form
   * submission instead of moving it to the host that can answer it.
   */
  const canonical = canonicalHostRedirect(
    new URL(request.url),
    request.headers.get("host"),
    process.env.VERCEL_ENV,
  );
  if (canonical) return NextResponse.redirect(canonical, 308);

  // FIX (issue #353): running updateSession (Supabase SSR getUser + response
  // handling) on React Server Component flight requests interferes with React 19's
  // streamed-Suspense client completion — interactive components never hydrate and
  // server-action POSTs hang. Flight requests (RSC navigations, prefetches, and
  // server actions) are sub-fetches of a document navigation that has already been
  // session-gated, so they do not need their own per-request session refresh. Skip
  // updateSession for them and let the streamed response pass through untouched.
  // Full document navigations still run updateSession (auth gating + token refresh).
  const headers = request.headers;
  const isFlightRequest =
    headers.get("rsc") === "1" ||
    headers.get("next-router-prefetch") === "1" ||
    headers.has("next-action");
  if (isFlightRequest) {
    return NextResponse.next({ request });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Exclude server-to-server endpoints that authenticate themselves and must
    // NOT be redirected to /login in deployed envs:
    //   - `/api/inngest`        — Inngest serve endpoint and all subpaths
    //                             (INNGEST_SIGNING_KEY). Subpaths include
    //                             /invoicexpress, /ifthenpay, /stripe.
    //   - `/api/v1/ingestion`   — AI partner ingestion (HMAC over the raw body;
    //                             see app/api/v1/ingestion/.../route.ts). The
    //                             request is intentionally unauthenticated at the
    //                             session layer; its own HMAC check is the gate.
    //   - `/api/webhooks/ifthenpay`
    //                           — IfThenPay payment callback. Authenticated by the
    //                             constant-time anti-phishing key check inside the
    //                             handler (app/api/webhooks/ifthenpay/route.ts),
    //                             not by a Supabase session.
    //   - `/api/v1/integrations/stripe/webhook`
    //                           — Stripe webhook. Authenticated by the Stripe
    //                             signature over the raw body inside the handler
    //                             (app/api/v1/integrations/stripe/webhook/route.ts),
    //                             not by a Supabase session.
    // Each exclusion is path-scoped (covers its own subpaths only). Every other
    // route — app pages and all other /api/* routes, including the rest of
    // /api/v1 and any non-webhook integration routes — stays session-gated.
    "/((?!_next/static|_next/image|favicon.ico|api/inngest(?:/.*)?|api/v1/ingestion|api/webhooks/ifthenpay|api/v1/integrations/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
