import "server-only";
import { desc, eq } from "drizzle-orm";
import {
  getDbAdmin,
  auditLog,
  tenants,
  provisionTenant,
  type ProvisionTenantResult,
} from "@osteojp/db";
import type { Operator } from "@/lib/auth/operator";

export type TenantStatus = "active" | "suspended";

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  nif: string | null;
  status: TenantStatus;
  createdAt: Date;
};

/** Pure validation error so input rules are unit-testable without a DB. */
export class TenantInputError extends Error {
  override readonly name = "TenantInputError";
  readonly code: "invalid_name" | "invalid_slug" | "invalid_nif";
  constructor(code: TenantInputError["code"], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function isTenantInputError(e: unknown): e is TenantInputError {
  return e instanceof Error && e.name === "TenantInputError";
}

// Slug: lowercase alphanumeric words separated by single hyphens. Matches the
// public-handle shape used elsewhere (e.g. osteojp-preview).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// PT NIF: exactly 9 digits. Optional — a clinic may be onboarded before its
// fiscal number is on file.
const NIF_RE = /^\d{9}$/;

/**
 * Normalize + validate operator-entered tenant fields. Trims name; lowercases
 * and validates the slug; treats an empty NIF as null, else requires 9 digits.
 * Throws TenantInputError (a stable code → i18n message) on bad input.
 */
export function normalizeTenantInput(input: {
  name: string;
  slug: string;
  nif?: string | null;
}): { name: string; slug: string; nif: string | null } {
  const name = input.name.trim();
  if (name.length < 2) throw new TenantInputError("invalid_name");

  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw new TenantInputError("invalid_slug");

  const nifRaw = (input.nif ?? "").trim();
  const nif = nifRaw.length === 0 ? null : nifRaw;
  if (nif !== null && !NIF_RE.test(nif)) throw new TenantInputError("invalid_nif");

  return { name, slug, nif };
}

/** Every tenant on the platform, newest first. Cross-tenant by design (BYPASSRLS). */
export async function listTenants(): Promise<TenantRow[]> {
  const db = getDbAdmin();
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      nif: tenants.nif,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt));
  return rows;
}

/**
 * Create a tenant (and its canonical roles + audit) via the shared
 * provisionTenant entry point, attributing the audit to the operator.
 */
export async function createTenant(
  operator: Operator,
  input: { name: string; slug: string; nif?: string | null },
): Promise<ProvisionTenantResult> {
  const norm = normalizeTenantInput(input);
  return provisionTenant({ ...norm, operatorId: operator.userId });
}

/**
 * Set a tenant's platform lifecycle status. No-op (and no audit) when unchanged.
 * Writes a `tenant.status_change` audit row in the same transaction; the
 * operator is recorded in metadata (a uuid) since they are not a tenant user
 * (actor_user_id stays NULL). BYPASSRLS path — does not touch tenant isolation.
 */
export async function setTenantStatus(
  operator: Operator,
  tenantId: string,
  status: TenantStatus,
): Promise<void> {
  const db = getDbAdmin();
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    const from = current[0]?.status;
    if (!from) throw new Error(`setTenantStatus: tenant ${tenantId} not found`);
    if (from === status) return; // no-op

    await tx.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
    await tx.insert(auditLog).values({
      tenantId,
      actorUserId: null,
      action: "tenant.status_change",
      entityType: "tenant",
      entityId: tenantId,
      metadata: { from, to: status, operatorId: operator.userId },
    });
  });
}
