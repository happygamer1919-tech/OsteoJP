import { beforeAll, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, postLinkForm, reportWire, watchEvents, type Seen } from "./link-codes.post-harness";

/**
 * OBS-07 - the hooks alone. The second of two independent layers, proven with
 * the first one taken away.
 *
 * link-codes.body.test.ts runs the app's server config as it is, where the SDK
 * is told not to record a request body at all. This file runs the same config
 * with that one instruction removed: the `integrations` option is replaced by
 * the SDK's own defaults, so the body and the cookies ARE recorded, as they
 * were before OBS-07. The hooks are the app's own, untouched.
 *
 * So a future SDK that records a body some other way, or a config edit that
 * drops the integration options, still sends no body: the hooks delete
 * `request.data` and `request.cookies` from everything that leaves, whatever
 * the content type, without reading them.
 *
 * The control is `seen`: it shows that in THIS arrangement the SDK did put the
 * body on the event. Without it, a clean wire would prove nothing.
 *
 * A file of its own because the SDK installs its request hooks once per
 * process, with the options of the first `init`.
 *
 * NOTHING LEAVES THIS PROCESS. See link-codes.body.test.ts.
 */

const h = vi.hoisted(() => ({ envelopes: [] as unknown[] }));

vi.mock("@sentry/nextjs", async (importOriginal) => {
  const loaded = await importOriginal<typeof import("@sentry/nextjs") & { default?: typeof import("@sentry/nextjs") }>();
  const actual = loaded.default ?? loaded;
  return {
    ...actual,
    init: (options: Parameters<typeof actual.init>[0]) =>
      actual.init({
        ...options,
        // The one difference from the app: the SDK's default integrations,
        // body capture included.
        integrations: (defaults) => defaults,
        dsn: "https://public@o0.ingest.example.invalid/1",
        tracesSampleRate: 1,
        transport: () => ({
          send: async (envelope: unknown) => {
            h.envelopes.push(envelope);
            return {};
          },
          flush: async () => true,
        }),
      }),
  };
});

/** Synthetic. Eight base64url characters that name no row anywhere. */
const CONFIRM = "Ab3xK9Qz";
const SURVEY = "q-7_Zt0P";

let Sentry: typeof import("@sentry/nextjs");
const seen: Seen[] = [];

beforeAll(async () => {
  Sentry = await import("@sentry/nextjs");
  await import("../../sentry.server.config");
  watchEvents(Sentry, seen);
});

const posts = [
  { route: "c", code: CONFIRM, fail: true, leaves: ["event", "transaction"] },
  { route: "c", code: CONFIRM, fail: false, leaves: ["transaction"] },
  { route: "s", code: SURVEY, fail: true, leaves: ["event", "transaction"] },
  { route: "s", code: SURVEY, fail: false, leaves: ["transaction"] },
] as const;

describe("a server action's form post, real SDK recording bodies, the app's hooks alone", () => {
  it.each(posts)("POST /$route/<code>, action throws: $fail", async ({ route, code, fail, leaves }) => {
    h.envelopes.length = 0;
    seen.length = 0;
    await postLinkForm(Sentry, { route, code, fail });
    await Sentry.flush(2_000);
    reportWire({ route, code, fail }, h.envelopes, seen);
    const wire = JSON.stringify(h.envelopes);

    // The control: the SDK recorded the body and the cookies on every event.
    expect(seen.map((one) => one.type).sort()).toEqual([...leaves].sort());
    expect(seen.every((one) => one.body && one.cookies)).toBe(true);

    for (const type of leaves) expect(wire).toContain(`"type":"${type}"`);
    expect(wire).toContain(`/${route}/[code]`);

    // And none of it left.
    expect(wire).not.toContain(code);
    expect(wire).not.toContain(SESSION_COOKIE);
    // The body, by two things only a multipart body has. (The content type
    // header says "form-data" too, and stays.)
    expect(wire).not.toContain("Content-Disposition");
    expect(wire).not.toContain("1_code");
    expect(wire.toLowerCase()).not.toContain("cookie");
    // Neither header that carries the route's parameters, as a header or
    // as the span attribute the SDK makes of one.
    expect(wire).not.toMatch(/route[-_]matches/i);
    expect(wire).not.toMatch(/state[-_]tree/i);
    expect(wire).toContain('"next-action":"40a1b2c3d4"');
  });
});
