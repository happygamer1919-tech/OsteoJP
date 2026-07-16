import type { PackView } from "./packs";
import type { ServiceView } from "./services";

/**
 * W8-01b — pure UI helpers for the packs admin surface. The W6-01b split
 * (standing rule): FILTER lists INCLUDE inactive rows (so archived packs stay
 * manageable/restorable, and historic references survive), while CREATION
 * dropdowns show ACTIVE only. Kept pure (no DB) so the split is unit-testable
 * exactly like normalizePackInput.
 */
export type PackStatusFilter = "all" | "active" | "inactive";

/** Coerce a raw query-param to a valid filter; default "all" (includes inactive). */
export function parsePackStatusFilter(raw: string | undefined): PackStatusFilter {
  return raw === "active" || raw === "inactive" ? raw : "all";
}

/**
 * Filter the packs table. "all" and "inactive" both SURFACE archived packs
 * (filter-includes-inactive, W6-01b); "active" hides them. listPacks already
 * returns every pack (no isActive filter), so this is the display split.
 */
export function filterPacksByStatus(packs: PackView[], filter: PackStatusFilter): PackView[] {
  if (filter === "active") return packs.filter((p) => p.isActive);
  if (filter === "inactive") return packs.filter((p) => !p.isActive);
  return packs;
}

/**
 * The base-service options for creating/editing a pack: ACTIVE services only
 * (creation-active-only, W6-01b). An archived service must not become a new
 * pack's base; existing packs on a now-archived base keep rendering (the table
 * shows the stored name), they just can't be re-pointed to an inactive service.
 */
export function activeBaseServiceOptions(services: ServiceView[]): ServiceView[] {
  return services.filter((s) => s.isActive);
}

/**
 * UI reference guard: a pack with >= 1 patient instance is archive-only (never
 * hard-deleted, so a purchased pack's history survives). The server enforces
 * this too (packs.ts deletePack throws `has_references`); this only drives the
 * disabled delete affordance.
 */
export function canHardDeletePack(referencedPackIds: Set<string>, packId: string): boolean {
  return !referencedPackIds.has(packId);
}
