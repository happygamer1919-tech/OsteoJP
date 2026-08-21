import * as Sentry from "@sentry/nextjs";

import { clientSentryDsn } from "./lib/observability/sentry-dsn";

Sentry.init({
  dsn: clientSentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Explicit, not inherited. It already defaults to false; pinning it means a
  // future SDK default change cannot silently flip PII capture on. On the
  // browser SDK this is what keeps request headers, cookies and the user IP
  // off the event. CLAUDE.md rule 7.
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
