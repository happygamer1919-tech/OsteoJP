import { beforeAll, describe, expect, it, vi } from "vitest";

import { DB_MESSAGE_MARK, QUERY_PARAMS_MARK } from "./query-errors";
import { CONSTRAINT, FAKE_NAME, FAKE_PHONE, SQL_TEXT, failedQuery } from "./query-errors.test.failed-query";

/**
 * OBS-09 - the hooks AS THE THREE CONFIGS INSTALL THEM.
 *
 * The same method as link-codes.hooks.test.ts: each config file is imported
 * for real with only `init` stubbed, the options it hands to `Sentry.init` are
 * captured, and the functions found THERE are called. Nothing here imports the
 * scrubber's entry point, so a hook that was never wired, or wired without the
 * hint, fails here.
 */

const h = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: h.init,
  captureRouterTransitionStart: () => undefined,
}));

type Hook = (value: unknown, hint?: unknown) => unknown;
type Options = {
  beforeSend?: Hook;
  beforeSendTransaction?: Hook;
  beforeSendSpan?: Hook;
  beforeBreadcrumb?: Hook;
};

const configs: Record<"server" | "edge" | "client", Options> = { server: {}, edge: {}, client: {} };

beforeAll(async () => {
  // The DSN accessors warn once when no DSN is set, which is the state of a
  // test run. That warning is theirs to test.
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

const CUT = `Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`;
const UNIQUE_MARK = `${DB_MESSAGE_MARK} (code 23505, constraint ${CONSTRAINT})`;

function errorEvent(error: Error) {
  const cause = (error as { cause?: Error }).cause;
  return {
    event_id: "e1",
    level: "error",
    exception: {
      values: [
        { type: "PostgresError", value: cause?.message ?? "" },
        { type: "Error", value: error.message },
      ],
    },
    breadcrumbs: [{ category: "console", level: "error", message: `Error: ${error.message}` }],
  };
}

describe.each(["server", "edge", "client"] as const)("the %s config", (name) => {
  it("beforeSend: the SQL, the code and the constraint leave, the values do not", () => {
    const error = failedQuery();
    const event = errorEvent(error);
    // The control: the event as built carries both values.
    expect(JSON.stringify(event)).toContain(FAKE_NAME);
    expect(JSON.stringify(event)).toContain(FAKE_PHONE);

    const out = configs[name].beforeSend?.(event, { originalException: error }) as ReturnType<typeof errorEvent>;
    expect(out.exception.values.map((v) => v.value)).toEqual([UNIQUE_MARK, CUT]);
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
    expect(JSON.stringify(out)).not.toContain(FAKE_PHONE);
  });

  it("beforeBreadcrumb: a logged failed query leaves with no value, the error objects included", () => {
    const error = failedQuery();
    const breadcrumb = { category: "console", level: "error", message: String(error), data: { arguments: [error] } };
    expect(breadcrumb.message).toContain(FAKE_NAME);

    const out = configs[name].beforeBreadcrumb?.(breadcrumb, { input: [error], level: "error" });
    const text = JSON.stringify(out);
    expect(text).toContain(SQL_TEXT.replace(/"/g, '\\"'));
    expect(text).toContain(CONSTRAINT);
    expect(text).not.toContain(FAKE_NAME);
    expect(text).not.toContain(FAKE_PHONE);
  });

  it("beforeSendTransaction and beforeSendSpan: a message on a span leaves with no value", () => {
    const message = failedQuery().message;
    const span = { span_id: "s1", trace_id: "t1", start_timestamp: 1, data: { "error.message": message } };
    const transaction = { type: "transaction", transaction: "POST /patients", spans: [span] };
    expect(JSON.stringify(transaction)).toContain(FAKE_NAME);

    expect(JSON.stringify(configs[name].beforeSendTransaction?.(transaction))).not.toContain(FAKE_NAME);
    expect(JSON.stringify(configs[name].beforeSendSpan?.(span))).not.toContain(FAKE_NAME);
  });
});
