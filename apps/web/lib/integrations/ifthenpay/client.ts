// IfThenPay integration — typed HTTP client.
//
// Thin wrapper over fetch. Responsibilities:
//   - build the request URL from the gateway base + path (NO secrets in the URL:
//     IfThenPay keys go in the JSON BODY, unlike InvoiceXpress);
//   - send JSON, parse JSON, and translate the outcome into our error taxonomy
//     (errors.ts) so the caller/Inngest can reason about retryability;
//   - keep ALL keys + payment data in the request BODY — never in the URL,
//     never logged.
//
// No `server-only`: unit-testable under vitest by injecting a fetch impl. In the
// app it runs server-side only (the operations + the callback job are the entry
// points).
//
// PII / secrets rule (CLAUDE.md #7 + payment-secrecy brief): this client never
// console-logs request bodies, URLs, keys, payer phone/email, or response
// bodies. Errors carry status + a short reason only — the response body is
// dropped because IfThenPay error payloads can echo the submitted request.

import { baseUrl } from "./config";
import { IfThenPayApiError, IfThenPayNetworkError } from "./errors";

export type HttpMethod = "GET" | "POST";

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

export type IfThenPayClientOptions = {
  /** Defaults to the env/base host. Injected explicitly in tests. */
  baseUrl?: string;
  /** Defaults to global fetch. Injected in tests to avoid the network. */
  fetchImpl?: FetchLike;
};

export type RequestOptions = {
  method: HttpMethod;
  /** Path under the gateway host, e.g. "/multibanco/reference/init". */
  path: string;
  /** JSON body — where ALL keys + payment data go. */
  body?: unknown;
};

/**
 * Redact known IfThenPay secret fields from any string before it could surface
 * in a log. Defense-in-depth: we also simply never pass bodies to loggers.
 */
export function redactSecrets(s: string): string {
  return s.replace(
    /("?(?:mbKey|mbWayKey|key|antiphishing)"?\s*[:=]\s*")[^"]*(")/gi,
    "$1[redacted]$2",
  );
}

export class IfThenPayClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: IfThenPayClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? baseUrl()).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  /**
   * Issue a request and parse the JSON response. Throws an IfThenPayError
   * subclass on transport failure or non-2xx. The returned value is the parsed
   * JSON typed by the caller.
   */
  async request<T>(opts: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${opts.path}`;

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, {
        method: opts.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      // Transport-level: never includes the URL/body/keys. Generic, retryable.
      const reason = err instanceof Error ? err.name : "unknown";
      throw new IfThenPayNetworkError(
        `IfThenPay request failed at transport layer (${reason})`,
      );
    }

    const rawText = await res.text();

    if (!res.ok) {
      // Status + method + path ONLY. We deliberately DROP the response body:
      // IfThenPay error payloads can echo the submitted request (keys, payer
      // contact), and CLAUDE.md #7 forbids that in error messages. The path
      // carries no PII. Status drives retryability.
      throw new IfThenPayApiError(
        res.status,
        `IfThenPay ${opts.method} ${opts.path} → HTTP ${res.status}`,
      );
    }

    if (!rawText) return undefined as T;
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new IfThenPayApiError(
        res.status,
        `IfThenPay ${opts.method} ${opts.path} → 2xx but unparseable JSON`,
      );
    }
  }
}
