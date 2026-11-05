import "server-only";
import { assertCan } from "@osteojp/auth";
import { tenants } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import {
  parseBirthdayIndication,
  parseTenantConfig,
  validateConfigInput,
  type BirthdayIndicationConfig,
  type TenantConfig,
  type TenantConfigInput,
} from "./settings-config";

/** Contacts have no dedicated columns; they live in tenants.settings (jsonb). */
type TenantContacts = { email: string; phone: string; address: string };
/**
 * Shape of the tenants.settings jsonb blob. `locale`, `reminders` and `billing`
 * are read/written through settings-config.ts; we only type them as the raw
 * jsonb seam (`unknown`) here and let that module narrow.
 */
type TenantSettingsJson = {
  contacts?: Partial<TenantContacts>;
  locale?: unknown;
  reminders?: unknown;
  billing?: unknown;
  /** Indicação de Aniversários; read through parseBirthdayIndication. */
  birthdayIndication?: unknown;
  notes?: string;
};

export type TenantSettingsView = {
  name: string;
  nif: string;
  contacts: TenantContacts;
  config: TenantConfig;
  birthdayIndication: BirthdayIndicationConfig;
};

export type TenantSettingsInput = {
  name: string;
  nif: string;
  email: string;
  phone: string;
  address: string;
  config: TenantConfigInput;
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
    // Tolerant parse: existing tenants with no config blob read back full defaults.
    config: parseTenantConfig(settings),
    birthdayIndication: parseBirthdayIndication(settings),
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

  // Validate config up front so a bad field fails the whole save atomically,
  // before we open the transaction.
  const result = validateConfigInput(input.config);
  if (!result.ok) {
    throw new AdminError("invalid", `invalid settings field: ${result.field}`);
  }
  const config = result.value;

  await runScoped(actor, async (tx) => {
    // Read-merge-write so we never clobber other keys in the settings blob.
    // The row is locked for the read: a save of another key of the blob (a
    // location's Declaração mark, a tenant secret) that commits between this
    // read and this write would otherwise be written over.
    const current = await tx.select({ settings: tenants.settings }).from(tenants).for("update");
    const existing = (current[0]?.settings ?? {}) as TenantSettingsJson;
    const settings: TenantSettingsJson = {
      ...existing,
      contacts: {
        email: input.email.trim(),
        phone: input.phone.trim(),
        address: input.address.trim(),
      },
      // locale stays top-level (reminders/locale.ts resolves it from there).
      locale: config.locale,
      reminders: config.reminders,
      billing: config.billing,
    };

    await tx.update(tenants).set({ name, nif: nif || null, settings });

    await writeAudit(tx, actor, {
      action: "tenant.update",
      entityType: "tenant",
      entityId: actor.tenantId,
      // PII-free: field names only, never the values.
      metadata: { fields: ["name", "nif", "contacts", "locale", "reminders", "billing"] },
    });
  });
}

/**
 * Indicação de Aniversários: turns the birthday icon in the staff top bar on
 * or off. Its own save, like the delete password, so the switch never rides on
 * the main settings form. Owner and admin only (`settings:manage`), and the
 * row is written under the actor's own claims, where `tenants_manager_update`
 * (0094) admits owner and admin only.
 */
export async function setBirthdayHeaderIcon(
  actor: RequestContext,
  enabled: boolean,
): Promise<void> {
  assertCan(actor.role, "settings:manage");
  if (typeof enabled !== "boolean") {
    throw new AdminError("invalid", "invalid settings field: birthdayIndication");
  }

  await runScoped(actor, async (tx) => {
    // Read-merge-write under a row lock, as updateTenantSettings does, so a
    // save of another key of the blob is never written over.
    const current = await tx.select({ settings: tenants.settings }).from(tenants).for("update");
    if (!current[0]) throw new AdminError("not_found", "tenant row not visible in this context");
    const existing = (current[0].settings ?? {}) as TenantSettingsJson;
    const birthdayIndication: BirthdayIndicationConfig = { headerIcon: enabled };
    await tx.update(tenants).set({ settings: { ...existing, birthdayIndication } });

    await writeAudit(tx, actor, {
      action: "tenant.update",
      entityType: "tenant",
      entityId: actor.tenantId,
      // PII-free: the field name only.
      metadata: { fields: ["birthdayIndication"] },
    });
  });
}
