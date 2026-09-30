import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { deploymentIdOrNull } from "./build-id";
import { createDeploymentCheck, MIN_CHECK_INTERVAL_MS, type DeploymentCheckDeps } from "./deployment-check";

/**
 * SKEW-01 S6 - the build-id compare: throttled, quiet, held while a form is
 * open, never a loop, and silent when the version fetch fails.
 */

function harness(server: string | null | (() => Promise<string | null>), over: Partial<DeploymentCheckDeps> = {}) {
  const state = { clock: 0, marker: null as string | null };
  const reloadQuietly = vi.fn(() => true);
  const fetchServerBuildId = vi.fn(typeof server === "function" ? server : async () => server);
  const deps: DeploymentCheckDeps = {
    clientBuildId: "dpl_old",
    fetchServerBuildId,
    now: () => state.clock,
    reloadQuietly,
    readReloadMarker: () => state.marker,
    writeReloadMarker: (id) => {
      state.marker = id;
      return true;
    },
    ...over,
  };
  return { check: createDeploymentCheck(deps), state, reloadQuietly, fetchServerBuildId };
}

describe("createDeploymentCheck", () => {
  it("the same deployment on both sides: nothing happens", async () => {
    const h = harness("dpl_old");
    await h.check.check();
    expect(h.reloadQuietly).not.toHaveBeenCalled();
  });

  it("a newer deployment: reloads quietly, once", async () => {
    const h = harness("dpl_new");
    await h.check.check();
    expect(h.reloadQuietly).toHaveBeenCalledTimes(1);
    expect(h.state.marker).toBe("dpl_new");
  });

  it("a failed or unreadable version fetch does nothing visible", async () => {
    for (const server of [null, async () => null, () => Promise.reject(new TypeError("offline"))]) {
      const h = harness(server as never);
      await expect(h.check.check()).resolves.toBeUndefined();
      expect(h.reloadQuietly).not.toHaveBeenCalled();
    }
  });

  it("is THROTTLED to at most one check a minute", async () => {
    const h = harness("dpl_old");
    await h.check.check();
    await h.check.check();
    h.state.clock += MIN_CHECK_INTERVAL_MS - 1;
    await h.check.check();
    expect(h.fetchServerBuildId).toHaveBeenCalledTimes(1);
    h.state.clock += 1;
    await h.check.check();
    expect(h.fetchServerBuildId).toHaveBeenCalledTimes(2);
    expect(MIN_CHECK_INTERVAL_MS).toBe(60_000);
  });

  it("visibilitychange and focus arriving together make ONE request", async () => {
    let release!: (v: string) => void;
    const h = harness(() => new Promise<string>((resolve) => (release = resolve)));
    const a = h.check.check();
    const b = h.check.check();
    release("dpl_old");
    await Promise.all([a, b]);
    expect(h.fetchServerBuildId).toHaveBeenCalledTimes(1);
  });

  it("HELD while a form is open: the reload waits, then happens when the form closes", async () => {
    const h = harness("dpl_new");
    h.check.setHeld(true);
    await h.check.check();
    expect(h.reloadQuietly).not.toHaveBeenCalled();
    h.check.setHeld(true);
    expect(h.reloadQuietly).not.toHaveBeenCalled();
    h.check.setHeld(false);
    expect(h.reloadQuietly).toHaveBeenCalledTimes(1);
    h.check.setHeld(true);
    h.check.setHeld(false);
    expect(h.reloadQuietly).toHaveBeenCalledTimes(1);
  });

  it("closing a form with nothing pending reloads nothing", () => {
    const h = harness("dpl_new");
    h.check.setHeld(true);
    h.check.setHeld(false);
    expect(h.reloadQuietly).not.toHaveBeenCalled();
  });

  it("NO RELOAD LOOP: a page already reloaded once for this deployment stops instead of reloading again", async () => {
    const h = harness("dpl_new");
    h.state.marker = "dpl_new"; // the previous page life reloaded for it
    await h.check.check();
    h.state.clock += MIN_CHECK_INTERVAL_MS;
    await h.check.check();
    expect(h.reloadQuietly).not.toHaveBeenCalled();
    expect(h.fetchServerBuildId).toHaveBeenCalledTimes(1); // stopped for the page's life
  });

  it("a marker for an OLDER deployment does not block reloading for a newer one", async () => {
    const h = harness("dpl_newer");
    h.state.marker = "dpl_new";
    await h.check.check();
    expect(h.reloadQuietly).toHaveBeenCalledTimes(1);
  });

  it("when the marker cannot be stored, it does not reload at all (no guard, no reload)", async () => {
    const h = harness("dpl_new", { writeReloadMarker: () => false });
    await h.check.check();
    expect(h.reloadQuietly).not.toHaveBeenCalled();
    const t = harness("dpl_new", {
      writeReloadMarker: () => {
        throw new Error("SecurityError");
      },
    });
    await t.check.check();
    expect(t.reloadQuietly).not.toHaveBeenCalled();
  });
});

describe("deploymentIdOrNull: Next's own deployment id, and unknown means no check", () => {
  it("keeps a real id and turns every unknown shape into null", () => {
    expect(deploymentIdOrNull("dpl_CGDgSGBWKYvPTjhGGnjr8RuV8UgL")).toBe("dpl_CGDgSGBWKYvPTjhGGnjr8RuV8UgL");
    expect(deploymentIdOrNull(" dpl_1 ")).toBe("dpl_1");
    for (const v of [undefined, null, false, 0, "", "  ", "dev", "false", "undefined"]) {
      expect(deploymentIdOrNull(v), String(v)).toBeNull();
    }
  });

  it("an unknown client id never fetches and never reloads, whatever the server says", async () => {
    const h = harness("dpl_new", { clientBuildId: null });
    await h.check.check();
    h.state.clock += MIN_CHECK_INTERVAL_MS * 3;
    await h.check.check();
    h.check.setHeld(false);
    expect(h.fetchServerBuildId).not.toHaveBeenCalled();
    expect(h.reloadQuietly).not.toHaveBeenCalled();
  });

  const APP = join(__dirname, "..", "..");
  it("the page and the version route both read NEXT_DEPLOYMENT_ID; next.config.ts inlines no id of its own", () => {
    const config = readFileSync(join(APP, "next.config.ts"), "utf8");
    const route = readFileSync(join(APP, "app/api/version/route.ts"), "utf8");
    const hook = readFileSync(join(APP, "lib/deployment/use-deployment-check.ts"), "utf8");
    expect(route).toContain("deploymentIdOrNull(process.env.NEXT_DEPLOYMENT_ID)");
    expect(hook).toContain("clientBuildId: deploymentIdOrNull(process.env.NEXT_DEPLOYMENT_ID)");
    // An id inlined at build from a Vercel variable reads "dev" under turbo's
    // strict env mode while the server reads the real one: every tab reloads.
    expect(config).not.toMatch(/NEXT_PUBLIC_BUILD_ID|VERCEL_DEPLOYMENT_ID|VERCEL_GIT_COMMIT_SHA/);
    expect(route).toMatch(/export const dynamic = "force-dynamic"/);
    expect(route).toContain("no-store");
  });

  it("next.config.ts sets nothing that breaks Vercel Skew Protection (S7)", () => {
    const config = readFileSync(join(APP, "next.config.ts"), "utf8").replace(/\/\/.*$/gm, "");
    for (const key of ["deploymentId", "generateBuildId", "assetPrefix", "basePath", "rewrites", "tunnelRoute"]) {
      expect(config, `next.config.ts sets ${key}`).not.toMatch(new RegExp(`\\b${key}\\s*[:(]`));
    }
  });
});
