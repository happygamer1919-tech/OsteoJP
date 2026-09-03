import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@osteojp/ui", "@osteojp/auth", "@osteojp/db", "@osteojp/i18n"],
};

// ==========================================================================
// SOURCE MAPS. WITHOUT THEM A SENTRY FRAME NAMES NOTHING.
// ==========================================================================
// Every server frame in the 2026-09-02 events was fully minified, so the file
// and line that raised them could not be located from Sentry at all - the
// P0 had to be re-derived by reading the repository and matching an arithmetic
// (185 = 136 + 49) against the message text. That works once. It does not work
// for a defect whose message does not carry its own arithmetic, which is why
// M_ID waits on this.
//
// THE UPLOAD IS ALREADY WIRED AND HAS NEVER RUN, because it needs a token this
// deployment does not have. THE VARIABLE NAMES, and nothing else, because
// values never enter this repository or a terminal's context:
//
//   SENTRY_AUTH_TOKEN   the only one that is missing today
//   SENTRY_ORG          the organisation slug
//   SENTRY_PROJECT      the project slug
//
// All three are already documented in `.env.example`. They belong on the
// `osteojp-platform` Vercel project (this app), Production and Preview.
//
// `sourcemaps.disable: false` IS WRITTEN OUT rather than left to the default.
// A default that flips in a minor release turns this off with nothing saying
// so, and a silently-disabled upload is indistinguishable from an absent token:
// both produce exactly the minified frames above.
//
// `deleteSourcemapsAfterUpload: true` KEEPS THEM OFF THE PUBLIC BUILD. The maps
// exist for the upload and are removed from the output afterwards, so no map is
// served to a browser. This is also why `productionBrowserSourceMaps` is NOT
// set here: it emits maps into the client output unconditionally, including on
// a build where the token is absent and nothing deletes them.
const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: false,
    deleteSourcemapsAfterUpload: true,
  },
};

// ==========================================================================
// AND IF THE TOKEN IS ABSENT, THE BUILD SAYS SO. LOUDLY. ONCE.
// ==========================================================================
// PORTAL-REHYDRATE 1.3: the expensive shape is the one where the system carries
// on reporting something reasonable. A build with no token still succeeds, still
// reports "Compiled successfully", and produces an app whose every stack trace
// is unreadable - and nobody learns that until the next incident, at the worst
// possible moment. This costs one line of build log and removes the silence.
//
// It NEVER prints a value, and it does not throw: a missing observability
// credential must not be able to take a deployment down.
const missingSentryVars = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"].filter(
  (name) => !process.env[name]?.trim(),
);
if (missingSentryVars.length > 0) {
  console.warn(
    `[build] Sentry source maps will NOT be uploaded: ${missingSentryVars.join(", ")} ` +
      "not set. Every stack frame this build produces will be minified and " +
      "unattributable. Set them on the Vercel project (names only; see .env.example).",
  );
}

export default withSentryConfig(nextConfig, sentryOptions);
