import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_URL,
  baseUrl,
  callbackKeyConfigured,
  mbWayConfigured,
  multibancoConfigured,
  resolveCallbackKey,
  resolveMbKey,
  resolveMbWayKey,
} from "./config";
import { IfThenPayConfigError } from "./errors";

// These tests own the IfThenPay env vars; snapshot + restore around each test so
// they never leak the owner-gated "unset" default to other suites.
const KEYS = [
  "IFTHENPAY_MB_KEY",
  "IFTHENPAY_MBWAY_KEY",
  "IFTHENPAY_ANTIPHISHING_KEY",
  "IFTHENPAY_BASE_URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("owner-gated default (keys unset)", () => {
  it("reports every credential as not configured", () => {
    expect(multibancoConfigured()).toBe(false);
    expect(mbWayConfigured()).toBe(false);
    expect(callbackKeyConfigured()).toBe(false);
  });

  it("throws a non-retryable config error from each resolver — no network reached", () => {
    for (const resolve of [resolveMbKey, resolveMbWayKey, resolveCallbackKey]) {
      const err = (() => {
        try {
          resolve();
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(IfThenPayConfigError);
      expect((err as IfThenPayConfigError).retryable).toBe(false);
    }
  });
});

describe("resolution when set", () => {
  it("trims and returns each key", () => {
    process.env.IFTHENPAY_MB_KEY = " mb-1 ";
    process.env.IFTHENPAY_MBWAY_KEY = "mbway-1";
    process.env.IFTHENPAY_ANTIPHISHING_KEY = "anti-1";
    expect(resolveMbKey()).toBe("mb-1");
    expect(resolveMbWayKey()).toBe("mbway-1");
    expect(resolveCallbackKey()).toBe("anti-1");
    expect(multibancoConfigured()).toBe(true);
  });
});

describe("baseUrl", () => {
  it("defaults to the gateway host", () => {
    expect(baseUrl()).toBe(DEFAULT_BASE_URL);
  });
  it("honours an override (e.g. sandbox host)", () => {
    process.env.IFTHENPAY_BASE_URL = "https://sandbox.ifthenpay.test";
    expect(baseUrl()).toBe("https://sandbox.ifthenpay.test");
  });
});
