import { Inngest } from "inngest";

// Inngest client for the consultation fire-retry app.
//
// Its own client id, and therefore its own serve endpoint, matching the pattern
// the IfThenPay / InvoiceXpress / Stripe apps already follow: `serve()` takes one
// client, so a second app needs a second route rather than an edit to the
// reminders endpoint.
//
// Keys are read from env by the SDK itself (INNGEST_EVENT_KEY /
// INNGEST_SIGNING_KEY). Nothing is hardcoded here.
//
// NO EVENT TYPES, DELIBERATELY. The retry is a CRON SCAN OF THE TABLE, not a
// reaction to an event, and that is the whole point of the card. An event-driven
// retry would be delivered by the same class of mechanism that just failed: the
// fire that did not land is exactly the case where an event announcing it may
// not land either. The durable record is the row; the scanner reads rows.

export const inngest = new Inngest({ id: "osteojp-consultation" });
