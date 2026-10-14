import { beforeAll, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE, postLinkForm, reportWire, watchEvents, type Seen } from "./link-codes.post-harness";

/**
 * OBS-07 - the form post of the two link pages, real SDK, the app's own server
 * config, every byte that would leave.
 *
 * Both pages post the code as a field of a server action. That post is
 * multipart/form-data: `name="1_code"`, a blank line, the code. The SDK's
 * default is to keep the raw body of every request and put it on the error
 * event and on the transaction, and no marker in link-codes.ts reads that
 * shape. Without the two integration options below, the code is in both.
 *
 * Here the real SDK is started by importing sentry.server.config.ts itself.
 * Three things are replaced, none of which decides what is recorded: the DSN
 * (a host under `.invalid`, which resolves nowhere), the sample rate (every
 * trace, so the one transaction is not sampled away) and the transport (a
 * function that keeps the envelope in an array and sends nothing).
 *
 * TWO THINGS ARE ASSERTED, AND THEY ARE INDEPENDENT.
 *
 *   1. The wire: the code is in no envelope, and neither is the body or the
 *      session cookie. That is the configuration AND the hooks together.
 *   2. The source: the SDK never put a body or a cookie on an event in the
 *      first place, seen before any hook ran. That is the configuration
 *      alone, and it is what fails if the two integration options are taken
 *      out of sentry.server.config.ts.
 *
 * link-codes.body-belt.test.ts is the other half: the hooks alone, with the
 * SDK left to record bodies as it does by default.
 *
 * NOTHING LEAVES THIS PROCESS. The server is on 127.0.0.1 and the transport
 * below is the only way out of the SDK.
 */

const h = vi.hoisted(() => ({ envelopes: [] as unknown[] }));

vi.mock("@sentry/nextjs", async (importOriginal) => {
  // The package is CommonJS and re-exports the Node SDK: the whole set of
  // names is on `default`. See link-codes.envelope.test.ts.
  const loaded = await importOriginal<typeof import("@sentry/nextjs") & { default?: typeof import("@sentry/nextjs") }>();
  const actual = loaded.default ?? loaded;
  return {
    ...actual,
    init: (options: Parameters<typeof actual.init>[0]) =>
      actual.init({
        ...options,
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

async function wireOf(post: Parameters<typeof postLinkForm>[1]): Promise<{ wire: string; seen: Seen[] }> {
  h.envelopes.length = 0;
  seen.length = 0;
  await postLinkForm(Sentry, post);
  await Sentry.flush(2_000);
  reportWire(post, h.envelopes, seen);
  return { wire: JSON.stringify(h.envelopes), seen: [...seen] };
}

const posts = [
  { route: "c", code: CONFIRM, fail: true, leaves: ["event", "transaction"] },
  { route: "c", code: CONFIRM, fail: false, leaves: ["transaction"] },
  { route: "s", code: SURVEY, fail: true, leaves: ["event", "transaction"] },
  { route: "s", code: SURVEY, fail: false, leaves: ["transaction"] },
] as const;

describe("a server action's form post, real SDK, the app's own server config", () => {
  it.each(posts)("POST /$route/<code>, action throws: $fail", async ({ route, code, fail, leaves }) => {
    const { wire, seen: built } = await wireOf({ route, code, fail });

    // Something left, and it is what this case is about: an empty array would
    // pass every `not.toContain` below for the wrong reason.
    for (const type of leaves) expect(wire).toContain(`"type":"${type}"`);
    expect(wire).toContain(`/${route}/[code]`);
    if (fail) expect(wire).toContain("the action failed");

    // 1. The wire.
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
    // The rest of the request is still there to debug with.
    expect(wire).toContain('"next-action":"40a1b2c3d4"');
    expect(wire).toContain('"method":"POST"');

    // 2. The source. The SDK did build each event with the request on it...
    expect(built.map((one) => one.type).sort()).toEqual([...leaves].sort());
    // ...and with no body and no cookie, before any hook ran.
    expect(built.filter((one) => one.body)).toEqual([]);
    expect(built.filter((one) => one.cookies)).toEqual([]);
  });
});
