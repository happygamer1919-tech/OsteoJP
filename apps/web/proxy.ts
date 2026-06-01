import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the `middleware` file convention to `proxy`. The exported
// function is `proxy`; the matcher config is unchanged.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Exclude `/api/inngest` (and its subpaths): the Inngest serve endpoint
    // authenticates server-to-server via INNGEST_SIGNING_KEY, not the Supabase
    // user session, so it must not be redirected to /login in deployed envs.
    // All other routes (app pages and other /api/* routes) stay session-gated.
    "/((?!_next/static|_next/image|favicon.ico|api/inngest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
