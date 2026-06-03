import { serve } from "inngest/next";
import { inngest } from "@/lib/integrations/stripe/inngest/client";
import { functions } from "@/lib/integrations/stripe/inngest/functions";

// Inngest serve endpoint for the Stripe app. Separate from the reminders and
// InvoiceXpress endpoints because it is a distinct Inngest app (own client id).
// Inngest authenticates these server-to-server calls via INNGEST_SIGNING_KEY.
//
// TODO(hardening-lane): like /api/inngest, this path must be excluded from the
// Supabase session middleware so Inngest's calls aren't redirected to login.
// The matcher lives in apps/web/proxy.ts (owned by the hardening lane) — add
// `/api/inngest/stripe` (or broaden the existing `/api/inngest` exclusion to
// cover sub-paths). Do NOT edit that file from this stream. Until then this
// works against the local Inngest Dev Server but is intercepted in deployed
// environments.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
