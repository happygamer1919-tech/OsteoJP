import { serve } from "inngest/next";
import { inngest } from "@/lib/reminders/inngest/client";
import { functions } from "@/lib/reminders/inngest/functions";

// Inngest serve endpoint. Inngest calls GET (introspection), POST (function
// invocation), and PUT (registration). Requests are authenticated by the
// Inngest SDK via the signing key (INNGEST_SIGNING_KEY) — Stream E does not
// add its own auth here.
//
// TODO(hardening-lane): this route must be excluded from the Supabase session
// middleware so Inngest's server-to-server calls aren't redirected to login.
// The matcher lives in apps/web/middleware.ts, owned by the hardening lane this
// round — add an exclusion for `/api/inngest` (e.g. extend the matcher negative
// lookahead, or early-return in updateSession for that path). Do NOT edit that
// file from this stream. Until then the route works against the local Inngest
// Dev Server but will be intercepted in deployed environments.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
