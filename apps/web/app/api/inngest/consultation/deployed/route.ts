import { inngest } from "@/lib/consultation/inngest/client";
import { functions } from "@/lib/consultation/inngest/functions";

/**
 * R27: WHICH COMMIT THIS DEPLOYMENT RUNS, WHICH INNGEST APP /api/inngest/consultation
 * SERVES, AND HOW MANY FUNCTIONS IT SERVES.
 *
 * The consultation twin of /api/inngest/deployed (R6, #1659). The auto-sync
 * workflow (.github/workflows/inngest-auto-sync.yml) reads it BEFORE it syncs
 * the osteojp-consultation app with a PUT on /api/inngest/consultation, and
 * again after, and compares `functionCount` with the count
 * scripts/inngest-expected-functions.mjs reads from the code at the deployed
 * commit (`--app osteojp-consultation`).
 *
 * `functionCount` is the length of the very array the serve route hands to
 * serve() (`functions`, from lib/consultation/inngest/functions.ts), and `app` is
 * the id of the very client it serves with, so neither can drift from what a
 * sync registers.
 *
 * PUBLIC ON PURPOSE, and it says nothing that is not public already: the
 * repository is public. It sits under /api/inngest, which the proxy matcher
 * leaves out of the session check (apps/web/proxy.ts). It reads no database and
 * no secret.
 *
 * force-dynamic and no-store: a cached answer would name the previous commit.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      app: inngest.id,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      functionCount: functions.length,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
