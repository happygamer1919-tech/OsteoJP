import * as Sentry from "@sentry/nextjs";

import { clientSentryDsn } from "./lib/observability/sentry-dsn";
import { isForeignFrameEvent } from "./lib/observability/extension-noise";

Sentry.init({
  dsn: clientSentryDsn(),
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Explicit, not inherited. It already defaults to false; pinning it means a
  // future SDK default change cannot silently flip PII capture on. On the
  // browser SDK this is what keeps request headers, cookies and the user IP
  // off the event. CLAUDE.md rule 7.
  sendDefaultPii: false,

  /**
   * OBS-02 - browser-extension noise, and it is a CLIENT-ONLY filter.
   *
   * `denyUrls` matches on the event's culprit URL and catches the common
   * injected-script schemes outright. It is the cheap half.
   */
  denyUrls: [
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-(web-)?extension:\/\//i,
    /^extensions\//i,
  ],

  /**
   * The half that actually does the work. An extension injected as a plain
   * script into the page (executors/200.js, the observed example) has an
   * ordinary http(s) URL, so `denyUrls` cannot see it. `isForeignFrameEvent`
   * decides on the STACK instead: an event with frames, none of which is under
   * /_next/, is not about our code.
   *
   * IT FAILS OPEN BY CONSTRUCTION. Every case the predicate cannot decide -
   * no exception values, no stacktrace, no frames, or any frame of ours
   * anywhere in the stack - returns the event unchanged. Read the file: the
   * reasoning for each is written there, and the direction is deliberate.
   * Losing noise costs an unread issue; losing a real error costs the channel.
   */
  beforeSend(event) {
    return isForeignFrameEvent(event) ? null : event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
