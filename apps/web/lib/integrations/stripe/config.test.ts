import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  credentialsConfigured,
  webhookSecretConfigured,
  resolveCredentials,
  resolveWebhookSecret,
} from "./config";
import { StripeConfigError } from "./errors";

// These tests flip env at call time (config reads process.env per call), so we
// snapshot + restore the relevant keys around each test.
const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("owner-gated default (unset)", () => {
  it("reports credentials unconfigured and throws on resolve", () => {
    expect(credentialsConfigured()).toBe(false);
    expect(() => resolveCredentials()).toThrow(StripeConfigError);
  });

  it("reports webhook secret unconfigured and throws on resolve", () => {
    expect(webhookSecretConfigured()).toBe(false);
    expect(() => resolveWebhookSecret()).toThrow(StripeConfigError);
  });

  it("does NOT leak any secret material in the config error", () => {
    const err = (() => {
      try {
        resolveCredentials();
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).not.toMatch(/sk_/);
  });
});

describe("when configured", () => {
  it("resolves the secret key", () => {
    process.env.STRIPE_SECRET_KEY = "  sk_test_abc  ";
    expect(credentialsConfigured()).toBe(true);
    expect(resolveCredentials()).toEqual({ secretKey: "sk_test_abc" });
  });

  it("resolves the webhook secret", () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_xyz";
    expect(webhookSecretConfigured()).toBe(true);
    expect(resolveWebhookSecret()).toBe("whsec_xyz");
  });

  it("treats a whitespace-only key as unset", () => {
    process.env.STRIPE_SECRET_KEY = "   ";
    expect(credentialsConfigured()).toBe(false);
  });
});
