import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * OBS-07 - the bytes the real SDK would put on the wire, server config.
 *
 * link-codes.hooks.test.ts calls the hooks by hand, with events this lane
 * built. That leaves one question open: does the SDK call them, and on the
 * events IT builds? Here the real SDK is initialised with the real server
 * config, and the only two things replaced are the DSN (a host under
 * `.invalid`, which resolves nowhere) and the transport (a function that keeps
 * the envelope in an array and sends nothing). What is asserted is the
 * serialised envelope: header, item headers and payload, as one string.
 *
 * NOTHING LEAVES THIS PROCESS. The transport below is the only way out, and it
 * has no network call in it.
 */

const h = vi.hoisted(() => ({ envelopes: [] as unknown[] }));

vi.mock("@sentry/nextjs", async (importOriginal) => {
  // The package is CommonJS and re-exports the Node SDK. Imported as a module
  // only a fraction of its names are visible at the top level; the whole set
  // is on `default`. Without this line `flush` and `captureMessage` are absent.
  const loaded = await importOriginal<typeof import("@sentry/nextjs") & { default?: typeof import("@sentry/nextjs") }>();
  const actual = loaded.default ?? loaded;
  return {
    ...actual,
    init: (options: Parameters<typeof actual.init>[0]) =>
      actual.init({
        ...options,
        dsn: "https://public@o0.ingest.example.invalid/1",
        // Every trace, so the one this test starts is not sampled away. The
        // config's own rate is pinned in link-codes.hooks.test.ts.
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
const CODE = "Ab3xK9Qz";
const ORIGIN = "https://app.example.invalid";

let Sentry: typeof import("@sentry/nextjs");

beforeAll(async () => {
  Sentry = await import("@sentry/nextjs");
  await import("../../sentry.server.config");
});

async function sentBy(run: () => void | Promise<void>): Promise<string> {
  h.envelopes.length = 0;
  await run();
  await Sentry.flush(2_000);
  return JSON.stringify(h.envelopes);
}

describe("server config, real SDK, captured transport", () => {
  it("an error captured while handling /c/<code> is serialised with no code in it", async () => {
    const wire = await sentBy(() => {
      Sentry.withScope((scope) => {
        scope.setTransactionName(`POST /c/${CODE}`);
        scope.setTag("route", `/c/${CODE}`);
        scope.setExtra("href", `${ORIGIN}/c/${CODE}?r=generic`);
        scope.setContext("nextjs", { request_path: `/c/${CODE}`, router_path: "/c/[code]" });
        scope.setSDKProcessingMetadata({
          normalizedRequest: {
            url: `${ORIGIN}/c/${CODE}`,
            method: "POST",
            headers: {
              referer: `${ORIGIN}/c/${CODE}`,
              "next-router-state-tree": encodeURIComponent(`[["code","${CODE}","d"],{}]`),
            },
          },
        });
        Sentry.addBreadcrumb({ category: "fetch", data: { url: `${ORIGIN}/c/${CODE}`, method: "POST" } });
        Sentry.addBreadcrumb({ category: "console", message: `failed at /c/${CODE}` });
        Sentry.captureException(new Error(`could not redeem at ${ORIGIN}/c/${CODE}`));
      });
    });

    // Something was captured, and it is the event: an empty array would pass
    // the next assertion for the wrong reason.
    expect(wire).toContain('"type":"event"');
    expect(wire).toContain("could not redeem at");
    expect(wire).toContain("/c/[code]");
    expect(wire).not.toContain(CODE);
  });

  it("a trace of a request to /s/<code> is serialised with no code in it", async () => {
    const wire = await sentBy(() => {
      Sentry.startSpan(
        {
          name: `GET /s/${CODE}`,
          op: "http.server",
          attributes: { "http.target": `/s/${CODE}?r=generic`, "url.full": `${ORIGIN}/s/${CODE}?r=generic` },
        },
        () => {
          Sentry.startSpan(
            { name: `POST ${ORIGIN}/s/${CODE}`, op: "http.client", attributes: { "http.url": `${ORIGIN}/s/${CODE}` } },
            () => undefined,
          );
        },
      );
    });

    expect(wire).toContain('"type":"transaction"');
    expect(wire).toContain("/s/[code]");
    expect(wire).not.toContain(CODE);

    // The envelope HEADER names the transaction too (the sampling context),
    // and no hook is handed the header. It is clean because the SDK builds it
    // from the event after the hooks ran. Asserted on its own, so a change in
    // that order shows here.
    const headers = JSON.stringify((h.envelopes as unknown[][]).map((envelope) => envelope[0]));
    expect(headers).toContain('"transaction":"GET /s/[code]"');
  });

  it("class instances in a breadcrumb and in extra are serialised with no code in them", async () => {
    // link-codes.ts does not enter a class instance it does not know. This is
    // the proof that it does not have to: the SDK turns the event into plain
    // data before it calls beforeSend, and beforeSend reads the result.
    class Holder {
      href = `${ORIGIN}/c/${CODE}`;
      toJSON() {
        return { href: this.href, bare: `/s/${CODE}` };
      }
    }
    const wire = await sentBy(() => {
      Sentry.withScope((scope) => {
        scope.setExtra("holder", new Holder());
        scope.setExtra("url", new URL(`${ORIGIN}/s/${CODE}?r=generic`));
        Sentry.addBreadcrumb({
          category: "console",
          message: "logged",
          data: { arguments: [new Holder(), new URL(`${ORIGIN}/c/${CODE}`), new Map([["href", `/c/${CODE}`]])] },
        });
        Sentry.captureException(new Error("with instances"));
      });
    });

    expect(wire).toContain("with instances");
    // Each instance did arrive, as data, and arrived clean: not merely absent.
    expect(wire).toContain(`"holder":{"href":"${ORIGIN}/c/[code]","bare":"/s/[code]"}`);
    expect(wire).toContain(`${ORIGIN}/s/[code]?r=generic`);
    // In a breadcrumb the SDK keeps less depth: the holder is a label, the URL is text.
    expect(wire).toContain(`"arguments":["[Object]","${ORIGIN}/c/[code]"`);
    expect(wire).not.toContain(CODE);
  });

  it("a message captured with a code in its text is serialised with no code in it", async () => {
    const wire = await sentBy(() => {
      Sentry.captureMessage(`refused: ${ORIGIN}/s/${CODE}`, { level: "warning", tags: { at: `/s/${CODE}` } });
    });

    expect(wire).toContain("refused:");
    expect(wire).not.toContain(CODE);
  });
});
