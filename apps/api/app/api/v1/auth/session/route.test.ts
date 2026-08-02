import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the patient gate so the route test never touches Supabase / next/headers
// (and never loads its "server-only" import). vi.hoisted lets the hoisted
// vi.mock factory reference the spy safely.
const { getPatientPrincipal } = vi.hoisted(() => ({ getPatientPrincipal: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ getPatientPrincipal }));

import { GET } from "./route";
import { RULES } from "@/lib/rate-limit/limiter";

beforeEach(() => getPatientPrincipal.mockReset());

// The route's limiter keys on the client IP and the store is process-wide, so
// every test uses its OWN IP. Otherwise one test's hits would spend another's
// budget and the suite would fail depending on execution order.
let ipCounter = 0;
const req = () =>
  new Request("https://api.osteojp.pt/api/v1/auth/session", {
    headers: { "x-forwarded-for": `198.51.100.${++ipCounter}` },
  });

describe("GET /api/v1/auth/session", () => {
  it("401s when there is no patient principal (fail-closed)", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns ONLY the caller's own ids when authenticated", async () => {
    getPatientPrincipal.mockResolvedValue({
      tenantId: "t-1",
      patientId: "p-1",
      userId: "u-1",
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    // userId (auth sub) is deliberately NOT echoed — only self identity.
    await expect(res.json()).resolves.toEqual({ patientId: "p-1", tenantId: "t-1" });
  });
});

describe("rate limiting (SEC-04)", () => {
  it("429s past the configured threshold, from ONE client", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const ip = "203.0.113.42";
    const one = () =>
      GET(
        new Request("https://api.osteojp.pt/api/v1/auth/session", {
          headers: { "x-forwarded-for": ip },
        }),
      );

    for (let i = 0; i < RULES.authSession.limit; i++) {
      expect((await one()).status).toBe(401); // permitted, just unauthenticated
    }

    const limited = await one();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });

  it("limits BEFORE authenticating, so an anonymous flood is cheap to refuse", async () => {
    // The gate must not be consulted once the budget is spent: verifying a
    // signature for an attacker is work we decline to do.
    getPatientPrincipal.mockResolvedValue(null);
    const ip = "203.0.113.43";
    const one = () =>
      GET(
        new Request("https://api.osteojp.pt/api/v1/auth/session", {
          headers: { "x-forwarded-for": ip },
        }),
      );

    for (let i = 0; i < RULES.authSession.limit; i++) await one();
    getPatientPrincipal.mockClear();

    expect((await one()).status).toBe(429);
    expect(getPatientPrincipal).not.toHaveBeenCalled();
  });

  it("one client's flood does not lock out a different client", async () => {
    getPatientPrincipal.mockResolvedValue(null);
    const flood = (ip: string) =>
      GET(
        new Request("https://api.osteojp.pt/api/v1/auth/session", {
          headers: { "x-forwarded-for": ip },
        }),
      );

    for (let i = 0; i <= RULES.authSession.limit; i++) await flood("203.0.113.44");
    expect((await flood("203.0.113.44")).status).toBe(429);
    expect((await flood("203.0.113.45")).status).toBe(401);
  });
});
