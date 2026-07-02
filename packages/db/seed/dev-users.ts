/**
 * Seed — dev user identities + natural-key resolver (FA-1).
 *
 * Single source of truth for the five seeded dev users (USR_1..5). Two roles:
 *
 *  1. `DEV_USERS` — the insert descriptor dev-reference.ts uses to seed the
 *     `users` rows. The fixture `id` (de000004-*) is used ONLY for that insert.
 *  2. `resolveDevUsers` — reads the users back by (tenant_id, email) and returns
 *     their REAL ids. Every downstream seeder consumes these resolved ids for its
 *     user FKs (practitioner_id, primary_practitioner_id, signed_by, availability
 *     user_id), NEVER the fixture constant.
 *
 * This mirrors the #414 `roleId(slug)` pattern (roles resolved by (tenant,slug))
 * and extends it to users on their `users_tenant_email_uq (tenant_id, email)`
 * key. It closes the same class of latent FK defect: if a user with a seeded
 * email pre-exists under a different real UUID, dev-reference's idempotent insert
 * is skipped — and the downstream seeders must still attach to the row that
 * actually exists, resolved by email, instead of a fixture id that was never
 * inserted.
 */

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { users } from "../src/schema";
import { USR_1, USR_2, USR_3, USR_4, USR_5 } from "./dev-ids";

/** The five dev users, in stable USR_1..5 order. `id` seeds the row; downstream
 *  FKs resolve to the row's REAL id by email (see resolveDevUsers), never `id`. */
export const DEV_USERS = [
  { id: USR_1, email: "andre.costa@osteojp-dev.pt",       fullName: "Dr. André Costa",       roleSlug: "therapist" },
  { id: USR_2, email: "sofia.mendes@osteojp-dev.pt",      fullName: "Dra. Sofia Mendes",     roleSlug: "therapist" },
  { id: USR_3, email: "bernardo.figueira@osteojp-dev.pt", fullName: "Dr. Bernardo Figueira", roleSlug: "therapist" },
  { id: USR_4, email: "ines.carmo@osteojp-dev.pt",        fullName: "Dra. Inês Carmo",        roleSlug: "therapist" },
  { id: USR_5, email: "rui.correia@osteojp-dev.pt",       fullName: "Dr. Rui Correia",        roleSlug: "admin" },
] as const;

export type DevUserResolver = {
  /** Resolve one seeded email to its REAL user id. Exits non-zero if missing. */
  userIdByEmail(email: string): string;
  /** Resolve a stable therapist seq (1..5, USR_n order) to its REAL user id. */
  userIdBySeq(seq: number): string;
  /** USR_1..5 resolved to their REAL ids, in order (index 0 = USR_1). */
  ids: readonly [string, string, string, string, string];
};

/**
 * Resolve the seeded dev users to their REAL ids by (tenant_id, email). Exits
 * the process non-zero if any seeded email is absent, so a downstream user FK
 * can never silently dangle on a fixture id that was never inserted.
 */
export async function resolveDevUsers(
  db: PostgresJsDatabase,
  tenantId: string,
): Promise<DevUserResolver> {
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  const byEmail = new Map(rows.map((r) => [r.email, r.id]));

  const userIdByEmail = (email: string): string => {
    const id = byEmail.get(email);
    if (!id) {
      console.error(`Seed failed: user email "${email}" not found for tenant ${tenantId}.`);
      process.exit(1);
    }
    return id;
  };

  const ids = [
    userIdByEmail(DEV_USERS[0].email),
    userIdByEmail(DEV_USERS[1].email),
    userIdByEmail(DEV_USERS[2].email),
    userIdByEmail(DEV_USERS[3].email),
    userIdByEmail(DEV_USERS[4].email),
  ] as const;

  const userIdBySeq = (seq: number): string => {
    const id = ids[seq - 1];
    if (!id) {
      console.error(`Seed failed: no dev user for seq ${seq} (expected 1..${DEV_USERS.length}).`);
      process.exit(1);
    }
    return id;
  };

  return { userIdByEmail, userIdBySeq, ids };
}
