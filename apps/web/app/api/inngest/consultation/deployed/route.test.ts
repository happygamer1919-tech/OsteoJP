/**
 * R27: /api/inngest/consultation/deployed tells the auto-sync workflow which
 * commit is live, which Inngest app the consultation serve route belongs to, and
 * how many functions it serves. The count must be the length of the very list
 * the serve route registers, the app must be the id of the client it serves
 * with, and the commit must come from the platform's variable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { functions } from "@/lib/consultation/inngest/functions";
import { GET, dynamic } from "./route";

describe("/api/inngest/consultation/deployed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers the app, the deployed commit and the served function count, uncached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    const res = GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await res.json()).toEqual({
      app: "osteojp-consultation",
      commit: "0123456789abcdef0123456789abcdef01234567",
      functionCount: functions.length,
    });
    expect(functions.length).toBe(1);
    expect(dynamic).toBe("force-dynamic");
  });

  it("answers null for the commit where the platform sets none (local)", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined as unknown as string);
    expect((await GET().json()).commit).toBeNull();
  });

  it("counts the list and names the client the serve route registers, not copies of them", () => {
    const route = readFileSync(join(__dirname, "..", "route.ts"), "utf8");
    expect(route).toMatch(/import \{ inngest \} from "@\/lib\/consultation\/inngest\/client";/);
    expect(route).toMatch(/import \{ functions \} from "@\/lib\/consultation\/inngest\/functions";/);
    expect(route).toMatch(/serve\(\{\s*client: inngest,\s*functions,\s*\}\)/);
    const self = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(self).toMatch(/import \{ inngest \} from "@\/lib\/consultation\/inngest\/client";/);
    expect(self).toMatch(/import \{ functions \} from "@\/lib\/consultation\/inngest\/functions";/);
  });
});
