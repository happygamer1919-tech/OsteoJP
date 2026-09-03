// SOURCE-MAP UPLOAD STAYS CONFIGURED, AND STAYS LOUD WHEN IT CANNOT RUN.
//
// ==========================================================================
// WHY A TEST AND NOT A COMMENT
// ==========================================================================
// The 2026-09-02 P0 was diagnosed by reading the repository, because every
// Sentry frame was minified: the upload has been WIRED since it was added and
// has never RUN, and nothing anywhere said so. A build with no auth token still
// succeeds and still reports "Compiled successfully".
//
// The upload itself cannot be proven here - it needs a token no terminal may
// hold and a Sentry the CI runner may not reach. What CAN be proven, and is the
// half that regressed, is that the build is still ASKING for it: that the three
// variable names are still read, that the upload is not silently disabled, that
// the maps are not left in the public output, and that a build missing any of
// the three says so rather than passing quietly.
//
// NAMES ONLY. No value of any of these variables appears in this repository.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = readFileSync(join(ROOT, "apps/web/next.config.ts"), "utf8");
const ENV_EXAMPLE = readFileSync(join(ROOT, ".env.example"), "utf8");

const VARS = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"];

describe("apps/web builds with Sentry source-map upload configured", () => {
  test("all three variables are read by the build", () => {
    for (const name of VARS) {
      assert.ok(
        CONFIG.includes(`process.env.${name}`),
        `next.config.ts no longer reads ${name}; source maps will not upload`,
      );
    }
  });

  test("every one of them is documented in .env.example", () => {
    // A variable the build needs and the example does not name is a variable
    // nobody sets. `env-example-covers-the-code.test.mjs` enforces this class
    // generally; these three are pinned here because they are the ones an
    // incident depends on and their absence is invisible at deploy time.
    for (const name of VARS) {
      assert.ok(
        new RegExp(`^${name}=`, "m").test(ENV_EXAMPLE),
        `${name} is missing from .env.example`,
      );
    }
  });

  test("the upload is not disabled, and the flag is WRITTEN OUT", () => {
    // Written rather than defaulted: a default that flips in a minor release
    // turns the upload off with nothing saying so, and a silently-disabled
    // upload is indistinguishable from an absent token - both produce the
    // minified frames that cost this project a diagnosis.
    assert.match(CONFIG, /disable:\s*false/);
    assert.doesNotMatch(CONFIG, /disable:\s*true/);
  });

  test("maps are deleted after upload, so none is served to a browser", () => {
    assert.match(CONFIG, /deleteSourcemapsAfterUpload:\s*true/);
  });

  test("productionBrowserSourceMaps is NOT set, which is deliberate", () => {
    // It emits maps into the client output unconditionally - including on a
    // build where the token is absent and nothing deletes them afterwards.
    //
    // THE ASSERTION IS ON THE ASSIGNMENT, NOT ON THE WORD. The config explains
    // in prose why the option is absent, and a bare substring match would read
    // that explanation as the thing it warns against - a guard that fires on
    // its own documentation is a guard nobody can leave documented.
    assert.doesNotMatch(CONFIG, /^\s*productionBrowserSourceMaps\s*:/m);
  });

  test("a build missing any of the three WARNS, naming which", () => {
    // The silence is the defect. This asserts the warning exists, names the
    // missing variables, and does not throw - a missing observability
    // credential must not be able to take a deployment down.
    assert.match(CONFIG, /console\.warn/);
    assert.match(CONFIG, /missingSentryVars/);
    assert.ok(
      !/throw new Error\([^)]*SENTRY/.test(CONFIG),
      "a missing Sentry variable must warn, never throw",
    );
  });

  test("NO VALUE of any of them appears in the config", () => {
    for (const name of VARS) {
      assert.doesNotMatch(
        CONFIG,
        new RegExp(`${name}\\s*[:=]\\s*["'][^"']+["']`),
        `${name} appears to carry a literal value`,
      );
    }
  });
});
