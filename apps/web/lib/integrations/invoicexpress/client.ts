// InvoiceXpress integration — typed HTTP client.
//
// Thin wrapper over fetch. Responsibilities:
//   - build the request URL (api_key in the query string, as InvoiceXpress
//     requires) WITHOUT ever logging it or putting it in an error;
//   - send JSON, parse JSON, and translate the outcome into our error taxonomy
//     (errors.ts) so the caller/Inngest can reason about retryability;
//   - keep ALL fiscal data in the request BODY — never in the URL, never logged.
//
// No `server-only`: unit-testable under vitest by injecting a fetch impl. In the
// app it runs server-side only (operations.ts is the entry point).
//
// PII / secrets rule (CLAUDE.md #7): this client never console-logs request
// bodies, URLs, the api_key, or response bodies. Errors carry status + a short
// reason only.

import {
  resolveCredentials,
  accountBaseUrl,
  type InvoiceXpressCredentials,
} from "./config";
import {
  InvoiceXpressApiError,
  InvoiceXpressNetworkError,
} from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

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

export type InvoiceXpressClientOptions = {
  /** Defaults to the resolved env credentials. Injected explicitly in tests. */
  credentials?: InvoiceXpressCredentials;
  /** Defaults to global fetch. Injected in tests to avoid the network. */
  fetchImpl?: FetchLike;
};

export type RequestOptions = {
  method: HttpMethod;
  /** Path under the account host, e.g. "/invoice_receipts.json". */
  path: string;
  /** Query params (besides api_key). Values are NON-fiscal only. */
  query?: Record<string, string | number | undefined>;
  /** JSON body — where ALL fiscal data goes. */
  body?: unknown;
};

/**
 * Redact the api_key query param from any string before it could surface in an
 * error or log. Defense-in-depth: we also simply never pass URLs to loggers.
 */
function redactKey(s: string): string {
  return s.replace(/api_key=[^&\s]+/gi, "api_key=[redacted]");
}

export class InvoiceXpressClient {
  private readonly credentials: InvoiceXpressCredentials;
  private readonly fetchImpl: FetchLike;

  constructor(opts: InvoiceXpressClientOptions = {}) {
    // resolveCredentials() throws InvoiceXpressConfigError when unset — so an
    // unconfigured (owner-gated) environment fails here, before any fetch.
    this.credentials = opts.credentials ?? resolveCredentials();
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(accountBaseUrl(this.credentials.accountName) + path);
    // api_key in the query is how InvoiceXpress authenticates. It is the only
    // secret in the URL and is redacted from every error/log path.
    url.searchParams.set("api_key", this.credentials.apiKey);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  /**
   * Issue a request and parse the JSON response. Throws an InvoiceXpressError
   * subclass on transport failure or non-2xx. The returned value is the parsed
   * JSON typed by the caller.
   */
  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);

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
      // Transport-level: never includes the URL/key. Generic, retryable.
      const reason = err instanceof Error ? err.name : "unknown";
      throw new InvoiceXpressNetworkError(
        `InvoiceXpress request failed at transport layer (${reason})`,
      );
    }

    const rawText = await res.text();

    if (!res.ok) {
      // Status + method + path ONLY. We deliberately DROP the response body:
      // InvoiceXpress error payloads can echo the submitted fiscal data (NIF,
      // names), and CLAUDE.md #7 forbids fiscal data in error messages. The
      // path carries ids only, no fiscal data. Status drives retryability.
      throw new InvoiceXpressApiError(
        res.status,
        `InvoiceXpress ${opts.method} ${opts.path} → HTTP ${res.status}`,
      );
    }

    if (!rawText) return undefined as T;
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new InvoiceXpressApiError(
        res.status,
        `InvoiceXpress ${opts.method} ${opts.path} → 2xx but unparseable JSON`,
      );
    }
  }
}

export { redactKey as _redactKeyForTest };
