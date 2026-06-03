import { serve } from "inngest/next";
import { inngest } from "@/lib/integrations/ifthenpay/inngest/client";
import { functions } from "@/lib/integrations/ifthenpay/inngest/functions";

// Inngest serve endpoint for the IfThenPay app. Separate from the reminders and
// InvoiceXpress endpoints because it is a distinct Inngest app (own client id).
// Inngest authenticates these server-to-server calls via INNGEST_SIGNING_KEY.
//
// Session middleware: the `proxy.ts` matcher already excludes `/api/inngest`
// AND its subpaths, so this path is reached without a Supabase session — no
// change to proxy.ts is required for the serve endpoint. (The PUBLIC callback
// webhook at /api/webhooks/ifthenpay is a different story — see that route.)

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
