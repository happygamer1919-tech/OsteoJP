import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client. BYPASSES RLS and auth restrictions. SERVER ONLY.
// Used by the patient activation path (createUser + recovery link). Never import
// into a client component or leak the key.
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
