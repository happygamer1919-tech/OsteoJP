import http from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * OBS-07 - one form post to one of the two link pages, handled by a real HTTP
 * server on 127.0.0.1, with the real Sentry SDK watching it.
 *
 * Test support only: link-codes.body.test.ts and link-codes.body-belt.test.ts
 * import it, and nothing the application ships does.
 *
 * WHAT IS REAL. The request: `fetch` with a `FormData`, so the body is the
 * multipart/form-data a browser sends for a server action, field `1_code`
 * included. The server: `node:http`, which is what the SDK's body capture is
 * hooked into. How the body is read: a stream pipeline, the way Next reads a
 * server action's body (next/dist/server/app-render/action-handler.js).
 *
 * WHAT STANDS IN. Next itself. Under @sentry/nextjs the SDK opens no span for
 * an incoming request, because Next does; here the handler opens that span, in
 * the same place: inside the request's own isolation scope, around the read.
 *
 * Nothing leaves the machine: the server listens on 127.0.0.1 and the tests
 * give the SDK a transport that keeps every envelope in an array.
 */

type Sdk = typeof import("@sentry/nextjs");

/** Stands for a visitor's session cookie. Synthetic. */
export const SESSION_COOKIE = "synthetic-session-value";

export type LinkPost = {
  route: "c" | "s";
  code: string;
  /** True: the action throws and the error is captured. False: only the trace leaves. */
  fail: boolean;
};

export async function postLinkForm(Sentry: Sdk, { route, code, fail }: LinkPost): Promise<void> {
  const server = http.createServer((req, res) => {
    void Sentry.startSpan(
      { name: `POST /${route}/${code}`, op: "http.server", forceTransaction: true },
      async () => {
        const sink = new PassThrough();
        sink.resume();
        await pipeline(req, sink);
        if (fail) Sentry.captureException(new Error("the action failed"));
      },
    ).then(() => res.end("ok"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  // The fields a server action posts: Next prefixes each with the action's
  // index, and `0` is the reference to the form itself.
  const body = new FormData();
  body.append("1_code", code);
  body.append("1_action", "confirm");
  body.append("0", '["$K1"]');

  try {
    const response = await fetch(`${origin}/${route}/${code}?nxtPcode=${code}`, {
      method: "POST",
      body,
      headers: {
        "next-action": "40a1b2c3d4",
        referer: `${origin}/${route}/${code}`,
        cookie: `sb-session=${SESSION_COOKIE}; last=/${route}/${code}`,
        "x-now-route-matches": `1=${code}&nxtPcode=${code}`,
        "next-router-state-tree": encodeURIComponent(
          `["",{"children":["${route}",{"children":[["code","${code}","d"],{"children":["__PAGE__",{}]}]}]}]`,
        ),
      },
    });
    await response.text();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** What the SDK had put on an event BEFORE any hook of ours ran. */
export type Seen = { type: string; body: boolean; cookies: boolean };

/**
 * Records, for every event the SDK builds, whether it carried a request body
 * and cookies at the moment the SDK finished building it. Scope processors run
 * after the integrations and before `beforeSend`, so this sees exactly what
 * the configuration let through, and the hooks have not touched it yet.
 */
export function watchEvents(Sentry: Sdk, seen: Seen[]): void {
  Sentry.getGlobalScope().addEventProcessor((event) => {
    const request = event.request;
    if (request !== undefined) {
      seen.push({
        type: event.type ?? "event",
        body: request.data !== undefined,
        cookies: request.cookies !== undefined || request.headers?.cookie !== undefined,
      });
    }
    return event;
  });
}

/**
 * With LINK_CODE_BODY_REPORT=1, one line per post: what each envelope was, how
 * long, and how many times the code and the session cookie stand in it. The
 * numbers a person asks for when a run fails; the assertions do not use them.
 */
export function reportWire(post: LinkPost, envelopes: readonly unknown[], seen: readonly Seen[]): void {
  if (process.env.LINK_CODE_BODY_REPORT !== "1") return;
  const count = (text: string, part: string) => text.split(part).length - 1;
  const report = envelopes.map((envelope) => {
    const text = JSON.stringify(envelope);
    const type = /"type":"([a-z_]{1,32})"/.exec(text)?.[1] ?? "unknown";
    return { type, bytes: text.length, code: count(text, post.code), cookie: count(text, SESSION_COOKIE) };
  });
  process.stdout.write(`${JSON.stringify({ post: `/${post.route}/<code>`, fail: post.fail, envelopes: report, seen })}\n`);
}
