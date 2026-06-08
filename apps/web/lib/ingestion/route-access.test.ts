import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/proxy";
import { signIngestionBody } from "@/lib/ingestion/hmac";

// Access-control coverage for the AI ingestion endpoint (Stream D), split in two:
//
//   1. proxy.ts matcher  — the route is EXCLUDED from the Supabase session proxy
//      so an unauthenticated, HMAC-signed server call reaches the handler instead
//      of being redirected to /login. Narrowness is guarded: other /api/v1 routes
//      stay session-gated.
//   2. route handler     — with NO session (the handler never reads one), a
//      bad/missing HMAC still 401s, and a valid signature gets PAST the gate.
//
// Lives under lib/ (not next to proxy.ts / the route) because vitest only collects
// lib/**/*.test.ts. The store is mocked so this stays a pure node test — the real
// store.ts imports "server-only" + the DB, which the node runner cannot load.

// ---------------------------------------------------------------------------
// 1. Middleware matcher — the route is excluded; everything else stays gated.
// ---------------------------------------------------------------------------
describe("proxy matcher excludes the ingestion endpoint only", () => {
  // The matcher entry is a regex string Next evaluates against the pathname.
  // Anchoring it the same way reproduces Next's match decision: a pathname that
  // MATCHES runs the session proxy; one that does NOT is left alone.
  const matcher = config.matcher[0];
  const re = new RegExp(`^${matcher}$`);
  const runsSessionProxy = (pathname: string) => re.test(pathname);

  it("does NOT run the session proxy on the ingestion path (so it reaches the handler)", () => {
    expect(runsSessionProxy("/api/v1/ingestion/clinical-records")).toBe(false);
    expect(runsSessionProxy("/api/v1/ingestion")).toBe(false);
  });

  it("still excludes the existing /api/inngest endpoint (unchanged)", () => {
    expect(runsSessionProxy("/api/inngest")).toBe(false);
    expect(runsSessionProxy("/api/inngest/x")).toBe(false);
  });

  it("keeps every OTHER route session-gated — including the rest of /api/v1", () => {
    // Regression guard: the exclusion is scoped to /api/v1/ingestion, not /api/v1.
    expect(runsSessionProxy("/api/v1/patients")).toBe(true);
    expect(runsSessionProxy("/patients")).toBe(true);
    expect(runsSessionProxy("/dashboard")).toBe(true);
    expect(runsSessionProxy("/")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Route handler — HMAC is the only gate, with no session in play.
// ---------------------------------------------------------------------------

// Mock the persistence seam so the route's static import chain never loads
// store.ts ("server-only" + DB). vi.hoisted lets the factory reference the spy.
const { resolvePatientTenant } = vi.hoisted(() => ({ resolvePatientTenant: vi.fn() }));
vi.mock("@/lib/ingestion/store", () => ({
  drizzleIngestionStore: {
    resolvePatientTenant,
    findRequest: vi.fn(),
    createDraftWithRequest: vi.fn(),
  },
}));

// Imported AFTER the mock is registered (vi.mock is hoisted above imports).
import { POST } from "@/app/api/v1/ingestion/clinical-records/route";

const SECRET = "test-only-ingestion-secret-not-andrei";
const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const ENDPOINT = "https://app.osteojp.pt/api/v1/ingestion/clinical-records";

function validBody(): string {
  return JSON.stringify({
    idempotency_key: "idem-1",
    request_id: "partner-req-1",
    patient_id: PATIENT_ID,
    payload: { note: "shoulder pain" },
  });
}

function signedRequest(rawBody: string): Request {
  const ts = Math.floor(Date.now() / 1000);
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-osteojp-timestamp": String(ts),
      "x-osteojp-signature": signIngestionBody(rawBody, ts, SECRET),
    },
    body: rawBody,
  });
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.AI_INGESTION_HMAC_SECRET;
  process.env.AI_INGESTION_HMAC_SECRET = SECRET;
  resolvePatientTenant.mockReset();
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.AI_INGESTION_HMAC_SECRET;
  else process.env.AI_INGESTION_HMAC_SECRET = savedSecret;
});

describe("ingestion route handler — HMAC is the only gate (no session)", () => {
  it("401s when the signature headers are missing (no session, no signature)", async () => {
    const res = await POST(
      new Request(ENDPOINT, { method: "POST", body: validBody() }),
    );
    expect(res.status).toBe(401);
    expect(resolvePatientTenant).not.toHaveBeenCalled(); // rejected before the handler logic
  });

  it("401s when the signature is wrong", async () => {
    const rawBody = validBody();
    const res = await POST(
      new Request(ENDPOINT, {
        method: "POST",
        headers: {
          "x-osteojp-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-osteojp-signature": "deadbeef",
        },
        body: rawBody,
      }),
    );
    expect(res.status).toBe(401);
    expect(resolvePatientTenant).not.toHaveBeenCalled();
  });

  it("lets a VALID signature past the gate into the handler", async () => {
    // Stub resolution to 'unknown patient' so we get a deterministic 422 — the
    // point is that we reached the handler (not 401), proving the bypass works.
    resolvePatientTenant.mockResolvedValue(null);
    const rawBody = validBody();
    const res = await POST(signedRequest(rawBody));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(422);
    expect(resolvePatientTenant).toHaveBeenCalledWith(PATIENT_ID);
  });
});
