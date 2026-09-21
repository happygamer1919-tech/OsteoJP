import { describe, expect, it } from "vitest";

import {
  STATUS_CALLBACK_BASE_VAR,
  STATUS_CALLBACK_PATH,
  statusCallbackParam,
  statusCallbackUrl,
} from "./status-callback";

/**
 * THE FILE `status-callback.ts`'S OWN HEADER NAMES. That header has claimed
 * since OBS-04 that the per-message parameter "is asserted by
 * `status-callback.test.ts`"; this is that file, and it pins the URL Twilio is
 * handed with every message. It is written here because this URL rides on every
 * send in the app, so its shape is the message's problem and not only the
 * status's.
 */
describe("the StatusCallback URL", () => {
  const withBase = (v: string) => ({ [STATUS_CALLBACK_BASE_VAR]: v }) as Record<string, string>;

  it("is null when the origin is unset or blank, so the parameter is omitted", () => {
    expect(statusCallbackUrl({})).toBeNull();
    expect(statusCallbackUrl(withBase(""))).toBeNull();
    expect(statusCallbackUrl(withBase("   "))).toBeNull();
    expect(statusCallbackParam({})).toEqual({});
  });

  it("addresses the route, from the configured origin only", () => {
    const url = statusCallbackUrl(withBase("https://app.osteojp.test"));
    expect(url).not.toBeNull();
    expect(new URL(url!).origin).toBe("https://app.osteojp.test");
    expect(new URL(url!).pathname).toBe(STATUS_CALLBACK_PATH);
  });

  it("strips trailing slashes rather than doubling one Twilio would sign differently", () => {
    expect(statusCallbackUrl(withBase("https://app.osteojp.test///"))).toBe(
      statusCallbackUrl(withBase("https://app.osteojp.test")),
    );
  });

  it("is the whole parameter handed to `messages.create`", () => {
    const url = statusCallbackUrl(withBase("https://app.osteojp.test"))!;
    expect(url).toBe(`https://app.osteojp.test${STATUS_CALLBACK_PATH}`);
    expect(statusCallbackParam(withBase("https://app.osteojp.test"))).toEqual({
      statusCallback: url,
    });
  });

  /**
   * NO FRAGMENT, ON EITHER CONSTANT, AND THAT IS ASSERTED RATHER THAN ASSUMED.
   * A fragment on this URL is how Twilio's connection overrides are expressed,
   * and this URL is a parameter on EVERY send, so anything the Messages API
   * declined here would cost the message and not just the status. The route
   * verifies signatures against `signedRequestUrl(STATUS_CALLBACK_PATH)`, so
   * the path must stay fragment-free in any case.
   */
  it("carries no fragment, on the path the route signs or on the URL we send", () => {
    expect(STATUS_CALLBACK_PATH).not.toContain("#");
    expect(statusCallbackUrl(withBase("https://app.osteojp.test"))).not.toContain("#");
    expect(new URL(statusCallbackUrl(withBase("https://app.osteojp.test"))!).hash).toBe("");
  });
});
