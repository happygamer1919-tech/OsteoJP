import * as Sentry from "@sentry/nextjs";

import { scrubLinkCodesIn } from "./lib/observability/link-codes";
import { serverSentryDsn } from "./lib/observability/sentry-dsn";

Sentry.init({
  dsn: serverSentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Explicit, not inherited. It already defaults to false; pinning it means a
  // future SDK default change cannot silently flip PII capture on. CLAUDE.md
  // rule 7. The edge runtime has no LocalVariables integration (it is a
  // Node-inspector mechanism), so the frame-vars scrub lives in the server
  // config only.
  sendDefaultPii: false,

  // OBS-07: a one-time link code (/c/<code>, /s/<code>) leaves in no event.
  // The proxy runs here for every request to those two pages, so this runtime
  // sees the code as surely as the server does. Four hooks, because an error,
  // a transaction, a span and a breadcrumb each take their own way out. See
  // lib/observability/link-codes.ts.
  beforeSend: (event) => scrubLinkCodesIn(event),
  beforeSendTransaction: (event) => scrubLinkCodesIn(event),
  beforeSendSpan: (span) => scrubLinkCodesIn(span),
  beforeBreadcrumb: (breadcrumb) => scrubLinkCodesIn(breadcrumb),
});
