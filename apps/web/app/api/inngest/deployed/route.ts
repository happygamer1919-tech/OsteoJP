import { servedFunctions } from "@/lib/reminders/inngest/served";

/**
 * R6: WHICH COMMIT THIS DEPLOYMENT RUNS, AND HOW MANY FUNCTIONS IT SERVES.
 *
 * Read by the auto-sync workflow (.github/workflows/inngest-auto-sync.yml), which
 * waits until app.osteojp.pt answers with the commit Vercel just deployed, then
 * syncs the osteojp-reminders app with a PUT on /api/inngest, then checks that
 * `functionCount` equals the count read from the code at that commit.
 *
 * WHY A ROUTE OF ITS OWN. Nothing else tells an outside caller which commit is
 * live: /api/version answers Next's deployment id and sits behind the session
 * proxy, and the Inngest SDK answers an unsigned GET on /api/inngest with 401 in
 * cloud mode, so its `function_count` cannot be read without the signing key.
 *
 * PUBLIC ON PURPOSE, and it says nothing that is not public already: the
 * repository is public, so a commit id and a count of functions give nothing
 * away. It sits under /api/inngest, which the proxy matcher already leaves out of
 * the session check (apps/web/proxy.ts). It reads no database and no secret.
 *
 * force-dynamic and no-store: a cached answer would name the previous commit and
 * the workflow would wait on it, or worse, sync against it.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      functionCount: servedFunctions.length,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
