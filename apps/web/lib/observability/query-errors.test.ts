import { describe, expect, it, vi } from "vitest";

import {
  ACCESSOR_MARK,
  DB_MESSAGE_MARK,
  MAX_DEPTH,
  QUERY_PARAMS_MARK,
  TOO_DEEP_MARK,
  databaseMessageMark,
  queryErrorScrubFailures,
  scrubQueryErrorsIn,
  scrubQueryParams,
} from "./query-errors";
import {
  CONSTRAINT,
  FAKE_NAME,
  FAKE_PHONE,
  SQL_TEXT,
  a,
  failedQuery,
  invalidInput,
  uniqueViolation,
} from "./query-errors.test.failed-query";

/**
 * OBS-09 - the function. query-errors.hooks.test.ts proves the wiring and
 * query-errors.envelope.test.ts the bytes the real SDK would send.
 *
 * Every test that asserts a value is gone first asserts it was there: a scrub
 * handed a value with nothing in it passes `not.toContain` for the wrong
 * reason.
 */

const UNIQUE_MARK = `${DB_MESSAGE_MARK} (code 23505, constraint ${CONSTRAINT})`;

/** An event the way the SDK writes one for a captured failed query: the cause first, then the error. */
function eventFor(error: Error) {
  const cause = (error as { cause?: Error }).cause;
  return {
    event_id: "e1",
    level: "error",
    exception: {
      values: [
        { type: cause?.name ?? "Error", value: cause?.message ?? "", mechanism: { type: "chained", source: "cause" } },
        { type: error.name, value: error.message, mechanism: { type: "generic", handled: true } },
      ],
    },
  };
}

describe("scrubQueryParams - one string", () => {
  it("cuts the parameters of drizzle's own message and keeps the SQL", () => {
    const message = failedQuery().message;
    // The control: drizzle really put both values in its message.
    expect(message).toContain(FAKE_NAME);
    expect(message).toContain(FAKE_PHONE);

    expect(scrubQueryParams(message)).toBe(`Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`);
  });

  it("cuts a parameter that holds new lines and commas, all of it", () => {
    const note = `${FAKE_NAME},\n    at notAFrame (x.js:1:1)\nparams: again`;
    const message = failedQuery(uniqueViolation(), [note]).message;
    expect(message).toContain("notAFrame");

    const out = scrubQueryParams(message);
    expect(out).not.toContain(FAKE_NAME);
    expect(out).not.toContain("notAFrame");
    expect(out.endsWith(QUERY_PARAMS_MARK)).toBe(true);
  });

  it("cuts a stack, which opens with the message, to the end", () => {
    const stack = String(failedQuery().stack);
    expect(stack).toContain(FAKE_NAME);
    expect(stack).toContain("    at ");

    const out = scrubQueryParams(stack);
    expect(out).toBe(`Error: Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`);
  });

  it("cuts the message where it stands inside other text, and inside JSON", () => {
    const message = failedQuery().message;
    const pasted = `could not save the ficha: ${message}`;
    expect(scrubQueryParams(pasted)).toBe(`could not save the ficha: Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`);

    const json = JSON.stringify({ message });
    expect(json).toContain(FAKE_NAME);
    expect(scrubQueryParams(json)).not.toContain(FAKE_NAME);
    expect(scrubQueryParams(json)).toContain(SQL_TEXT.replace(/"/g, '\\"'));
  });

  it("cuts drizzle's query logger line", () => {
    const line = `Query: ${SQL_TEXT} -- params: ["${FAKE_NAME}", "${FAKE_PHONE}"]`;
    expect(scrubQueryParams(line)).toBe(`Query: ${SQL_TEXT} -- params: ${QUERY_PARAMS_MARK}`);
  });

  it("is idempotent", () => {
    const once = scrubQueryParams(failedQuery().message);
    expect(scrubQueryParams(once)).toBe(once);
  });

  it("leaves alone text with no failed query in it, and a failed query with no parameters", () => {
    for (const text of [
      "params: a value with no query in front",
      "the query failed\nparams: none",
      `Failed query: ${SQL_TEXT}`,
      "Failed query: select 1 params: on the same line",
      "",
    ]) {
      expect(scrubQueryParams(text)).toBe(text);
    }
  });
});

describe("databaseMessageMark", () => {
  it("writes the code and the constraint", () => {
    expect(databaseMessageMark("23505", CONSTRAINT)).toBe(UNIQUE_MARK);
    expect(databaseMessageMark("CONNECTION_CLOSED", undefined)).toBe(`${DB_MESSAGE_MARK} (code CONNECTION_CLOSED)`);
  });

  it("writes nothing that is not the shape of a code or an identifier", () => {
    expect(databaseMessageMark(`23505 ${FAKE_NAME}`, `${FAKE_NAME}`)).toBe(DB_MESSAGE_MARK);
    expect(databaseMessageMark(23505, null)).toBe(DB_MESSAGE_MARK);
  });
});

describe("scrubQueryErrorsIn - an error event", () => {
  it("cuts both exceptions of a failed query and keeps the SQL, the code and the constraint", () => {
    const error = failedQuery();
    const event = eventFor(error);
    // The control.
    expect(JSON.stringify(event)).toContain(FAKE_NAME);

    const out = scrubQueryErrorsIn(event, { originalException: error });
    const [cause, outer] = out.exception.values;
    expect(cause?.value).toBe(UNIQUE_MARK);
    expect(outer?.value).toBe(`Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`);
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
    expect(JSON.stringify(out)).not.toContain(FAKE_PHONE);
  });

  it("replaces a driver message that echoes the value, found through the hint", () => {
    const error = failedQuery(invalidInput(), [FAKE_NAME]);
    const event = eventFor(error);
    expect(event.exception.values[0]?.value).toContain(FAKE_NAME);

    const out = scrubQueryErrorsIn(event, { originalException: error });
    expect(out.exception.values[0]?.value).toBe(`${DB_MESSAGE_MARK} (code 22P02)`);
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
  });

  it("finds the driver's message when a minifier renamed its class", () => {
    const error = failedQuery(invalidInput(a), [FAKE_NAME]);
    const event = eventFor(error);
    expect(event.exception.values[0]?.type).toBe("a");

    const out = scrubQueryErrorsIn(event, { originalException: error });
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
  });

  it("finds a server error thrown with no drizzle around it, as at COMMIT", () => {
    const raw = uniqueViolation();
    const event = {
      exception: { values: [{ type: "PostgresError", value: raw.message }] },
      breadcrumbs: [{ category: "console", message: `PostgresError: ${raw.message}` }],
    };
    const out = scrubQueryErrorsIn(event, { originalException: raw });
    expect(out.exception.values[0]?.value).toBe(UNIQUE_MARK);
    expect(out.breadcrumbs[0]?.message).toBe(`PostgresError: ${UNIQUE_MARK}`);
  });

  it("replaces any message under a failed query, keeping only its code", () => {
    const socket = Object.assign(new Error(`write CONNECTION_CLOSED ${FAKE_NAME}:6543`), { code: "CONNECTION_CLOSED" });
    const error = failedQuery(socket);
    const out = scrubQueryErrorsIn(eventFor(error), { originalException: error });
    expect(out.exception.values[0]?.value).toBe(`${DB_MESSAGE_MARK} (code CONNECTION_CLOSED)`);
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
  });

  it("replaces an exception named PostgresError when the event comes with no hint", () => {
    const event = { exception: { values: [{ type: "PostgresError", value: invalidInput().message }] } };
    const out = scrubQueryErrorsIn(event);
    expect(out.exception.values[0]?.value).toBe(DB_MESSAGE_MARK);
  });

  it("does not chase a short message through other strings, but still replaces the exception", () => {
    const short = Object.assign(new Error("ab"), { code: "XX000", severity: "ERROR" });
    const event = { exception: { values: [{ type: "Error", value: "ab" }] }, message: "about a cab" };
    const out = scrubQueryErrorsIn(event, { originalException: short });
    expect(out.exception.values[0]?.value).toBe(`${DB_MESSAGE_MARK} (code XX000)`);
    expect(out.message).toBe("about a cab");
  });

  it("follows the chain through an application error that wraps the failed query", () => {
    const inner = failedQuery(invalidInput(), [FAKE_NAME]);
    const outer = new Error("the ficha was not saved", { cause: inner });
    const event = {
      exception: {
        values: [
          { type: "PostgresError", value: (inner.cause as Error).message },
          { type: "Error", value: inner.message },
          { type: "Error", value: outer.message },
        ],
      },
    };
    const out = scrubQueryErrorsIn(event, { originalException: outer });
    expect(out.exception.values.map((v) => v.value)).toEqual([
      `${DB_MESSAGE_MARK} (code 22P02)`,
      `Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`,
      "the ficha was not saved",
    ]);
  });
});

describe("scrubQueryErrorsIn - objects", () => {
  it("cuts the error objects of a console breadcrumb, as they are logged", () => {
    const error = failedQuery();
    const breadcrumb = {
      category: "console",
      level: "error",
      message: String(error),
      data: { arguments: [error], logger: "console" },
    };
    const out = scrubQueryErrorsIn(breadcrumb, { input: [error], level: "error" });

    expect(out.message).toBe(`Error: Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`);
    const logged = out.data.arguments[0] as unknown as Record<string, unknown>;
    expect(logged).not.toBe(error);
    expect(logged.query).toBe(SQL_TEXT);
    expect(logged.params).toBe(QUERY_PARAMS_MARK);
    const cause = logged.cause as Record<string, unknown>;
    expect(cause).toEqual({
      name: "PostgresError",
      message: UNIQUE_MARK,
      severity_local: "ERROR",
      severity: "ERROR",
      code: "23505",
      schema_name: "public",
      table_name: "patients",
      constraint_name: CONSTRAINT,
      file: "nbtinsert.c",
      line: "666",
      routine: "_bt_check_unique",
    });
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
    // The application's own error is not touched.
    expect(error.message).toContain(FAKE_NAME);
    expect(error.params).toContain(FAKE_NAME);
  });

  it("cuts the plain data the SDK makes of the same error, in extra", () => {
    const event = {
      extra: {
        error: {
          message: failedQuery().message,
          name: "Error",
          query: SQL_TEXT,
          params: [FAKE_NAME, FAKE_PHONE],
          cause: {
            name: "PostgresError",
            message: `duplicate key value violates unique constraint "${CONSTRAINT}"`,
            severity: "ERROR",
            code: "23505",
            detail: `Key (full_name)=(${FAKE_NAME}) already exists.`,
            hint: `try ${FAKE_PHONE}`,
            where: `parameter $2 = '${FAKE_NAME}'`,
            internal_query: `select '${FAKE_NAME}'`,
            constraint_name: CONSTRAINT,
            stack: `PostgresError: ${FAKE_NAME}`,
          },
        },
      },
    };
    expect(JSON.stringify(event)).toContain(FAKE_NAME);

    const out = scrubQueryErrorsIn(event);
    const text = JSON.stringify(out);
    expect(text).not.toContain(FAKE_NAME);
    expect(text).not.toContain(FAKE_PHONE);
    expect(text).toContain(SQL_TEXT.replace(/"/g, '\\"'));
    expect(out.extra.error.cause).toEqual({
      name: "PostgresError",
      message: UNIQUE_MARK,
      severity: "ERROR",
      code: "23505",
      constraint_name: CONSTRAINT,
    });
  });

  it("cuts a driver error's own `parameters` and `args` when they are enumerable", () => {
    const debug = { query: SQL_TEXT, parameters: [FAKE_NAME], args: [FAKE_NAME], types: [25] };
    expect(scrubQueryErrorsIn(debug)).toEqual({
      query: SQL_TEXT,
      parameters: QUERY_PARAMS_MARK,
      args: QUERY_PARAMS_MARK,
      types: [25],
    });
  });

  it("cuts a transaction and a span that carry the message", () => {
    const message = failedQuery().message;
    const transaction = {
      type: "transaction",
      transaction: "POST /patients",
      spans: [{ span_id: "s1", description: "save", data: { "error.message": message } }],
    };
    const out = scrubQueryErrorsIn(transaction);
    expect(JSON.stringify(transaction)).toContain(FAKE_NAME);
    expect(JSON.stringify(out)).not.toContain(FAKE_NAME);
    expect(out.transaction).toBe("POST /patients");
  });
});

describe("scrubQueryErrorsIn - total, and it copies", () => {
  it("hands back the very same object when there is nothing to cut", () => {
    const event = {
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
      breadcrumbs: [{ category: "fetch", data: { url: "/api/v1/x" } }],
      extra: { note: "no query here" },
    };
    expect(scrubQueryErrorsIn(event, { originalException: new TypeError("x is undefined") })).toBe(event);
  });

  it("does not change the value it was handed", () => {
    const error = failedQuery();
    const event = eventFor(error);
    const before = JSON.stringify(event);
    scrubQueryErrorsIn(event, { originalException: error });
    expect(JSON.stringify(event)).toBe(before);
  });

  it("never calls a getter", () => {
    const getter = vi.fn(() => failedQuery().message);
    const value = { message: failedQuery().message };
    Object.defineProperty(value, "late", { get: getter, enumerable: true });
    const out = scrubQueryErrorsIn(value) as Record<string, unknown>;
    expect(getter).not.toHaveBeenCalled();
    expect(out.late).toBe(ACCESSOR_MARK);
  });

  it("ends on a cycle, and marks what is too deep", () => {
    const loop: Record<string, unknown> = { message: failedQuery().message };
    loop.self = loop;
    const out = scrubQueryErrorsIn(loop);
    expect(JSON.stringify(out.message)).not.toContain(FAKE_NAME);
    expect(out.self).toBe(out);

    let deep: Record<string, unknown> = { leaf: failedQuery().message };
    for (let i = 0; i <= MAX_DEPTH; i += 1) deep = { next: deep };
    const text = JSON.stringify(scrubQueryErrorsIn(deep));
    expect(text).toContain(TOO_DEEP_MARK);
    expect(text).not.toContain(FAKE_NAME);
  });

  it("leaves reduced, and says so once, when the walk itself fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hostile = { message: failedQuery().message, level: "error", nested: { kept: false } };
    // A hint whose every read throws: the walk cannot even begin.
    const hint = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("no");
        },
      },
    );
    const before = queryErrorScrubFailures();
    const out = scrubQueryErrorsIn(hostile, hint) as Record<string, unknown>;
    expect(queryErrorScrubFailures()).toBe(before + 1);
    expect(out).toEqual({ message: `Failed query: ${SQL_TEXT}\nparams: ${QUERY_PARAMS_MARK}`, level: "error" });
    expect(warn.mock.calls.flat().join(" ")).not.toContain(FAKE_NAME);
    warn.mockRestore();
  });
});
