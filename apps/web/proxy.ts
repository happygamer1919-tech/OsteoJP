import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the `middleware` file convention to `proxy`. The exported
// function is `proxy`; the matcher config is unchanged.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Exclude two server-to-server endpoints that authenticate themselves and
    // must NOT be redirected to /login in deployed envs:
    //   - `/api/inngest`        — Inngest serve endpoint (INNGEST_SIGNING_KEY).
    //   - `/api/v1/ingestion`   — AI partner ingestion (HMAC over the raw body;
    //                             see app/api/v1/ingestion/.../route.ts). The
    //                             request is intentionally unauthenticated at the
    //                             session layer; its own HMAC check is the gate.
    // Both exclusions cover subpaths. Every other route — app pages and all other
    // /api/* routes, including the rest of /api/v1 — stays session-gated.
    "/((?!_next/static|_next/image|favicon.ico|api/inngest|api/v1/ingestion|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
