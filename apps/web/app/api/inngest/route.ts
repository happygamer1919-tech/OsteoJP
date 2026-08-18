import { serve } from "inngest/next";
import { inngest } from "@/lib/reminders/inngest/client";
import { functions } from "@/lib/reminders/inngest/functions";

// Inngest serve endpoint. Inngest calls GET (introspection), POST (function
// invocation), and PUT (registration). Requests are authenticated by the Inngest
// SDK via the signing key (INNGEST_SIGNING_KEY); this route adds no auth of its
// own.
//
// `/api/inngest` and all its subpaths are excluded from the Supabase session
// proxy — see the matcher in apps/web/proxy.ts — so these server-to-server calls
// are never intercepted. (The TODO that used to sit here claimed the opposite.
// It was stale by two months, and it cost a diagnostic detour: an unsigned GET
// returning 401 {"message":"Unauthorized"} was read as the proxy blocking the
// route, when it is the Inngest SDK's own cloud-mode response to a request with
// no signature, and therefore proof the request DID reach the handler.)
//
// ===========================================================================
// INC-12, 2026-08-18: THE BOOT ASSERTION THAT USED TO SIT HERE TOOK THIS WHOLE
// ROUTE DOWN.
// ===========================================================================
// It was `assertNotificationEnv(["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"])`,
// at module scope, before `serve()`. On 2026-08-18 REMINDERS_LIVE_SEND=true
// reached production with REMINDERS_LINK_SECRET absent and it threw here, so
// /api/inngest returned an error for EVERY method - including the GET Inngest
// uses for introspection and the PUT it uses to register. The reminder stream
// could not send AND could not be re-registered, from one missing variable.
//
// The check moved to createNotifier().dispatch, so an armed-but-incomplete
// config now fails the individual send with the same NotificationEnvError and
// leaves the route serving. The deploy-time signal is kept as a log in
// lib/reminders/clients.ts, which this route's functions import transitively.
//
// Nothing is asserted here on purpose: a route is not a send.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
