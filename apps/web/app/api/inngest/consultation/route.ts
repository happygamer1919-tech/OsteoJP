import { serve } from "inngest/next";
import { inngest } from "@/lib/consultation/inngest/client";
import { functions } from "@/lib/consultation/inngest/functions";

// Inngest serve endpoint for the consultation fire-retry app. Separate from the
// reminders, IfThenPay, InvoiceXpress and Stripe endpoints because it is a
// distinct Inngest app with its own client id, and `serve()` takes one client.
//
// Session middleware: the proxy.ts matcher already excludes `/api/inngest` AND
// its subpaths, so this server-to-server call is reached without a Supabase
// session. Inngest authenticates it via INNGEST_SIGNING_KEY.
//
// NO assertNotificationEnv() HERE, deliberately. That boot check belongs to the
// reminders endpoint, which sends to patients when a live-send flag is on. This
// app sends nothing to anybody: it re-fires an internal webhook. Its config
// failures are per-attempt and already handled — a missing M1 or S3 var makes an
// attempt retryable and leaves the row pending, so the consultation waits for
// the operator instead of the deploy refusing to boot.

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
