import { describe, expect, it } from "vitest";
import { notFound } from "next/navigation";
import { getRedirectError } from "next/dist/client/components/redirect";
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";

import { classifyActionError } from "./classify-action-error";

/**
 * SKEW-01 S9 - classification, with the REAL error objects Next's client builds.
 *
 * The skew error is constructed from the very module the action reducer throws
 * from (next/dist/client/components/unrecognized-action-error.js), with the
 * message the reducer gives it, so `unstable_isUnrecognizedActionError` is
 * exercised on the real class and not on a look-alike.
 */

function actionRedirect(url: string) {
  // Exactly what the reducer rejects with: createRedirectErrorForAction
  // (server-action-reducer.js:308-312) = getRedirectError + `handled = true`.
  const e = getRedirectError(url, "push") as Error & { handled?: boolean };
  e.handled = true;
  return e;
}

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected a throw");
}

describe("classifyActionError", () => {
  it("an UnrecognizedActionError is skew", () => {
    const e = new UnrecognizedActionError(
      'Server Action "abc123" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    );
    expect(classifyActionError(e)).toBe("skew");
  });

  it("an error NAMED UnrecognizedActionError from another copy of the class is still skew", () => {
    const e = new Error("x");
    e.name = "UnrecognizedActionError";
    expect(classifyActionError(e)).toBe("skew");
  });

  it("a TypeError is network, whatever the browser's message says", () => {
    for (const message of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "something no browser says",
    ]) {
      expect(classifyActionError(new TypeError(message))).toBe("network");
    }
  });

  it("the message 'Failed to fetch' on a plain Error is NOT network (never by message)", () => {
    expect(classifyActionError(new Error("Failed to fetch"))).toBe("other");
  });

  it("an action's redirect (handled by Next's reducer) is handled-redirect", () => {
    expect(classifyActionError(actionRedirect("/login"))).toBe("handled-redirect");
  });

  it("a redirect error Next has NOT handled is control-flow, not swallowed as a failure", () => {
    expect(classifyActionError(getRedirectError("/login", "push"))).toBe("control-flow");
  });

  it("notFound() is control-flow", () => {
    expect(classifyActionError(thrown(() => notFound()))).toBe("control-flow");
  });

  it("the AUTH_UNAVAILABLE outage throw and anything else is other", () => {
    expect(classifyActionError(new Error("AUTH_UNAVAILABLE"))).toBe("other");
    expect(classifyActionError(new Error("An unexpected response was received from the server."))).toBe(
      "other",
    );
    expect(classifyActionError("a string")).toBe("other");
    expect(classifyActionError(null)).toBe("other");
    expect(classifyActionError(undefined)).toBe("other");
  });
});
