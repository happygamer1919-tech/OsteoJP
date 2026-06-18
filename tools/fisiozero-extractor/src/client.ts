// tools/fisiozero-extractor/src/client.ts
//
// HTTP seam for the extractor. The serial loop depends only on the
// `FisiozeroClient` interface, so it can be driven by a fake in tests; the
// Playwright implementation is the real one.
//
// AUTH: the Playwright client is built from an APIRequestContext loaded with a
// storageState JSON FILE PATH (FISIOZERO_STORAGE_STATE). Cookies (PHPSESSID,
// TOKEN) are loaded and sent by Playwright — this code never reads, copies, or
// logs cookie values. One context = one shared cookie jar; requests are issued
// serially by the loop, never concurrently, so the server's "current patient"
// session state stays coherent.
//
// A response that looks like the login screen means the session expired: we throw
// SessionExpiredError, which the loop treats as FATAL (stop, tell Ivan to
// recapture). Transient network/5xx failures are retried with backoff; they never
// silently drop a patient.

import { request as pwRequest, type APIRequestContext } from "playwright";
import { looksLikeLogin } from "./html";
import { backoffDelay, sleep } from "./util";

export type TextResponse = { status: number; url: string; body: string };
export type BinaryResponse = { status: number; url: string; bytes: Buffer; contentType: string | null };

export interface FisiozeroClient {
  getText(url: string): Promise<TextResponse>;
  getBinary(url: string): Promise<BinaryResponse>;
  close(): Promise<void>;
}

/** Fatal: the session is no longer valid. Never retried. Carries no cookie data. */
export class SessionExpiredError extends Error {
  constructor(public readonly attemptedUrl: string) {
    super("Fisiozero session expired or invalid: a request was redirected to the login screen.");
    this.name = "SessionExpiredError";
  }
}

/** Retryable transport failure after all retries were exhausted. PII-free. */
export class TransientRequestError extends Error {
  constructor(public readonly attemptedUrl: string, public readonly lastStatus?: number) {
    super(`Request failed after retries (status=${lastStatus ?? "network-error"}).`);
    this.name = "TransientRequestError";
  }
}

export type PlaywrightClientOptions = {
  storageStatePath: string;
  baseUrl: string;
  retries: number;
  backoffBaseMs: number;
  requestTimeoutMs: number;
  /** Optional override of login-detection markers (defaults in html.ts). */
  loginUrlMarkers?: readonly string[];
  loginBodyMarkers?: readonly string[];
};

/** True if the HTTP status warrants a retry (server/transport hiccup). */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export class PlaywrightFisiozeroClient implements FisiozeroClient {
  private ctx: APIRequestContext | null = null;

  constructor(private readonly opts: PlaywrightClientOptions) {}

  private async context(): Promise<APIRequestContext> {
    if (!this.ctx) {
      this.ctx = await pwRequest.newContext({
        storageState: this.opts.storageStatePath,
        baseURL: this.opts.baseUrl,
        timeout: this.opts.requestTimeoutMs,
        // We inspect redirects ourselves via the final URL; Playwright follows
        // them by default, so a login bounce surfaces as the final response.
      });
    }
    return this.ctx;
  }

  /** One GET with retry/backoff. Returns the raw Playwright response or throws. */
  private async fetch(url: string): Promise<{ status: number; finalUrl: string; buffer: Buffer; contentType: string | null }> {
    const ctx = await this.context();
    let lastStatus: number | undefined;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      try {
        const res = await ctx.get(url);
        const status = res.status();
        lastStatus = status;
        if (isRetryableStatus(status) && attempt < this.opts.retries) {
          await sleep(backoffDelay(attempt, this.opts.backoffBaseMs));
          continue;
        }
        const buffer = await res.body();
        const headers = res.headers();
        return { status, finalUrl: res.url(), buffer, contentType: headers["content-type"] ?? null };
      } catch (err) {
        // Network-level failure (timeout, reset). Retry, then give up.
        if (attempt < this.opts.retries) {
          await sleep(backoffDelay(attempt, this.opts.backoffBaseMs));
          continue;
        }
        throw new TransientRequestError(url, lastStatus);
      }
    }
    throw new TransientRequestError(url, lastStatus);
  }

  async getText(url: string): Promise<TextResponse> {
    const { status, finalUrl, buffer } = await this.fetch(url);
    const body = buffer.toString("utf8");
    if (looksLikeLogin(finalUrl, body, this.opts.loginUrlMarkers, this.opts.loginBodyMarkers)) {
      throw new SessionExpiredError(url);
    }
    return { status, url: finalUrl, body };
  }

  async getBinary(url: string): Promise<BinaryResponse> {
    const { status, finalUrl, buffer, contentType } = await this.fetch(url);
    // A binary endpoint that returns an HTML login page is also an expired session.
    if ((contentType ?? "").includes("text/html")) {
      const body = buffer.toString("utf8");
      if (looksLikeLogin(finalUrl, body, this.opts.loginUrlMarkers, this.opts.loginBodyMarkers)) {
        throw new SessionExpiredError(url);
      }
    }
    return { status, url: finalUrl, bytes: buffer, contentType };
  }

  async close(): Promise<void> {
    if (this.ctx) {
      await this.ctx.dispose();
      this.ctx = null;
    }
  }
}
