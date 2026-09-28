/**
 * SKEW-01 S6 - WHICH DEPLOYMENT IS THIS: NEXT'S OWN DEPLOYMENT ID, ON BOTH SIDES.
 *
 * Both sides read `process.env.NEXT_DEPLOYMENT_ID`, the id Vercel Skew
 * Protection routes on, and nothing the build has to be told about:
 *   - CLIENT: Turbopack rewrites `process.env.NEXT_DEPLOYMENT_ID` in client code
 *     to the id the page was served with (`globalThis.NEXT_DEPLOYMENT_ID`, read
 *     from the `data-dpl-id` Next puts on <html>), or to `false` when the build
 *     had no deployment id (next/dist/build/define-env.js:89-95;
 *     next/dist/shared/lib/deployment-id.js:31-41).
 *   - SERVER: the route answers this deployment's own id either way.
 *     On a Vercel build that has NEXT_DEPLOYMENT_ID, Next turns on
 *     `experimental.runtimeServerDeploymentId` (next/dist/server/config.js:
 *     709-717), does NOT inline the variable into server bundles, and requires
 *     it at runtime (next/dist/server/base-server.js:318-324), so the route
 *     reads it per request. Anywhere else (a local `next build`, `next dev`)
 *     the server read is inlined at build as `config.deploymentId || false`
 *     (next/dist/build/define-env.js:100-101): false locally, which is null here.
 * Measured on production 2026-09-27: app.osteojp.pt/login carries
 * data-dpl-id="dpl_..." and every static asset URL carries ?dpl=, so the id
 * reaches both.
 *
 * WHY NOT A VARIABLE INLINED AT BUILD. The production build runs through
 * `turbo run build` in strict env mode, which hides every variable turbo.json
 * does not declare from the build (the Vercel log lists them). An id inlined
 * from such a variable reads "dev" in the page while the server reads the real
 * one, and every tab would reload for nothing.
 *
 * UNKNOWN MEANS NO CHECK. Anything that is not a non-empty string (undefined,
 * `false`, "", "dev", "false") is null, and a null id on either side never
 * compares and never reloads.
 *
 * NOT `deploymentId` and NOT `generateBuildId` in next.config: Next throws E971
 * on a Vercel build when a custom deploymentId disagrees with the platform's
 * (next/dist/server/config.js:709-716).
 */
export function deploymentIdOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (id === "" || id === "dev" || id === "false" || id === "undefined") return null;
  return id;
}
