import * as Sentry from "@sentry/nextjs";

import { serverSentryDsn } from "./lib/observability/sentry-dsn";

import { scrubLinkCodesIn } from "./lib/observability/link-codes";
import { scrubQueryErrorsIn } from "./lib/observability/query-errors";
import { scrubEvent } from "./lib/observability/sentry-scrub";

Sentry.init({
  // Read through the accessor so an ABSENT dsn is LOUD instead of a silent
  // no-op. See sentry-dsn.ts: zero events had ever reached Sentry and nothing
  // anywhere said so.
  dsn: serverSentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Explicit, not inherited. Both already default to false in the current SDK;
  // pinning them here means a future default change cannot silently arm PII
  // capture on a clinical database. CLAUDE.md rule 7: PII never appears in
  // logs, error messages or Sentry events.
  sendDefaultPii: false,
  includeLocalVariables: false,

  // Layer 1: drop the LocalVariables integration outright, so nothing can arm
  // it. `includeLocalVariables` above is the gate the integration reads; this
  // removes the integration that reads it.
  //
  // OBS-07: and no request body is recorded, on any route. Both public link
  // pages post their one-time code as a form field, and the SDK's default is
  // to keep the raw body of every request and put it on the error event and
  // on the transaction. Two integrations do that, and each is replaced by
  // itself with the body switched off:
  //
  //   - `Http` reads the body as it arrives. `maxIncomingRequestBodySize:
  //     "none"` means it is never read. `disableIncomingRequestSpans: true` is
  //     what @sentry/nextjs itself passes (Next makes those spans), and is
  //     repeated because this replaces the instance it made.
  //   - `RequestData` copies the request onto the event. `data: false` leaves
  //     the body out, `cookies: false` the cookie header and its parsed copy:
  //     a visitor's session is no more Sentry's to hold than a code is.
  //
  // What is lost: request bodies and cookies in Sentry, for the whole app.
  // Nothing reads them. link-codes.body.test.ts runs the real SDK with this
  // config and fails if a body comes back.
  integrations: (defaults) =>
    defaults
      .filter((integration) => integration.name !== "LocalVariables")
      .map((integration) => {
        if (integration.name === "Http") {
          return Sentry.httpIntegration({ disableIncomingRequestSpans: true, maxIncomingRequestBodySize: "none" });
        }
        if (integration.name === "RequestData") {
          return Sentry.requestDataIntegration({ include: { data: false, cookies: false } });
        }
        return integration;
      }),

  // Layer 2, independent of layer 1: whatever integrations are loaded, no
  // frame leaves this process carrying captured locals. See sentry-scrub.ts for
  // why the clinical claim path makes this load-bearing.
  //
  // `scrubEvent` is that scrub PLUS the INC-nif-validationerror-at-the-desk
  // severity downgrade, composed in one function because `beforeSend` takes
  // one - assigning a second concern here directly would have replaced the
  // scrub rather than joined it, and nothing would have said so.
  beforeSend: scrubEvent,

  // OBS-07: a one-time link code (/c/<code>, /s/<code>) leaves in no event.
  // `scrubEvent` above covers errors; an error is one of FOUR things this
  // process sends. A trace is a transaction and its spans, and neither passes
  // through `beforeSend`. Each hook is wrapped in an arrow because the SDK
  // hands hooks a second argument and `scrubLinkCodesIn` takes exactly one.
  //
  // OBS-09: and no failed query leaves with its parameters, through any of the
  // four. `scrubQueryErrorsIn` runs first and the link-code scrub last, as in
  // `scrubEvent`. The breadcrumb's hint IS handed on: for a console line it
  // holds the logged error itself, which is how the driver's message is known.
  // See lib/observability/query-errors.ts.
  beforeSendTransaction: (event) => scrubLinkCodesIn(scrubQueryErrorsIn(event)),
  beforeSendSpan: (span) => scrubLinkCodesIn(scrubQueryErrorsIn(span)),
  beforeBreadcrumb: (breadcrumb, hint) => scrubLinkCodesIn(scrubQueryErrorsIn(breadcrumb, hint)),
});
