import { deploymentIdOrNull } from "@/lib/deployment/build-id";

/**
 * SKEW-01 S6 - the deployment serving this request, read at REQUEST time.
 *
 * Next's own deployment id, NEXT_DEPLOYMENT_ID, read at request time; the page
 * compares it with the id it was served with (lib/deployment/build-id.ts). null
 * when this server has none (local dev), and the page then never reloads. A plain
 * fetch from app code carries no x-deployment-id header, so Vercel Skew
 * Protection routes it to the CURRENT deployment, which is the one to compare
 * against.
 *
 * force-dynamic and no-store: a cached answer would be the old deployment's id
 * and would hide exactly the mismatch this exists to find. It stays behind the
 * session proxy like every other /api route (proxy.ts matcher); it is only ever
 * called from a signed-in page, and a failed or redirected fetch is ignored by
 * the caller.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { buildId: deploymentIdOrNull(process.env.NEXT_DEPLOYMENT_ID) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
