import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Explicit, not inherited. It already defaults to false; pinning it means a
  // future SDK default change cannot silently flip PII capture on. CLAUDE.md
  // rule 7. The edge runtime has no LocalVariables integration (it is a
  // Node-inspector mechanism), so the frame-vars scrub lives in the server
  // config only.
  sendDefaultPii: false,
});
