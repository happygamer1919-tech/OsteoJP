import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  credentialsConfigured,
  resolveCredentials,
  accountBaseUrl,
} from "./config";
import { InvoiceXpressConfigError } from "./errors";

// The owner-gated default: with the key unset, the integration must refuse to
// resolve credentials — this is what makes "do not hit the live sandbox"
// enforceable in code, not just convention.

const ENV_KEYS = ["INVOICEXPRESS_API_KEY", "INVOICEXPRESS_ACCOUNT_NAME"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("credential gating (owner-gated default)", () => {
  it("credentialsConfigured is false when the key is unset", () => {
    expect(credentialsConfigured()).toBe(false);
  });

  it("is false with only one of the two present", () => {
    process.env.INVOICEXPRESS_API_KEY = "k";
    expect(credentialsConfigured()).toBe(false);
    delete process.env.INVOICEXPRESS_API_KEY;
    process.env.INVOICEXPRESS_ACCOUNT_NAME = "osteojp";
    expect(credentialsConfigured()).toBe(false);
  });

  it("treats whitespace-only values as unset", () => {
    process.env.INVOICEXPRESS_API_KEY = "   ";
    process.env.INVOICEXPRESS_ACCOUNT_NAME = "osteojp";
    expect(credentialsConfigured()).toBe(false);
  });

  it("is true only when both are present", () => {
    process.env.INVOICEXPRESS_API_KEY = "k";
    process.env.INVOICEXPRESS_ACCOUNT_NAME = "osteojp";
    expect(credentialsConfigured()).toBe(true);
  });
});

describe("resolveCredentials", () => {
  it("throws InvoiceXpressConfigError (non-retryable) when unset", () => {
    expect(() => resolveCredentials()).toThrowError(InvoiceXpressConfigError);
    try {
      resolveCredentials();
    } catch (e) {
      expect((e as InvoiceXpressConfigError).retryable).toBe(false);
    }
  });

  it("never leaks a secret in the config error message", () => {
    process.env.INVOICEXPRESS_API_KEY = "super-secret-key-value";
    delete process.env.INVOICEXPRESS_ACCOUNT_NAME;
    try {
      resolveCredentials();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-key-value");
    }
  });

  it("resolves trimmed credentials when set", () => {
    process.env.INVOICEXPRESS_API_KEY = " k ";
    process.env.INVOICEXPRESS_ACCOUNT_NAME = " osteojp ";
    expect(resolveCredentials()).toEqual({ apiKey: "k", accountName: "osteojp" });
  });
});

describe("accountBaseUrl", () => {
  it("builds the account subdomain host", () => {
    expect(accountBaseUrl("osteojp")).toBe("https://osteojp.app.invoicexpress.com");
  });
});
