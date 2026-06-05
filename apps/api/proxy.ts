import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed `middleware` to `proxy`. Refresh the Supabase session on every
// request; the per-route patient gate (requirePatient) does the authorization.
//
// `/api/health` is excluded so an uptime probe never depends on session refresh
// or Supabase reachability. Everything else flows through session refresh; route
// handlers still enforce the patient gate themselves.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
