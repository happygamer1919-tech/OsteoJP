import "server-only";
import { AdminError } from "./errors";
import { hashSecret, verifySecret } from "./secret-hash";
import { getTenantSecret, setTenantSecret } from "./tenant-secret";
import type { RequestContext } from "@/lib/auth/context";

/**
 * The appointment-hard-delete password (W3-06). Stored HASHED as a tenant secret
 * (W3-05 home: tenants.settings.secrets), verified server-side ONLY. The initial
 * value is `1234` until an admin changes it: when no hash is stored yet, the
 * default password is accepted (and any admin change replaces it with a hash).
 * Plaintext is never persisted, logged, or returned.
 */
export const DELETE_PW_KEY = "appointmentDeletePasswordHash";
export const DEFAULT_DELETE_PASSWORD = "1234";

/**
 * True iff `supplied` matches the tenant's delete password. Server-only,
 * tenant-scoped by RLS (via getTenantSecret). Not capability-gated: it is called
 * inside an already-gated delete action and never returns the hash. When no hash
 * is set, the house default (`1234`) applies.
 */
export async function verifyDeletePassword(
  actor: RequestContext,
  supplied: string,
): Promise<boolean> {
  const stored = await getTenantSecret(actor, DELETE_PW_KEY);
  if (stored === null) return supplied === DEFAULT_DELETE_PASSWORD;
  return verifySecret(supplied, stored);
}

/**
 * Set (or change) the delete password. Admin-only — enforced by setTenantSecret
 * (`settings:manage`) — and audited (key only). The plaintext is hashed here and
 * never stored or returned.
 */
export async function setDeletePassword(
  actor: RequestContext,
  newPassword: string,
): Promise<void> {
  const pw = newPassword.trim();
  if (pw.length < 4) throw new AdminError("invalid", "password too short");
  await setTenantSecret(actor, DELETE_PW_KEY, hashSecret(pw));
}
