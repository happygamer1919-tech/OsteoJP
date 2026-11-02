import { sql } from "drizzle-orm";
import { tenants } from "@osteojp/db";

/**
 * Indicação de Aniversários: the setting's key, read in SQL with the rule
 * `parseBirthdayIndication` (lib/admin/settings-config.ts) reads in TypeScript:
 * ON only when `settings.birthdayIndication.headerIcon` is the JSON boolean
 * `true`. A string "true", a number, a missing key or a missing blob are OFF.
 *
 * Its own small module so the shell's identity read (lib/auth/staff-identity.ts)
 * can select it without importing the patient read. birthdays.db.test.ts drives
 * both values through a real tenant row.
 */
export const headerIconOnSql = sql<boolean>`coalesce((${tenants.settings} -> 'birthdayIndication' -> 'headerIcon') = 'true'::jsonb, false)`;
