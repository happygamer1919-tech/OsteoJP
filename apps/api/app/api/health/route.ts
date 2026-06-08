import { NextResponse } from "next/server";

// Public, unauthenticated liveness probe for api.osteojp.pt. Excluded from the
// session proxy (proxy.ts matcher) so an uptime check never depends on Supabase
// reachability or session refresh. Carries NO data — just a heartbeat.

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache a health check

export function GET(): Response {
  return NextResponse.json({ status: "ok", service: "api" });
}
