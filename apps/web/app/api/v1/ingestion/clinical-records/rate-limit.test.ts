import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-web-surface-limiter-adoption, route 3: the AI partner ingestion endpoint.
 *
 * ==========================================================================
 * WHAT CAN GO WRONG HERE IS THE ORDER, AND IT IS NOT THE SAME ORDER AS ROUTE 2
 * ==========================================================================
 * On the IfThenPay callback the limit had to sit above the KEY COMPARISON,
 * because the budget being spent there is a guess budget. Nothing about this
 * gate is guessable - it is an HMAC over the body - so the only thing a limit
 * buys is COST, and the expensive half is `await req.text()` reading an
 * ARBITRARY-SIZE BODY into memory before any authentication happens.
 *
 * So the assertion that matters is that the limiter sits above THE BODY READ,
 * not merely above the signature check. A limiter placed between the two would
 * look correct in a diff and would leave the expensive half unbounded.
 */

const seq: string[] = [];

const checkRateLimit = vi.fn<(key: string, rule: { limit: number }) => {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}>();
const verifyIngestionSignature = vi.fn();
const ingest = vi.fn();

vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return { ...real, checkRateLimit };
});
vi.mock("@/lib/ingestion/hmac", () => ({ verifyIngestionSignature }));
vi.mock("@/lib/ingestion/ingest", () => ({
  ingest,
  parseEnvelope: (v: unknown) => v,
  hashPayload: () => "hash",
}));
vi.mock("@/lib/ingestion/store", () => ({ drizzleIngestionStore: {} }));

/**
 * A Request whose body read is OBSERVABLE. `req.text()` is replaced by a spy
 * that records into the shared sequence, which is the only way to prove the
 * limiter sits above it rather than below.
 */
const request = (ip = "203.0.113.7") => {
  const req = new Request("https://app.osteojp.pt/api/v1/ingestion/clinical-records", {
    method: "POST",
    body: JSON.stringify({ idempotency_key: "k", patient: {}, payload: {} }),
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
  });
  const body = JSON.stringify({ idempotency_key: "k", patient: {}, payload: {} });
  Object.defineProperty(req, "text", {
    value: async () => {
      seq.push("read-body");
      return body;
    },
  });
  return req;
};

const verdict = (ok: boolean) => {
  checkRateLimit.mockImplementation(() => {
    seq.push("limiter");
    return { ok, limit: 120, remaining: ok ? 119 : 0, retryAfterSeconds: 60 };
  });
};

describe("the AI ingestion endpoint is rate limited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seq.length = 0;
    verifyIngestionSignature.mockImplementation(() => {
      seq.push("verify");
      return { ok: true };
    });
    ingest.mockImplementation(async () => {
      seq.push("ingest");
      return { kind: "created", requestId: "r", status: "accepted", clinicalRecordId: "c" };
    });
  });

  it("limits ABOVE the body read, not merely above the signature check", async () => {
    // The expensive half is the arbitrary-size body read. A limiter between the
    // read and the verify would look right in a diff and bound nothing.
    const { POST } = await import("./route");
    verdict(true);
    await POST(request());
    expect(seq).toEqual(["limiter", "read-body", "verify", "ingest"]);
  });

  it("over the limit, the body is NEVER read", async () => {
    const { POST } = await import("./route");
    verdict(false);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(seq).toEqual(["limiter"]);
    expect(verifyIngestionSignature).not.toHaveBeenCalled();
  });

  it("keys per source, so one caller cannot exhaust another's budget", async () => {
    const { POST } = await import("./route");
    verdict(true);
    await POST(request("203.0.113.7"));
    const first = String(checkRateLimit.mock.calls[0][0]);
    vi.clearAllMocks();
    seq.length = 0;
    verdict(true);
    await POST(request("198.51.100.4"));
    expect(String(checkRateLimit.mock.calls[0][0])).not.toBe(first);
    expect(first).toContain("ingestion:ip:");
  });

  it("uses the SYNCHRONOUS memory store, never the durable one", async () => {
    // A Postgres upsert in front of a microsecond HMAC costs more than the
    // thing it protects. Source guard, and it is labelled as one: it proves the
    // durable store is not wired in, not that the memory store counts.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("createDurableRateLimitStore");
    expect(code).not.toContain("checkDurableRateLimit");
    expect(code).toContain("checkRateLimit");
  });

  it("lets a legitimate signed request through untouched", async () => {
    // Positive control. Every assertion above is "this did NOT happen", and a
    // suite of only those passes over a handler that refuses everything.
    const { POST } = await import("./route");
    verdict(true);
    const res = await POST(request());
    expect(res.status).toBe(201);
    expect(ingest).toHaveBeenCalledTimes(1);
  });
});
