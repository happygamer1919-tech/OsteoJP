import "server-only";
import { assertCan } from "@osteojp/auth";
import { tenants } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";

/** Contacts have no dedicated columns; they live in tenants.settings (jsonb). */
type TenantContacts = { email: string; phone: string; address: string };
type TenantSettingsJson = { contacts?: Partial<TenantContacts> };

export type TenantSettingsView = {
  name: string;
  nif: string;
  contacts: TenantContacts;
};

export type TenantSettingsInput = {
  name: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
};

export async function getTenantSettings(actor: RequestContext): Promise<TenantSettingsView> {
  assertCan(actor.role, "settings:read");

  const row = await runScoped(actor, async (tx) => {
    const rows = await tx
      .select({ name: tenants.name, nif: tenants.nif, settings: tenants.settings })
      .from(tenants);
    return rows[0] ?? null;
  });
  if (!row) throw new AdminError("not_found", "tenant row not visible in this context");

  const settings = (row.settings ?? {}) as TenantSettingsJson;
  const c = settings.contacts ?? {};
  return {
    name: row.name,
    nif: row.nif ?? "",
    contacts: { email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "" },
  };
}

export async function updateTenantSettings(
  actor: RequestContext,
  input: TenantSettingsInput,
): Promise<void> {
  assertCan(actor.role, "settings:manage");

  const name = input.name.trim();
  if (!name) throw new AdminError("invalid", "clinic name is required");
  const nif = input.nif.trim();

  await runScoped(actor, async (tx) => {
    // Read-merge-write so we never clobber other keys in the settings blob.
    const current = await tx.select({ settings: tenants.settings }).from(tenants);
    const existing = (current[0]?.settings ?? {}) as TenantSettingsJson;
    const settings: TenantSettingsJson = {
      ...existing,
      contacts: {
        email: input.email.trim(),
        phone: input.phone.trim(),
        address: input.address.trim(),
      },
    };

    await tx.update(tenants).set({ name, nif: nif || null, settings });

    await writeAudit(tx, actor, {
      action: "tenant.update",
      entityType: "tenant",
      entityId: actor.tenantId,
      // PII-free: field names only, never the values.
      metadata: { fields: ["name", "nif", "contacts"] },
    });
  });
}
