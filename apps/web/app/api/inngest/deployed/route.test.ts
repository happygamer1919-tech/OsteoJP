/**
 * R6: /api/inngest/deployed tells the auto-sync workflow which commit is live and
 * how many functions /api/inngest serves. The count must be the length of the
 * very list the serve route registers, and the commit must come from the
 * platform's variable, never a cached or invented value.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { servedFunctions } from "@/lib/reminders/inngest/served";
import { GET, dynamic } from "./route";

describe("/api/inngest/deployed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers the deployed commit and the served function count, uncached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    const res = GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await res.json()).toEqual({
      commit: "0123456789abcdef0123456789abcdef01234567",
      functionCount: servedFunctions.length,
    });
    expect(dynamic).toBe("force-dynamic");
  });

  it("answers null for the commit where the platform sets none (local)", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined as unknown as string);
    expect((await GET().json()).commit).toBeNull();
  });

  it("counts the list the serve route registers, not a copy of it", () => {
    const route = readFileSync(join(__dirname, "..", "route.ts"), "utf8");
    expect(route).toMatch(/functions:\s*servedFunctions,/);
    expect(servedFunctions.length).toBeGreaterThan(0);
  });
});
