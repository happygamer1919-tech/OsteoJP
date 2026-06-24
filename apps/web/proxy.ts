import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the `middleware` file convention to `proxy`. The exported
// function is `proxy`; the matcher config is unchanged.
//
// EXPERIMENT (issue #353 — silent streamed-Suspense hydration-completion failure):
// When PROXY_PASSTHROUGH is set (preview deploys only), skip updateSession and
// return a plain pass-through. This isolates whether running the Supabase SSR
// `getUser()` per-request — which touches the streamed response — is what breaks
// the client-side Suspense segment completion (un-hydrated forms; hanging server
// actions). Production leaves this env UNSET, so behavior is byte-for-byte
// identical to before. Remove this branch once #353 is root-caused.
export async function proxy(request: NextRequest) {
  if (process.env.PROXY_PASSTHROUGH === "1") {
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
