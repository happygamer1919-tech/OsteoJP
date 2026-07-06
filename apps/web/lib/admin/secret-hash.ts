import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Server-side password hashing for tenant secrets (W3-06), using node:crypto
 * scrypt — a memory-hard KDF in the standard library, so NO new dependency /
 * vendor. Format: `scrypt$<saltHex>$<hashHex>`. Verification is constant-time
 * (timingSafeEqual). Plaintext is never stored; the hash never leaves the
 * server. scryptSync is fine here: these are infrequent admin actions.
 */

const SALT_LEN = 16;
const KEY_LEN = 32;
const PREFIX = "scrypt";

export function hashSecret(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const derived = scryptSync(plain, salt, KEY_LEN);
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const salt = Buffer.from(parts[1], "hex");
  const want = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || want.length === 0) return false;
  const got = scryptSync(plain, salt, want.length);
  // Length check guards timingSafeEqual (throws on mismatched lengths).
  return got.length === want.length && timingSafeEqual(got, want);
}
