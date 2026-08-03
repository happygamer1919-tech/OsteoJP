import { serve } from "inngest/next";
import { assertNotificationEnv } from "@osteojp/notify";
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
// BOOT VALIDATION runs at module scope, so it fires before `serve()` registers a
// single function. If the notification path is armed and a required var is
// missing, this deploy fails loudly at startup naming the FULL list of missing
// vars, instead of registering functions that would each fail separately at send
// time. It is a no-op while every live-send flag is off, which is what keeps
// local dev, CI and preview builds working.
assertNotificationEnv(["REMINDERS_LIVE_SEND", "INVITES_LIVE_SEND"]);

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
