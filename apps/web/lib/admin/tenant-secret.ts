import "server-only";
import { assertCan } from "@osteojp/auth";
import { tenants } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";

/**
 * Per-tenant SERVER-ONLY secret storage (W3-05) — the home for hashed secrets
 * such as W3-06's appointment-hard-delete password.
 *
 * Home: `tenants.settings` jsonb, under a dedicated `secrets` namespace
 * (`settings.secrets[key]`). Why this is safe:
 *  - Tenant-scoped, fail-closed RLS: `tenants_tenant_isolation`
 *    (USING/WITH CHECK `id = jwt_tenant_id()`, 0001_rls) — a tenant can only
 *    ever read/write its OWN tenants row, so one tenant's secret is physically
 *    unreadable by another.
 *  - Never client-exposed: the only client-facing settings read,
 *    `getTenantSettings`, PROJECTS just name/nif/contacts/config — it never
 *    returns the raw blob, so keys under `secrets` stay server-side. This
 *    module is `server-only`, and values here are opaque strings (a HASH, never
 *    a plaintext).
 *  - Preserved across saves: `updateTenantSettings` read-merge-writes
 *    (`...existing`), so the `secrets` namespace survives other settings edits.
 *
 * Contract for W3-06: write the appointment-delete password HASH with
 * `setTenantSecret(actor, "appointmentDeletePasswordHash", hash)` (admin-gated),
 * and read it for verification with `getTenantSecret(actor, key)` inside the
 * server-side delete action. Never send the hash to the client; never store the
 * plaintext.
 */

type SettingsBlob = Record<string, unknown> & { secrets?: Record<string, unknown> };

/**
 * Read a tenant secret string, or null when unset. Server-only and tenant-scoped
 * by RLS. Intentionally NOT capability-gated: the value is an opaque hash that
 * never leaves the server (it is only compared against a user-supplied secret
 * inside an already-gated action), so any server-side caller may read it.
 */
export async function getTenantSecret(
  actor: RequestContext,
  key: string,
): Promise<string | null> {
  return runScoped(actor, async (tx) => {
    const [row] = await tx.select({ settings: tenants.settings }).from(tenants);
    const secrets = ((row?.settings as SettingsBlob | null)?.secrets ?? {}) as Record<
      string,
      unknown
    >;
    const value = secrets[key];
    return typeof value === "string" ? value : null;
  });
}

/**
 * Store a tenant secret string (e.g. a password hash). Admin-only
 * (`settings:manage`, server-enforced), audited, and read-merge-write so the
 * rest of the settings blob (and other secrets) is preserved.
 */
export async function setTenantSecret(
  actor: RequestContext,
  key: string,
  value: string,
): Promise<void> {
  assertCan(actor.role, "settings:manage");

  await runScoped(actor, async (tx) => {
    const [row] = await tx.select({ settings: tenants.settings }).from(tenants);
    const existing = (row?.settings ?? {}) as SettingsBlob;
    const secrets = { ...(existing.secrets ?? {}), [key]: value };
    await tx.update(tenants).set({ settings: { ...existing, secrets } });

    await writeAudit(tx, actor, {
      action: "tenant.secret.set",
      entityType: "tenant",
      entityId: actor.tenantId,
      // PII-free: the secret's KEY only — never the hash or plaintext.
      metadata: { key },
    });
  });
}
