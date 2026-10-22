import { beforeAll, describe, expect, it, vi } from "vitest";

import { CONSTRAINT, FAKE_NAME, FAKE_PHONE, SQL_TEXT, a, failedQuery, invalidInput } from "./query-errors.test.failed-query";

/**
 * OBS-09 - a failed query, the real SDK, the app's own server config, every
 * byte that would leave.
 *
 * The method of link-codes.envelope.test.ts: the real SDK is started by
 * importing sentry.server.config.ts, and three things are replaced, none of
 * which decides what is recorded: the DSN (a host under `.invalid`, which
 * resolves nowhere), the sample rate (every trace) and the transport (a
 * function that keeps the envelope in an array and sends nothing).
 *
 * The error is drizzle's real `DrizzleQueryError`, with a cause built the way
 * postgres.js builds one (query-errors.test.failed-query.ts), and the
 * parameters are made up.
 *
 * TWO THINGS ARE ASSERTED, AND THE SECOND IS WHAT KEEPS THE FIRST HONEST.
 *
 *   1. The wire: neither value is in any envelope, and the SQL text, the
 *      SQLSTATE and the constraint name are.
 *   2. The source: the event the SDK built DID carry the value, seen by a
 *      scope processor before any hook ran. Without it, a change that stopped
 *      the value reaching the event at all would pass (1) for the wrong reason.
 *
 * NOTHING LEAVES THIS PROCESS. The transport below is the only way out.
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

let Sentry: typeof import("@sentry/nextjs");
/** Each event as the SDK built it, before any hook: JSON, so later edits cannot reach it. */
const built: string[] = [];

/** The SQL as it stands inside a JSON string: its quotes escaped. */
const SQL_IN_JSON = JSON.stringify(SQL_TEXT).slice(1, -1);

beforeAll(async () => {
  // Silenced BEFORE the SDK starts, so the SDK's console wrapper calls this
  // and the test prints nothing. The wrapper still makes the breadcrumb.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Sentry = await import("@sentry/nextjs");
  await import("../../sentry.server.config");
  // Scope processors run after the integrations and before `beforeSend`.
  // `sdkProcessingMetadata` is left out: on a transaction it holds live
  // objects (timers) that do not serialise, and the SDK never sends it.
  Sentry.getGlobalScope().addEventProcessor((event) => {
    built.push(JSON.stringify({ ...event, sdkProcessingMetadata: undefined }));
    return event;
  });
});

async function sentBy(run: () => void | Promise<void>): Promise<{ wire: string; before: string }> {
  h.envelopes.length = 0;
  built.length = 0;
  await run();
  await Sentry.flush(2_000);
  return { wire: JSON.stringify(h.envelopes), before: built.join("\n") };
}

describe("a failed query, real SDK, the app's own server config", () => {
  it("a unique violation, logged and then captured, leaves its SQL, code and constraint and not its values", async () => {
    const error = failedQuery();
    // The control on the error itself: drizzle put both values in its message.
    expect(error.message).toContain(FAKE_NAME);
    expect(error.message).toContain(FAKE_PHONE);

    const { wire, before } = await sentBy(() => {
      Sentry.withScope(() => {
        // What Next does with an error nobody caught: one console line, which
        // the SDK keeps as a breadcrumb.
        console.error(error);
        Sentry.captureException(error);
      });
    });

    // 2. The source: the event as built carried the value.
    expect(before).toContain(FAKE_NAME);

    // Something left, and it is this event, with its breadcrumb.
    expect(wire).toContain('"type":"event"');
    expect(wire).toContain('"category":"console"');

    // 1. The wire.
    expect(wire).toContain(`Failed query: ${SQL_IN_JSON}`);
    expect(wire).toContain("code 23505");
    expect(wire).toContain(`constraint ${CONSTRAINT}`);
    expect(wire).not.toContain(FAKE_NAME);
    expect(wire).not.toContain(FAKE_PHONE);
  });

  it("a value Postgres echoes in its own message, under a renamed class, leaves in no envelope", async () => {
    const error = failedQuery(invalidInput(a), [FAKE_NAME]);
    expect((error.cause as Error).message).toContain(FAKE_NAME);

    const { wire, before } = await sentBy(() => {
      Sentry.captureException(error);
    });

    expect(before).toContain(FAKE_NAME);
    expect(wire).toContain('"type":"event"');
    expect(wire).toContain(`Failed query: ${SQL_IN_JSON}`);
    expect(wire).toContain("code 22P02");
    expect(wire).not.toContain(FAKE_NAME);
  });

  it("a captured message that quotes the failed query leaves with no value", async () => {
    const error = failedQuery();
    const { wire, before } = await sentBy(() => {
      Sentry.captureMessage(`the ficha was not saved: ${error.message}`, "warning");
    });

    expect(before).toContain(FAKE_NAME);
    expect(wire).toContain("the ficha was not saved: Failed query:");
    expect(wire).not.toContain(FAKE_NAME);
    expect(wire).not.toContain(FAKE_PHONE);
  });

  it("a trace with the message on a span leaves with no value", async () => {
    const error = failedQuery();
    const { wire, before } = await sentBy(() => {
      Sentry.startSpan({ name: "POST /patients", op: "http.server", forceTransaction: true }, () => {
        Sentry.startSpan({ name: "save", op: "function" }, (span) => {
          span.setAttribute("error.message", error.message);
        });
      });
    });

    expect(before).toContain(FAKE_NAME);
    expect(wire).toContain('"type":"transaction"');
    expect(wire).toContain(`Failed query: ${SQL_IN_JSON}`);
    expect(wire).not.toContain(FAKE_NAME);
  });
});
