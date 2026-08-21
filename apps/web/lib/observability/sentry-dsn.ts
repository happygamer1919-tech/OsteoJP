/**
 * The Sentry DSN, or `undefined` — with a LOUD log the first time it is absent.
 *
 * ==========================================================================
 * WHY THIS EXISTS: `Sentry.init({ dsn: undefined })` IS A SILENT NO-OP
 * ==========================================================================
 * The SDK initialises happily, every `captureException` returns an event id,
 * `onRequestError` fires on every server error — and nothing is ever sent. There
 * is no warning, no throw, and no difference visible from inside the process.
 *
 * That is PORTAL-REHYDRATE §1.3 at the deployment layer: a missing value maps
 * onto the harmless-looking case, and the system carries on reporting something
 * reasonable. It is also **exactly what happened**. On 2026-08-21 the owner
 * opened the Sentry project and found the ONBOARDING screen — "Get Started with
 * Sentry Issues", step 2 Verify not completed. **Zero events had ever arrived**,
 * through months of deployments and at least one page that threw on every single
 * request.
 *
 * NOBODY MISSED A WARNING, BECAUSE THERE WAS NONE TO MISS. That is the whole
 * argument for this file: the fix is not "set the variable", it is "make the
 * absence audible", because the variable can go missing again in a new
 * environment, a new project, or a restored backup — and the next time it does,
 * this says so on the first request instead of staying quiet for months.
 *
 * NAME ONLY, NEVER THE VALUE. A DSN is a credential-shaped string and standing
 * rule 3 forbids printing one. The log names the variable and nothing else.
 */

let warnedServer = false;

/**
 * Read `SENTRY_DSN` for the server and edge runtimes.
 *
 * SILENT IN DEVELOPMENT, DELIBERATELY. A local checkout has no DSN and should
 * not, so warning there trains everyone to ignore the message — and a warning
 * people ignore is worse than none, which is the lesson `ACC-vacuous-guard-sweep`
 * keeps producing in a different costume.
 */
export function serverSentryDsn(): string | undefined {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) return dsn;

  if (process.env.NODE_ENV !== "development" && !warnedServer) {
    warnedServer = true;
    console.error(
      "[observability] SENTRY_DSN is not set. Sentry.init() will accept this " +
        "and then DISCARD EVERY EVENT SILENTLY - no warning, no throw, and " +
        "captureException still returns an id. Server errors, including Server " +
        "Component render failures reported through onRequestError, are going " +
        "NOWHERE. This is a deployment misconfiguration, not a user error. " +
        "Verify with /admin/sentry-check.",
    );
  }
  return undefined;
}

let warnedClient = false;

/** The browser DSN. Same reasoning; a separate variable and a separate flag. */
export function clientSentryDsn(): string | undefined {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) return dsn;

  if (process.env.NODE_ENV !== "development" && !warnedClient) {
    warnedClient = true;
    console.error(
      "[observability] NEXT_PUBLIC_SENTRY_DSN is not set. Browser errors are " +
        "being discarded silently. This is a deployment misconfiguration.",
    );
  }
  return undefined;
}

/**
 * Whether the server DSN is configured, for the verification screen.
 *
 * A BOOLEAN, NEVER THE VALUE, so the screen can say "configured" without
 * putting a credential-shaped string on a page.
 */
export function serverSentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}
