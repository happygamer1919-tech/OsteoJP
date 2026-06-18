// Read-side data access for patients. Every query: requireRequestContext →
// assertCan('patients:read') → runScoped. Tenant isolation is RLS's job; we
// never add a tenant_id filter here.

import "server-only";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patients } from "@osteojp/db";
import { requireRequestContext, runScoped } from "../auth/context";
import { activePatientsOnly } from "./filters";
import { escapeLike, parseSearch } from "./validation";
import type { Patient } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit: number | undefined): number {
  if (!limit || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

export async function getPatient(
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<Patient | null> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const where = opts.includeDeleted
      ? eq(patients.id, id)
      : and(eq(patients.id, id), activePatientsOnly);
    const [row] = await tx.select().from(patients).where(where).limit(1);
    return row ?? null;
  });
}

export async function listPatients(
  opts: { limit?: number; offset?: number } = {},
): Promise<Patient[]> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");
  const limit = clampLimit(opts.limit);
  const offset = Math.max(0, opts.offset ?? 0);
  return runScoped(ctx, async (tx) =>
    tx
      .select()
      .from(patients)
      .where(activePatientsOnly)
      .orderBy(asc(patients.fullName)) // uses patients_tenant_name_idx
      .limit(limit)
      .offset(offset),
  );
}

/**
 * Tenant-scoped search over full_name (substring), NIF (prefix), and phone
 * (digits-only substring, tolerant of stored separators). Soft-deleted rows are
 * excluded. The (tenant_id, full_name) index serves the tenant slice + ordering;
 * within a single tenant's row count this stays well under the 300ms target.
 */
export async function searchPatients(
  rawQuery: string,
  opts: { limit?: number } = {},
): Promise<Patient[]> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "patients:read");

  const { text, digits } = parseSearch(rawQuery);
  if (text.length === 0) return [];

  const limit = clampLimit(opts.limit);
  const nameLike = `%${escapeLike(text)}%`;

  return runScoped(ctx, async (tx) => {
    const matchers = [ilike(patients.fullName, nameLike)];
    if (digits.length > 0) {
      matchers.push(ilike(patients.nif, `${escapeLike(digits)}%`));
      matchers.push(
        sql`"phone_digits" like ${`%${digits}%`}`,
      );
    }
    return tx
      .select()
      .from(patients)
      .where(and(activePatientsOnly, or(...matchers)))
      .orderBy(asc(patients.fullName))
      .limit(limit);
  });
}
