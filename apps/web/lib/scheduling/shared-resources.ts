import "server-only";
import { sql } from "drizzle-orm";
import { sharedResourceSchemaPresent, type DbTx } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import type { SharedResource } from "./shared-resource-guard";

/**
 * SCHED-17 - the tenant's shared resources (users.is_shared_resource) and where
 * each is installed (staff_locations). EMPTY until the pending NESA migration is
 * applied: the column does not exist before then, and sharedResourceSchemaPresent
 * is what keeps this query from ever naming it early.
 *
 * Read under the caller's own RLS context. `users` and `staff_locations` are
 * both tenant-isolated and readable by every staff role in the tenant, so the
 * answer is the same for every viewer; what each viewer may DO with a resource
 * is sharedResourceLocationAllowed's question, not this one's.
 */
export async function listSharedResourcesTx(tx: DbTx): Promise<SharedResource[]> {
  if (!(await sharedResourceSchemaPresent(tx))) return [];
  const rows = (await tx.execute(sql`
    select u.id::text as id,
           u.full_name as label,
           coalesce(
             array_agg(sl.location_id::text) filter (where sl.location_id is not null),
             '{}'::text[]
           ) as location_ids
      from public.users u
      left join public.staff_locations sl
        on sl.user_id = u.id and sl.tenant_id = u.tenant_id
     where u.is_shared_resource
       and u.is_active
     group by u.id, u.full_name
     order by u.full_name
  `)) as unknown as ReadonlyArray<{ id: string; label: string; location_ids: string[] }>;
  return rows.map((r) => ({ id: r.id, label: r.label, locationIds: [...r.location_ids] }));
}

export async function listSharedResources(ctx: RequestContext): Promise<SharedResource[]> {
  return runScoped(ctx, (tx) => listSharedResourcesTx(tx));
}
