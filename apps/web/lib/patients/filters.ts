import { isNull } from "drizzle-orm";
import { patients } from "@osteojp/db";

/**
 * The "active patient" predicate: excludes soft-deleted rows (deleted_at set).
 *
 * Patients are never hard-deleted (soft delete via deleted_at), so every count
 * or list that should reflect *active* patients must apply this — otherwise
 * soft-deleted rows inflate the total. BUG-12: the dashboard count read 51 with
 * 50 live + 1 soft-deleted patient because it counted unconditionally.
 *
 * Reused across queries as a single source of truth. It is an immutable Drizzle
 * SQL condition, safe to share across multiple query builders.
 */
export const activePatientsOnly = isNull(patients.deletedAt);
