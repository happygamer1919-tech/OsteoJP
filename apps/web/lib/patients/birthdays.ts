import "server-only";
import { and, asc, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { can } from "@osteojp/auth";
import { patients, tenants } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { activePatientsOnly } from "./filters";
import { patientLocationScope, therapistPatientReadScope } from "./scope";
import { ageTurning, birthdayMonthDays, lisbonDay, type LisbonDay } from "./birthday-rule";

/**
 * Indicação de Aniversários, part 1: the birthday icon in the staff top bar.
 *
 * ==========================================================================
 * WHO SEES WHICH PATIENT: EXACTLY WHO SEES THEM ON /patients
 * ==========================================================================
 * The read runs under `runScoped`, the viewer's own claims and `local role
 * authenticated`, so `patients_select` (RLS) decides first. On top of it the
 * SAME app scope the /patients list composes (`scopeConditions` in
 * list-queries.ts): a therapist's read scope (treats, created, or on the care
 * team), else a located receptionist's or admin's clinics, else the tenant.
 * There is no admin client and no service-role read here, and nothing a viewer
 * could not already find by opening the patient list.
 *
 * ==========================================================================
 * WHAT IS READ
 * ==========================================================================
 * Id, name and date of birth of the patients whose birthday is today in Lisbon
 * (birthday-rule.ts), and nothing else. The date of birth stays on the server:
 * the shell receives the name and the age the patient turns.
 */

/** One row of the list the icon opens. */
export type BirthdayRow = { id: string; fullName: string; age: number };

/**
 * More than a day's birthdays in any clinic of this size (about 23 a day over
 * 8,400 patients). A ceiling, so a malformed import cannot make every page
 * render thousands of rows; it is not a page size.
 */
export const BIRTHDAY_LIST_CAP = 200;

/** The WHERE arm for "celebrates today": one `to_char` per allowed "MM-DD". */
export function birthdayPredicate(today: LisbonDay): SQL {
  const arms = birthdayMonthDays(today).map(
    (md) => sql`to_char(${patients.dateOfBirth}, 'MM-DD') = ${md}`,
  );
  return and(isNotNull(patients.dateOfBirth), or(...arms))!;
}

/**
 * Today's birthday patients the viewer may see, sorted by name. `now` is a
 * parameter so the Lisbon-day rule can be tested at a fixed instant.
 */
export async function listTodaysBirthdays(
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<BirthdayRow[]> {
  if (!can(ctx.role, "patients:read")) return [];
  const today = lisbonDay(now);

  // The /patients list's read scope, composed the same way (scopeConditions).
  const locIds = await viewerLocationScope(ctx);
  const roleScope =
    (await therapistPatientReadScope(ctx, patients.id)) ??
    (locIds ? patientLocationScope(patients.id, locIds) : undefined);

  const rows = await runScoped(
    ctx,
    async (tx) =>
      tx
        .select({
          id: patients.id,
          fullName: patients.fullName,
          dateOfBirth: patients.dateOfBirth,
        })
        .from(patients)
        .where(and(activePatientsOnly, roleScope, birthdayPredicate(today)))
        .orderBy(asc(patients.fullName))
        .limit(BIRTHDAY_LIST_CAP),
    "db:patients-birthdays",
  );

  return rows
    .map((r) => ({ id: r.id, fullName: r.fullName, age: ageTurning(String(r.dateOfBirth), today) }))
    // A date of birth this year or later is a typing error, not a birthday:
    // "faz 0 anos" helps nobody, so such a row is left out of the list and the count.
    .filter((r) => r.age >= 1);
}

/**
 * The setting's key, read in SQL with the rule `parseBirthdayIndication` reads
 * in TypeScript: ON only when `headerIcon` is the JSON boolean `true`. A string
 * "true", a number, a missing key or a missing blob are all OFF.
 * birthdays.db.test.ts drives both values through a real tenant row.
 */
export const headerIconOnSql = sql<boolean>`coalesce((${tenants.settings} -> 'birthdayIndication' -> 'headerIcon') = 'true'::jsonb, false)`;

/**
 * Whether the tenant has "Notificação de aniversariantes" switched on. Read
 * under the viewer's claims: `tenants_tenant_select` (0094) lets every staff
 * role read its own tenant row. Only the one boolean is selected, so the rest
 * of the settings blob (contacts, hashed secrets) never leaves the database on
 * this path, which runs on every staff page.
 */
export async function birthdayHeaderIconEnabled(ctx: RequestContext): Promise<boolean> {
  const rows = await runScoped(
    ctx,
    async (tx) => tx.select({ on: headerIconOnSql }).from(tenants).limit(1),
    "db:tenant-birthday-setting",
  );
  return rows[0]?.on === true;
}

/**
 * What the shell draws: `null` when the setting is OFF (no icon at all), else
 * today's rows, possibly none.
 */
export async function loadBirthdayIndication(
  ctx: RequestContext,
  now: Date = new Date(),
): Promise<BirthdayRow[] | null> {
  if (!(await birthdayHeaderIconEnabled(ctx))) return null;
  return listTodaysBirthdays(ctx, now);
}
