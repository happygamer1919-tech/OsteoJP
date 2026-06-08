import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. BYPASSES RLS. SERVER ONLY. The superadmin app is
// inherently cross-tenant (it lists and manages every tenant), so its data
// access runs through the BYPASSRLS path; tenant RLS policies are unchanged and
// still confine every tenant-role session. Never import into a client component.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "createSupabaseAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
