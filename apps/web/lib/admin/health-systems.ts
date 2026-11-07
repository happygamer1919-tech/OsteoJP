import "server-only";
import { assertCan } from "@osteojp/auth";
import { healthSystems, tenants, type DbTx } from "@osteojp/db";
import { asc, eq } from "drizzle-orm";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import {
  healthSystemNameKey,
  healthSystemNameProblem,
  healthSystemOptionsFor,
  normalizeHealthSystemName,
  readPriceTableEnabled,
  withPriceTableEnabled,
  type HealthSystemOption,
} from "./health-systems-core";

/**
 * Sistemas / SubSistemas (Fisiozero's panel, owner request 2026-11-02).
 *
 * A LABEL ONLY. Nothing here prices, discounts, computes a comparticipação or
 * touches an invoice, and the switch "Usa tabela de preços de Sistemas" is
 * stored and read by nothing else.
 *
 * WHO: the list and the switch are tenant settings, so writing them takes
 * `settings:manage` (owner and admin), the same line the database draws (the
 * INSERT and UPDATE policies of health_systems admit owner and admin only).
 * Reading the list for the patient form takes `patients:read`, which every staff
 * role holds, as the SELECT policy admits every staff role.
 *
 * Every write is audited in its own transaction, field names and ids only.
 */

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  let cursor: unknown = err;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof cursor !== "object" || cursor === null) return false;
    const layer = cursor as { code?: unknown; cause?: unknown };
    if (typeof layer.code === "string") return layer.code === PG_UNIQUE_VIOLATION;
    cursor = layer.cause;
  }
  return false;
}

/** Every Sistema of the tenant, active and switched off, for the settings panel. */
export async function listHealthSystems(actor: RequestContext): Promise<HealthSystemOption[]> {
  assertCan(actor.role, "settings:read");
  return runScoped(actor, (tx) =>
    tx
      .select({ id: healthSystems.id, name: healthSystems.name, active: healthSystems.active })
      .from(healthSystems)
      .orderBy(asc(healthSystems.name)),
  );
}

/** The patient form's dropdown: active entries, plus the patient's current one if switched off. */
export async function listHealthSystemOptions(
  actor: RequestContext,
  currentId: string | null = null,
): Promise<HealthSystemOption[]> {
  assertCan(actor.role, "patients:read");
  const all = await runScoped(actor, (tx) =>
    tx
      .select({ id: healthSystems.id, name: healthSystems.name, active: healthSystems.active })
      .from(healthSystems),
  );
  return healthSystemOptionsFor(all, currentId);
}

/**
 * Add a Sistema. The name is normalized first. When the clinic already has the
 * same name (case, whitespace and accents aside): an active one is refused (`name_taken`),
 * a switched-off one is switched back on, and nothing new is inserted.
 */
export async function createHealthSystem(
  actor: RequestContext,
  rawName: string,
): Promise<"created" | "reactivated"> {
  assertCan(actor.role, "settings:manage");
  const problem = healthSystemNameProblem(rawName);
  if (problem) throw new AdminError("invalid", `health system name is ${problem}`);
  const name = normalizeHealthSystemName(rawName);
  const key = healthSystemNameKey(name);

  try {
    return await runScoped(actor, async (tx) => {
      const existing = await tx
        .select({ id: healthSystems.id, name: healthSystems.name, active: healthSystems.active })
        .from(healthSystems);
      const same = existing.find((r) => healthSystemNameKey(r.name) === key);
      if (same) {
        if (same.active) throw new AdminError("name_taken");
        await tx.update(healthSystems).set({ active: true }).where(eq(healthSystems.id, same.id));
        await writeAudit(tx, actor, {
          action: "health_system.restore",
          entityType: "health_system",
          entityId: same.id,
        });
        return "reactivated";
      }
      const [row] = await tx
        .insert(healthSystems)
        // tenant_id and created_by are checked by the INSERT policy against the
        // JWT: the row must be of the caller's tenant and name the caller.
        .values({ tenantId: actor.tenantId, name, createdBy: actor.userId })
        .returning({ id: healthSystems.id });
      await writeAudit(tx, actor, {
        action: "health_system.create",
        entityType: "health_system",
        entityId: row?.id ?? null,
      });
      return "created";
    });
  } catch (err) {
    // Two saves of the same name at once: the unique index decides.
    if (isUniqueViolation(err)) throw new AdminError("name_taken");
    throw err;
  }
}

/** Switch a Sistema off or back on. Never deleted: a ficha that names it keeps its label. */
export async function setHealthSystemActive(
  actor: RequestContext,
  id: string,
  active: boolean,
): Promise<void> {
  assertCan(actor.role, "settings:manage");
  await runScoped(actor, async (tx) => {
    const [current] = await tx
      .select({ active: healthSystems.active })
      .from(healthSystems)
      .where(eq(healthSystems.id, id))
      .for("update");
    if (!current) throw new AdminError("not_found");
    // Already in the asked state (a double click, or two tabs): nothing changes,
    // so nothing is written and nothing is audited.
    if (current.active === active) return;
    const rows = await tx
      .update(healthSystems)
      .set({ active })
      .where(eq(healthSystems.id, id))
      .returning({ id: healthSystems.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: active ? "health_system.restore" : "health_system.archive",
      entityType: "health_system",
      entityId: id,
    });
  });
}

/** "Usa tabela de preços de Sistemas". OFF unless set. Read by nothing else yet. */
export async function getHealthSystemsPriceTable(actor: RequestContext): Promise<boolean> {
  assertCan(actor.role, "settings:read");
  const settings = await runScoped(actor, async (tx) => {
    const rows = await tx.select({ settings: tenants.settings }).from(tenants);
    return rows[0]?.settings ?? {};
  });
  return readPriceTableEnabled(settings);
}

export async function setHealthSystemsPriceTable(
  actor: RequestContext,
  enabled: boolean,
): Promise<void> {
  assertCan(actor.role, "settings:manage");
  await runScoped(actor, async (tx) => {
    // Read-merge-write under a row lock, as updateTenantSettings does: another
    // key of the blob saved at the same moment is not written over.
    const current = await tx.select({ settings: tenants.settings }).from(tenants).for("update");
    const existing = (current[0]?.settings ?? {}) as Record<string, unknown>;
    await tx.update(tenants).set({ settings: withPriceTableEnabled(existing, enabled) });
    await writeAudit(tx, actor, {
      action: "tenant.update",
      entityType: "tenant",
      entityId: actor.tenantId,
      metadata: { fields: ["healthSystems.priceTableEnabled"], enabled },
    });
  });
}

/**
 * The patient form's server check, inside the patient write's own transaction.
 * The id must resolve to a Sistema the caller can read (so of the caller's
 * tenant: the composite key would refuse another tenant's anyway, with an error
 * nobody at the desk could act on), and it must be active unless it is the value
 * the patient already holds. Returns false when the id is not acceptable.
 */
export async function healthSystemSelectable(
  tx: DbTx,
  id: string,
  currentId: string | null,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: healthSystems.id, active: healthSystems.active })
    .from(healthSystems)
    .where(eq(healthSystems.id, id))
    .limit(1);
  if (!row) return false;
  return row.active || row.id === currentId;
}
