import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * OBS-07 - the hooks AS THE THREE CONFIGS INSTALL THEM.
 *
 * link-codes.test.ts proves the function. This file proves the wiring, which
 * is where a scrubber is actually lost: a hook that was never assigned, or one
 * assigned beside another and silently replacing it. So nothing here imports
 * the scrubber. Each config file is imported for real, the options it hands to
 * `Sentry.init` are captured, and the functions found THERE are called with an
 * event that carries a code in every field an event has.
 *
 * `init` is the only thing stubbed, so nothing is initialised and nothing can
 * be sent anywhere.
 */

const h = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: h.init,
  captureRouterTransitionStart: () => undefined,
}));

/** Synthetic. Eight base64url characters that name no row anywhere. */
const CODE = "Ab3xK9Qz";
const SURVEY = "q-7_Zt0P";
const ORIGIN = "https://app.example.invalid";

type Hook = (value: unknown, hint?: unknown) => unknown;
type Options = {
  beforeSend?: Hook;
  beforeSendTransaction?: Hook;
  beforeSendSpan?: Hook;
  beforeBreadcrumb?: Hook;
  tracesSampleRate?: number;
  sendDefaultPii?: boolean;
};

const configs: Record<"server" | "edge" | "client", Options> = {
  server: {},
  edge: {},
  client: {},
};

beforeAll(async () => {
  // The DSN accessors warn once when no DSN is set, which is the state of a
  // test run. That warning is theirs to test, not noise for this file.
  const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);

  await import("../../sentry.server.config");
  configs.server = h.init.mock.calls.at(-1)?.[0] as Options;
  await import("../../sentry.edge.config");
  configs.edge = h.init.mock.calls.at(-1)?.[0] as Options;
  await import("../../instrumentation-client");
  configs.client = h.init.mock.calls.at(-1)?.[0] as Options;

  quiet.mockRestore();
  expect(h.init).toHaveBeenCalledTimes(3);
});

/** The frame of our own chunk for this very route. It must survive untouched. */
const OWN_CHUNK = `${ORIGIN}/_next/static/chunks/app/c/%5Bcode%5D/page-1a2b3c.js`;
/** The same chunk were the route ever moved under a route group. */
const GROUP_CHUNK = `${ORIGIN}/_next/static/chunks/app/(public)/c/%5Bcode%5D/page-1a2b3c.js`;

/** An id that opens with eight characters a caller could also put in the path. */
const TRACE_ID = "0123abcd456789ef0123abcd456789ef";

/** The header Next sends with a server action: the route tree, url-encoded. */
const STATE_TREE = encodeURIComponent(
  `["",{"children":["c",{"children":[["code","${CODE}","d"],{"children":["__PAGE__",{}]}]}]}]`,
);

/** A server action's body as it is on the wire. Bare: a name, a blank line, the code. */
const MULTIPART = [
  "------WebKitFormBoundaryx",
  'Content-Disposition: form-data; name="1_code"',
  "",
  CODE,
  "------WebKitFormBoundaryx",
  'Content-Disposition: form-data; name="1_action"',
  "",
  "confirm",
  "------WebKitFormBoundaryx--",
  "",
].join("\r\n");

/** Stands for a visitor's session cookie. Synthetic. */
const SESSION = "synthetic-session-value";

/** The attributes the SDK makes of a body and of the dropped headers, on a span. */
function requestAttributes(): Record<string, string> {
  return {
    "http.request.body.data": MULTIPART,
    "http.request.header.cookie.sb_session": SESSION,
    "http.request.header.cookie": `sb-session=${SESSION}`,
    "http.request.header.x_now_route_matches": `1=${CODE}&nxtPcode=${CODE}`,
    "http.request.header.next_router_state_tree": STATE_TREE,
  };
}

function breadcrumbs() {
  return [
    { category: "navigation", data: { from: `/c/${CODE}`, to: `/c/${CODE}?r=confirmed` } },
    { category: "fetch", type: "http", data: { method: "POST", url: `${ORIGIN}/c/${CODE}`, status_code: 303 } },
    { category: "xhr", type: "http", data: { method: "GET", url: `/s/${SURVEY}?r=generic` } },
    {
      category: "console",
      level: "error",
      message: `failed to load /s/${SURVEY}`,
      data: { arguments: ["failed to load", `${ORIGIN}/s/${SURVEY}`, { href: `/c/${CODE}` }], logger: "console" },
    },
    { category: "ui.click", message: `a[href="/c/${CODE}"]` },
  ];
}

function spans() {
  return [
    {
      span_id: "a1",
      trace_id: "t1",
      start_timestamp: 1,
      op: "http.client",
      description: `POST ${ORIGIN}/c/${CODE}`,
      data: {
        "http.url": `${ORIGIN}/c/${CODE}`,
        "url.full": `${ORIGIN}/c/${CODE}?r=generic`,
        "http.target": `/c/${CODE}`,
        "server.address": "app.example.invalid",
        "http.request.header.referer": `${ORIGIN}/s/${SURVEY}`,
        "sentry.op": "http.client",
        ...requestAttributes(),
      },
    },
    {
      span_id: "a2",
      trace_id: "t1",
      start_timestamp: 2,
      op: "function.server_action",
      description: `serverAction /s/${SURVEY}`,
      data: { "next.route": "/s/[code]", "next.span_name": `resolve page components /s/${SURVEY}` },
    },
  ];
}

function request() {
  return {
    url: `${ORIGIN}/c/${CODE}?r=generic`,
    method: "POST",
    query_string: "r=generic",
    // What the form post of either page carries: multipart/form-data, the
    // field named `1_code` by Next. No marker reads this shape, on purpose:
    // the body is removed whole, whatever it holds.
    data: MULTIPART,
    cookies: { "sb-session": SESSION, last: `/c/${CODE}` },
    headers: {
      cookie: `sb-session=${SESSION}; last=/c/${CODE}`,
      Cookie: `sb-session=${SESSION}`,
      "x-now-route-matches": `1=${CODE}&nxtPcode=${CODE}`,
      "X-Now-Route-Matches": encodeURIComponent(`1=${CODE}&nxtPcode=${CODE}`),
      referer: `${ORIGIN}/c/${CODE}`,
      Referer: `${ORIGIN}/s/${SURVEY}`,
      origin: ORIGIN,
      "next-url": `/c/${CODE}`,
      "next-action": "40a1b2c3d4",
      "next-router-state-tree": STATE_TREE,
      "x-invoke-path": `/s/${SURVEY}`,
      "user-agent": "vitest",
    },
  };
}

/** An error event with a code in every field an error event has. */
function errorEvent() {
  return {
    type: undefined,
    event_id: "e1",
    level: "error",
    message: `Unhandled: could not render /c/${CODE}`,
    logentry: { message: "could not render %s", params: [`/s/${SURVEY}`] },
    transaction: `/c/${CODE}`,
    transaction_info: { source: "url" },
    request: request(),
    tags: { route: `/c/${CODE}`, server_action: "failed", url: `${ORIGIN}/s/${SURVEY}` },
    extra: { href: `${ORIGIN}/c/${CODE}?r=generic`, nested: { list: [`/s/${SURVEY}`, 7, null] }, form: { code: SURVEY } },
    contexts: {
      nextjs: { request_path: `/c/${CODE}`, router_kind: "App Router", router_path: "/c/[code]", route_type: "render" },
      trace: { trace_id: TRACE_ID, span_id: "s1", data: { "http.target": `/c/${CODE}`, "http.route": "/c/[code]" } },
      culture: { locale: "pt-PT" },
    },
    breadcrumbs: breadcrumbs(),
    exception: {
      values: [
        {
          type: "Error",
          value: `fetch failed: POST ${ORIGIN}/c/${CODE} (code: ${CODE})`,
          mechanism: { type: "generic", handled: false, data: { url: `/s/${SURVEY}` } },
          stacktrace: {
            frames: [
              // An inline script's frame is named after the PAGE it sits in.
              { filename: `${ORIGIN}/c/${CODE}`, abs_path: `${ORIGIN}/c/${CODE}`, function: "?", lineno: 1 },
              { filename: OWN_CHUNK, abs_path: OWN_CHUNK, function: "onSubmit", in_app: true, vars: { code: CODE } },
            ],
          },
        },
      ],
    },
    sdkProcessingMetadata: {
      dynamicSamplingContext: { trace_id: "t1", public_key: "k", transaction: `GET /c/${CODE}` },
      normalizedRequest: { url: `${ORIGIN}/c/${CODE}`, headers: { referer: `${ORIGIN}/s/${SURVEY}` } },
    },
  };
}

/** A transaction with a code in every field a transaction has. */
function transactionEvent() {
  return {
    type: "transaction",
    event_id: "x1",
    transaction: `GET /c/${CODE}`,
    transaction_info: { source: "url" },
    start_timestamp: 1,
    timestamp: 2,
    request: request(),
    tags: { route: `/s/${SURVEY}` },
    contexts: {
      trace: {
        trace_id: "t1",
        span_id: "s1",
        op: "http.server",
        data: {
          "http.target": `/c/${CODE}?r=generic`,
          "http.url": `${ORIGIN}/c/${CODE}`,
          "url.full": `${ORIGIN}/c/${CODE}?r=generic`,
          "url.path": `/c/${CODE}`,
          "http.route": "/c/[code]",
          "next.route": "/c/[code]",
          "http.request.header.referer": `${ORIGIN}/s/${SURVEY}`,
          "sentry.source": "url",
          ...requestAttributes(),
        },
      },
    },
    spans: spans(),
    breadcrumbs: breadcrumbs(),
    sdkProcessingMetadata: {
      dynamicSamplingContext: { trace_id: "t1", public_key: "k", transaction: `GET /c/${CODE}` },
    },
  };
}

function expectNoCode(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(CODE);
  expect(text).not.toContain(SURVEY);
  // The url-encoded forms hold the same characters; said out loud all the same.
  expect(decodeURIComponent(text.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"))).not.toContain(CODE);
  // No body, no cookie, and neither header that carries the route's
  // parameters: not scrubbed, gone. By name, in any letter case, as a header
  // and as a span attribute.
  expect(text).not.toContain(SESSION);
  expect(text).not.toContain("form-data");
  expect(text.toLowerCase()).not.toContain("cookie");
  expect(text.toLowerCase()).not.toContain("route-matches");
  expect(text.toLowerCase()).not.toContain("route_matches");
  expect(text.toLowerCase()).not.toContain("state-tree");
  expect(text.toLowerCase()).not.toContain("state_tree");
  expect(text).not.toContain("http.request.body");
}

describe.each(["server", "edge", "client"] as const)("%s config", (name) => {
  it("installs all four hooks, and leaves sampling and the PII pin as they were", () => {
    const options = configs[name];
    expect(typeof options.beforeSend).toBe("function");
    expect(typeof options.beforeSendTransaction).toBe("function");
    expect(typeof options.beforeSendSpan).toBe("function");
    expect(typeof options.beforeBreadcrumb).toBe("function");
    // NODE_ENV is "test" under vitest, so this is the production branch.
    expect(options.tracesSampleRate).toBe(0.1);
    expect(options.sendDefaultPii).toBe(false);
  });

  it("beforeSend: an error event with a code in every field leaves with none", () => {
    const out = configs[name].beforeSend?.(errorEvent(), {}) as ReturnType<typeof errorEvent>;

    expect(out).not.toBeNull();
    expectNoCode(out);

    // And the route is still recognisable, field by field.
    expect(out.transaction).toBe("/c/[code]");
    expect(out.request.url).toBe(`${ORIGIN}/c/[code]?r=generic`);
    // The body and the cookies are not on the event at all, and the rest of
    // the request still is.
    expect(Object.keys(out.request).sort()).toEqual(["headers", "method", "query_string", "url"]);
    expect(Object.keys(out.request.headers).sort()).toEqual(
      ["Referer", "next-action", "next-url", "origin", "referer", "user-agent", "x-invoke-path"].sort(),
    );
    expect(out.request.headers.referer).toBe(`${ORIGIN}/c/[code]`);
    expect(out.request.headers.Referer).toBe(`${ORIGIN}/s/[code]`);
    expect(out.request.headers["next-url"]).toBe("/c/[code]");
    expect(out.tags.route).toBe("/c/[code]");
    expect(out.extra.form).toEqual({ code: "[code]" });
    expect(out.contexts.nextjs.request_path).toBe("/c/[code]");
    expect(out.message).toBe("Unhandled: could not render /c/[code]");
    expect(out.logentry.params).toEqual(["/s/[code]"]);
    expect(out.exception.values[0]?.value).toBe(`fetch failed: POST ${ORIGIN}/c/[code] (code: [code])`);
    expect(out.exception.values[0]?.stacktrace.frames[0]?.filename).toBe(`${ORIGIN}/c/[code]`);
    expect(out.breadcrumbs[0]?.data).toEqual({ from: "/c/[code]", to: "/c/[code]?r=confirmed" });
    expect(out.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe("GET /c/[code]");

    // Our own chunk's name is what Sentry matches a source map on: untouched.
    expect(out.exception.values[0]?.stacktrace.frames[1]?.filename).toBe(OWN_CHUNK);
    expect(out.exception.values[0]?.stacktrace.frames[1]?.abs_path).toBe(OWN_CHUNK);
    // An id is not a place a code is looked for.
    expect(out.contexts.trace.trace_id).toBe(TRACE_ID);
    // Untouched too: what never held a code.
    expect(out.request.headers["next-action"]).toBe("40a1b2c3d4");
    expect(out.contexts.culture).toEqual({ locale: "pt-PT" });
    expect(out.tags.server_action).toBe("failed");
  });

  it("beforeSend: the caller's event object is not rewritten under it", () => {
    const event = errorEvent();
    const before = JSON.stringify(event.breadcrumbs);
    configs[name].beforeSend?.(event, {});
    expect(JSON.stringify(event.breadcrumbs)).toBe(before);
  });

  it("beforeSendTransaction: a transaction with a code in every field leaves with none", () => {
    const out = configs[name].beforeSendTransaction?.(transactionEvent(), {}) as ReturnType<
      typeof transactionEvent
    >;

    expectNoCode(out);
    expect(out.type).toBe("transaction");
    expect(out.transaction).toBe("GET /c/[code]");
    expect(out.contexts.trace.data["http.target"]).toBe("/c/[code]?r=generic");
    expect(out.contexts.trace.data["url.full"]).toBe(`${ORIGIN}/c/[code]?r=generic`);
    expect(out.contexts.trace.data["http.route"]).toBe("/c/[code]");
    expect(out.spans).toHaveLength(2);
    expect(out.spans[0]?.description).toBe(`POST ${ORIGIN}/c/[code]`);
    expect(out.spans[1]?.description).toBe("serverAction /s/[code]");
    expect(out.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe("GET /c/[code]");
  });

  it("beforeSendSpan: each span leaves with none, and is still a span", () => {
    for (const span of spans()) {
      const out = configs[name].beforeSendSpan?.(span) as (typeof span) | null;
      // Returning nothing would not drop the span: the SDK keeps the ORIGINAL.
      expect(out).toBeTruthy();
      expectNoCode(out);
      expect(out?.span_id).toBe(span.span_id);
      expect(out?.op).toBe(span.op);
    }
    const first = configs[name].beforeSendSpan?.(spans()[0]) as ReturnType<typeof spans>[number];
    expect(first.description).toBe(`POST ${ORIGIN}/c/[code]`);
    const data: Record<string, unknown> = first.data;
    expect(data["http.target"]).toBe("/c/[code]");
    expect(data["server.address"]).toBe("app.example.invalid");
    // The body and the dropped headers are not attributes of the span any more.
    expect(Object.keys(data).sort()).toEqual(
      ["http.request.header.referer", "http.target", "http.url", "sentry.op", "server.address", "url.full"].sort(),
    );
  });

  it("beforeBreadcrumb: navigation, fetch, xhr, console and click each leave with none", () => {
    for (const breadcrumb of breadcrumbs()) {
      const out = configs[name].beforeBreadcrumb?.(breadcrumb, {}) as typeof breadcrumb | null;
      // Kept, not dropped: the trail is what explains an error.
      expect(out).toBeTruthy();
      expectNoCode(out);
      expect(out?.category).toBe(breadcrumb.category);
    }
  });

  it("beforeBreadcrumb: what the application logged is not rewritten in the application", () => {
    const state = { href: `/c/${CODE}` };
    const args = ["state", state];
    const out = configs[name].beforeBreadcrumb?.(
      { category: "console", data: { arguments: args } },
      {},
    );
    expectNoCode(out);
    expect(state.href).toBe(`/c/${CODE}`);
    expect(args[1]).toBe(state);
  });

  it("an event with no code in it passes every hook as the same object", () => {
    const plain = { type: undefined, message: "nothing", request: { url: `${ORIGIN}/agenda` } };
    const crumb = { category: "navigation", data: { from: "/clientes", to: "/settings" } };
    const span = { span_id: "z", description: "GET /patients/42", data: {} };
    expect(configs[name].beforeSendTransaction?.(plain, {})).toBe(plain);
    expect(configs[name].beforeBreadcrumb?.(crumb, {})).toBe(crumb);
    expect(configs[name].beforeSendSpan?.(span)).toBe(span);
  });

  it("every hook removes the reschedule link's token too (OBS-08)", () => {
    // Synthetic: the shape `lib/reminders/link-token.ts` signs, under no secret.
    const signature = `${"q-7_Zt0P".repeat(5)}x9Q`;
    const token = `eyJ0IjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAxIn0.${signature}`;
    const event = {
      type: undefined,
      message: `could not redeem /r/${token}`,
      transaction: `POST /r/${token}`,
      request: { url: `${ORIGIN}/r/${token}?a=confirm`, headers: { referer: `${ORIGIN}/r/${token}` } },
      extra: { form: { token, action: "confirm" } },
      exception: { values: [{ type: "Error", value: "x", stacktrace: { frames: [{ filename: OWN_CHUNK, in_app: true }] } }] },
    };
    const crumb = { category: "navigation", data: { from: `/r/${token}`, to: `/r/${token}?r=confirmed` } };
    const span = { span_id: "r1", description: `POST ${ORIGIN}/r/${token}`, data: { "http.target": `/r/${token}?a=cancel` } };

    const outs = [
      configs[name].beforeSend?.(event, {}),
      configs[name].beforeSendTransaction?.({ ...event, type: "transaction" }, {}),
      configs[name].beforeBreadcrumb?.(crumb, {}),
      configs[name].beforeSendSpan?.(span),
    ];
    for (const out of outs) {
      expect(out).toBeTruthy();
      const text = JSON.stringify(out);
      expect(text).not.toContain(signature.slice(0, 8));
      expect(text).toContain("/r/[token]");
    }
  });
});

describe.each(["server", "edge", "client"] as const)("%s config, values no hook should have to survive", (name) => {
  const hookNames = ["beforeSend", "beforeSendTransaction", "beforeSendSpan", "beforeBreadcrumb"] as const;

  /** A frame of ours, so the browser's noise filter keeps the event. */
  function ours() {
    return { values: [{ type: "Error", value: "x", stacktrace: { frames: [{ filename: OWN_CHUNK, in_app: true }] } }] };
  }

  it("a path chosen to match the trace id rewrites the path and leaves every id as it was", () => {
    const event = {
      type: "transaction",
      event_id: TRACE_ID,
      release: "0123abcd",
      transaction: "GET /c/0123abcd",
      request: { url: `${ORIGIN}/c/0123abcd` },
      contexts: { trace: { trace_id: TRACE_ID, span_id: "0123abcd01234567", parent_span_id: "890123abcd012345" } },
      spans: [{ span_id: "0123abcd01234567", trace_id: TRACE_ID, description: "GET /c/0123abcd" }],
    };
    const out = configs[name].beforeSendTransaction?.(event, {}) as typeof event;
    expect(out.transaction).toBe("GET /c/[code]");
    expect(out.request.url).toBe(`${ORIGIN}/c/[code]`);
    expect(out.event_id).toBe(TRACE_ID);
    expect(out.release).toBe("0123abcd");
    expect(out.contexts.trace).toEqual(event.contexts.trace);
    expect(out.spans[0]?.trace_id).toBe(TRACE_ID);
    expect(out.spans[0]?.span_id).toBe("0123abcd01234567");
    expect(out.spans[0]?.description).toBe("GET /c/[code]");
  });

  it("a frame's filename and abs_path leave as they came, under a route group too", () => {
    const frames = [
      { filename: GROUP_CHUNK, abs_path: GROUP_CHUNK, function: "onSubmit", in_app: true },
      { filename: "app/c/%5Bcode%5D/page.js", abs_path: "/var/task/apps/web/.next/server/app/c/[code]/page.js" },
    ];
    const event = {
      request: { url: `${ORIGIN}/c/${CODE}` },
      exception: { values: [{ type: "Error", value: "x", stacktrace: { frames } }] },
    };
    const out = configs[name].beforeSend?.(event, {}) as typeof event;
    expect(out.request.url).toBe(`${ORIGIN}/c/[code]`);
    expect(out.exception.values[0]?.stacktrace.frames).toEqual(frames);
  });

  it.each(hookNames)("%s does not throw on a getter that throws, and never calls it", (hookName) => {
    let calls = 0;
    const value = {
      category: "console",
      span_id: "a1",
      exception: ours(),
      message: `at /c/${CODE}`,
      data: {
        arguments: [
          {
            get boom(): string {
              calls += 1;
              throw new Error("a getter that throws");
            },
          },
        ],
      },
    };
    const out = configs[name][hookName]?.(value, {}) as typeof value;
    expect(out).toBeTruthy();
    expect(out.message).toBe("at /c/[code]");
    expect(calls).toBe(0);
  });

  it.each(hookNames)("%s does not throw on a revoked Proxy, and returns the rest scrubbed", (hookName) => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const value = {
      category: "console",
      span_id: "a1",
      exception: ours(),
      description: `GET /s/${SURVEY}`,
      data: { dead: proxy },
    };
    const out = configs[name][hookName]?.(value, {}) as { description: string; data: { dead: unknown } };
    expect(out).toBeTruthy();
    expect(out.description).toBe("GET /s/[code]");
    expect(typeof out.data.dead).toBe("string");
  });

  it.each(hookNames)("%s reads a megabyte of plus signs in a query string without stalling", (hookName) => {
    const query = "c+".repeat(512 * 1024);
    const url = `${ORIGIN}/c/${CODE}?q=${query}`;
    const value = {
      category: "fetch",
      span_id: "a1",
      exception: ours(),
      description: `GET ${url}`,
      request: { url, query_string: `q=${query}`, headers: { referer: url } },
      data: { url, "url.full": url, "http.query": `q=${query}` },
    };
    const started = performance.now();
    const out = configs[name][hookName]?.(value, {});
    const took = performance.now() - started;
    expect(out).toBeTruthy();
    expectNoCode(out);
    // Generous: it takes a few milliseconds.
    expect(took).toBeLessThan(2_000);
  });
});

describe("the hooks that were already there still do their own work", () => {
  it("server beforeSend still strips frame variables and still downgrades a ValidationError", () => {
    const event = errorEvent();
    const first = event.exception.values[0];
    if (first) first.type = "ValidationError";

    const out = configs.server.beforeSend?.(event, {}) as {
      level: string;
      tags: Record<string, string>;
      exception: { values: Array<{ stacktrace: { frames: object[] } }> };
    };

    expect(out.level).toBe("warning");
    expect(out.tags.operator_input).toBe("true");
    for (const frame of out.exception.values[0]?.stacktrace.frames ?? []) {
      expect(frame).not.toHaveProperty("vars");
    }
  });

  it("client beforeSend still drops an event none of whose frames is ours", () => {
    const event = errorEvent();
    const first = event.exception.values[0];
    if (first) {
      first.stacktrace.frames = [
        { filename: "https://cdn.example.invalid/executors/200.js", abs_path: "", function: "x", lineno: 1 },
      ];
    }
    expect(configs.client.beforeSend?.(event, {})).toBeNull();
  });

  it("client beforeSend keeps and scrubs an event that has a frame of ours", () => {
    const out = configs.client.beforeSend?.(errorEvent(), {});
    expect(out).not.toBeNull();
    expectNoCode(out);
  });
});
