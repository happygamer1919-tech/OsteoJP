"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser client for the patient set-password landing. Auto-detects the recovery
// fragment, persists the session to cookies, and lets the patient call
// updateUser() to set their first password. Anon key only.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
