import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// METHOD PARITY between the portal client and the API routes.
//
// Why this exists. cancelAppointment sent PATCH to a route that exports only
// POST. Next.js answers 405 for an unexported method, so every patient who
// confirmed the cancel dialog got a failure. Nothing caught it: the client
// compiles, the route compiles, and no test crossed the boundary between them.
//
// This crosses it. For every fetch in the portal client it resolves the API
// route file and asserts the route actually exports the method being sent. A
// mismatch fails here instead of in front of a patient.
//
// It is a STATIC check by design. Exercising it for real needs both apps
// running, which is the E2E suite's job; the defect class here is "these two
// files disagree", and reading both files catches that in milliseconds.

const CLIENT = join(__dirname, "client.ts");
const API_APP = join(__dirname, "..", "..", "..", "api", "app");

type Call = { path: string; method: string; line: number };

/**
 * Extract every `fetch(...)` in the client with the HTTP method it sends.
 *
 * A fetch with no `method` is a GET, which is the fetch default - modelling
 * that explicitly matters, because a GET route that lost its handler would
 * otherwise pass silently.
 */
function clientCalls(src: string): Call[] {
  const calls: Call[] = [];
  const lines = src.split("\n");

  // `${apiBase()}/api/v1/...` — capture the path after apiBase().
  const re = /fetch\(\s*`\$\{apiBase\(\)\}(\/api\/[^`]*)`\s*,?\s*(\{[\s\S]{0,300}?\})?/g;

  for (const m of src.matchAll(re)) {
    const rawPath = m[1]!;
    const opts = m[2] ?? "";
    const method = /method:\s*'([A-Z]+)'/.exec(opts)?.[1] ?? "GET";
    const line = src.slice(0, m.index).split("\n").length;
    calls.push({ path: rawPath, method, line });
  }

  // Guard against the regex silently matching nothing after a refactor.
  expect(lines.length).toBeGreaterThan(50);
  return calls;
}

/**
 * Map a client URL to its route file.
 *   /api/v1/appointments/${id}/cancel  ->  app/api/v1/appointments/[id]/cancel/route.ts
 * Query strings are stripped; interpolations become dynamic segments.
 */
function routeFileFor(urlPath: string): string {
  const clean = urlPath.split("?")[0]!;
  const segments = clean
    .split("/")
    .filter(Boolean)
    .map((s) => (s.includes("${") ? "[id]" : s));
  return join(API_APP, ...segments, "route.ts");
}

function exportedMethods(routeSrc: string): string[] {
  return [
    ...routeSrc.matchAll(/^export async function (GET|POST|PATCH|PUT|DELETE)\b/gm),
  ].map((m) => m[1]!);
}

describe("portal client / API route method parity", () => {
  const src = readFileSync(CLIENT, "utf-8");
  const calls = clientCalls(src);

  it("guards against a vacuous pass: calls were actually extracted", () => {
    // If the regex stops matching, every assertion below passes trivially.
    expect(calls.length).toBeGreaterThan(5);
    expect(calls.some((c) => c.path.includes("/cancel"))).toBe(true);
  });

  it("every route the client calls exists", () => {
    const missing = calls
      .filter((c) => !existsSync(routeFileFor(c.path)))
      .map((c) => `client.ts:${c.line} -> ${c.path}`);

    expect(
      missing,
      missing.length ? `Portal calls a route that does not exist:\n  ${missing.join("\n  ")}` : undefined,
    ).toEqual([]);
  });

  it("every route EXPORTS the method the client sends", () => {
    const mismatches: string[] = [];

    for (const call of calls) {
      const file = routeFileFor(call.path);
      if (!existsSync(file)) continue; // reported by the test above
      const methods = exportedMethods(readFileSync(file, "utf-8"));
      if (!methods.includes(call.method)) {
        mismatches.push(
          `client.ts:${call.line} sends ${call.method} to ${call.path}, ` +
            `but the route exports [${methods.join(", ") || "nothing"}] -> 405`,
        );
      }
    }

    expect(
      mismatches,
      mismatches.length
        ? `Method mismatch between portal and API. Next.js answers 405, so this ` +
            `fails in front of a patient:\n  ${mismatches.join("\n  ")}`
        : undefined,
    ).toEqual([]);
  });

  it("pins the cancel pair explicitly (the regression that caused this file)", () => {
    const cancel = calls.find((c) => c.path.endsWith("/cancel"));
    expect(cancel, "the cancel call disappeared from the client").toBeDefined();
    expect(cancel!.method).toBe("POST");

    const methods = exportedMethods(readFileSync(routeFileFor(cancel!.path), "utf-8"));
    expect(methods).toContain("POST");
  });
});
