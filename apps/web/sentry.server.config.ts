import * as Sentry from "@sentry/nextjs";

import { stripFrameVars } from "./lib/observability/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
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
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== "LocalVariables"),

  // Layer 2, independent of layer 1: whatever integrations are loaded, no
  // frame leaves this process carrying captured locals. See sentry-scrub.ts for
  // why the clinical claim path makes this load-bearing.
  beforeSend: stripFrameVars,
});
