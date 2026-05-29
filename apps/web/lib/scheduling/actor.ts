import "server-only";
import { headers } from "next/headers";

// The acting user is RequestContext (tenantId + role + userId) from
// @/lib/auth/context — there is one actor type app-wide. This module now only
// provides the audit IP helper.

/** Best-effort client IP for the audit row. Never throws. */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
    return ip ? ip.slice(0, 45) : null;
  } catch {
    return null;
  }
}
