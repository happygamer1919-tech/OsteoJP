// Stripe integration — typed HTTP client.
//
// Thin wrapper over fetch (mirrors the InvoiceXpress client; no SDK dependency,
// so it stays unit-testable by injecting a fetch impl, and we add no new vendor
// package). Responsibilities:
//   - authenticate with the secret key in the AUTHORIZATION header (Bearer) —
//     NEVER in the URL or query string;
//   - send Stripe's form-encoded bodies (application/x-www-form-urlencoded),
//     parse the JSON response, and translate the outcome into our error taxonomy
//     (errors.ts) so the caller/Inngest can reason about retryability;
//   - support the Idempotency-Key header so a retried create/refund never
//     double-charges.
//
// No `server-only`: unit-testable under vitest by injecting a fetch impl. In the
// app it runs server-side only (operations.ts is the entry point).
//
// PII / secrets rule (CLAUDE.md #7): this client never console-logs request
// bodies, the secret key, the client_secret, or response bodies. Errors carry
// status + Stripe's machine error code only — never amounts, emails, or tokens.

import {
  resolveCredentials,
  STRIPE_API_BASE,
  type StripeCredentials,
} from "./config";
import { StripeApiError, StripeNetworkError } from "./errors";
import type { SxErrorEnvelope } from "./types";

export type HttpMethod = "GET" | "POST" | "DELETE";

/** Minimal fetch surface we depend on — lets tests inject a mock. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export type StripeClientOptions = {
  /** Defaults to the resolved env credentials. Injected explicitly in tests. */
  credentials?: StripeCredentials;
  /** Defaults to global fetch. Injected in tests to avoid the network. */
  fetchImpl?: FetchLike;
};

export type RequestOptions = {
  method: HttpMethod;
  /** Path under the API base, e.g. "/payment_intents". */
  path: string;
  /** Form params (Stripe expects application/x-www-form-urlencoded). */
  form?: FormParams;
  /** Idempotency key → Stripe `Idempotency-Key` header. Safe-retry guard. */
  idempotencyKey?: string;
};

/** Nestable form params — Stripe encodes nesting as `metadata[invoice_id]=…`. */
export type FormParams = {
  [key: string]: string | number | boolean | undefined | FormParams;
};

/**
 * Encode params the way Stripe's API expects: bracketed nesting, no arrays
 * needed for our surface. Undefined values are dropped. Pure + exported for the
 * test that asserts we never put secrets/PII in places they shouldn't be.
 */
export function encodeForm(params: FormParams, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object") {
      const nested = encodeForm(value, field);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${encodeURIComponent(field)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

export class StripeClient {
  private readonly credentials: StripeCredentials;
  private readonly fetchImpl: FetchLike;

  constructor(opts: StripeClientOptions = {}) {
    // resolveCredentials() throws StripeConfigError when unset — so an
    // unconfigured (owner-gated) environment fails here, before any fetch.
    this.credentials = opts.credentials ?? resolveCredentials();
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  /**
   * Issue a request and parse the JSON response. Throws a StripeError subclass
   * on transport failure or non-2xx. The returned value is the parsed JSON
   * typed by the caller.
   */
  async request<T>(opts: RequestOptions): Promise<T> {
    const url = STRIPE_API_BASE + opts.path;
    const body = opts.form ? encodeForm(opts.form) : undefined;

    const headers: Record<string, string> = {
      // Secret key in the header — never in the URL/query (keeps it out of
      // access logs and proxies). Redacted from every error path by omission.
      Authorization: `Bearer ${this.credentials.secretKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    if (opts.idempotencyKey) {
      headers["Idempotency-Key"] = opts.idempotencyKey;
    }

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, { method: opts.method, headers, body });
    } catch (err) {
      // Transport-level: never includes the URL/key. Generic, retryable.
      const reason = err instanceof Error ? err.name : "unknown";
      throw new StripeNetworkError(
        `Stripe request failed at transport layer (${reason})`,
      );
    }

    const rawText = await res.text();

    if (!res.ok) {
      // Status + method + path + Stripe's machine code ONLY. We deliberately
      // DROP the human message: Stripe error messages can echo amounts or the
      // customer email, and CLAUDE.md #7 forbids that in error messages. The
      // path carries ids only. Status + code drive retryability.
      const code = parseErrorCode(rawText);
      throw new StripeApiError(
        res.status,
        `Stripe ${opts.method} ${opts.path} → HTTP ${res.status}` +
          (code ? ` (${code})` : ""),
        code,
      );
    }

    if (!rawText) return undefined as T;
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new StripeApiError(
        res.status,
        `Stripe ${opts.method} ${opts.path} → 2xx but unparseable JSON`,
      );
    }
  }
}

/** Pull only the machine `code` out of a Stripe error body; never the message. */
function parseErrorCode(rawText: string): string | undefined {
  if (!rawText) return undefined;
  try {
    const env = JSON.parse(rawText) as SxErrorEnvelope;
    return env.error?.code ?? env.error?.type;
  } catch {
    return undefined;
  }
}
