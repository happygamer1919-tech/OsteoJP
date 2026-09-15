import "server-only";
import { and, count, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertCan } from "@osteojp/auth";
import { appointments, locations, patients, reminderDispatches, users } from "@osteojp/db";

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { fullNameMatcher } from "@/lib/patients/name-search";

import { FAILED_PROVIDER_STATUSES } from "./reminder-log-core";

/**
 * COMMS-01 (owner dispatch 2026-09-14, BL-2): the rows behind Lembretes SMS.
 *
 * ==========================================================================
 * A READ OVER WHAT EXISTS, AND WHAT EXISTS IS HALF THE FEATURE.
 * ==========================================================================
 * `reminder_dispatches` (0075) holds one row per attempt to hand a message to
 * the provider: sent, suppressed with a reason, or refused with the provider's
 * code, with delivery filled in later by the Twilio status callback. It does NOT
 * hold the moment a reminder was scheduled, and it holds no recipient. The
 * schedule row, the destination and the therapist's scoped view each need a
 * migration (docs/QUESTIONS.md > Q-COMMS-01-1), which this card does not author.
 *
 * ==========================================================================
 * THROUGH runScoped, AS THE VIEWER. NEVER THE REMINDER JOB'S CONTEXT.
 * ==========================================================================
 * `withReminderTenantContext` runs as `admin` for a whole tenant; it is how the
 * pipeline WRITES this table. Reading with it here would show every receptionist
 * every clinic's rows and bypass the policy the page is supposed to answer to.
 * So the capability is asserted first and the read runs under the viewer's own
 * claims, where two policies decide the rows:
 *
 *   - 0075's SELECT policy on reminder_dispatches: owner, admin and reception of
 *     the tenant. A therapist reads nothing, which is why a therapist does not
 *     hold `reminders:log_read` yet.
 *   - appointments_rls, through the INNER join: an admin or receptionist
 *     assigned to clinics sees only rows whose appointment is at one of them.
 *     0075's own policy is tenant-wide, so the join is what narrows it, and it
 *     is INNER for that reason - a row whose appointment this viewer may not
 *     read is a row this viewer does not get.
 */

export const REMINDER_LOG_PAGE_SIZE = 50;

export type ReminderLogEntry = {
  id: string;
  createdAt: Date;
  templateId: string;
  outcome: string;
  suppressionReason: string | null;
  providerStatus: string | null;
  providerErrorCode: string | null;
  statusAt: Date | null;
  appointmentId: string;
  appointmentStartsAt: Date;
  appointmentEndsAt: Date;
  patientId: string;
  patientName: string;
  /** As stored on the patient TODAY, not the number the message went to. */
  patientPhone: string | null;
  therapistName: string | null;
  locationName: string | null;
};

export type ReminderLogPage = {
  rows: ReminderLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listReminderLog(
  ctx: RequestContext,
  opts: { page?: number; onlyFailures?: boolean; search?: string } = {},
): Promise<ReminderLogPage> {
  assertCan(ctx.role, "reminders:log_read");

  return runScoped(
    ctx,
    async (tx) => {
      const conds: (SQL | undefined)[] = [eq(reminderDispatches.channel, "sms")];
      if (opts.onlyFailures) {
        // The same rule as `isFailure` in reminder-log-core.ts, in SQL.
        conds.push(
          or(
            eq(reminderDispatches.outcome, "provider_error"),
            inArray(reminderDispatches.providerStatus, [...FAILED_PROVIDER_STATUSES]),
          ),
        );
      }
      // COMMS-03: THE PATIENT LIST'S OWN NAME RULE, NOT A SECOND ONE. Every typed
      // token must appear somewhere in the name, in any order, accent-insensitively
      // (lib/patients/name-search.ts). A whole-string `ilike` here would rebuild the
      // two defects that rule was written to end. It is ANDed with Só falhas, and
      // it is a WHERE clause, so the count and the page below carry it too.
      // `undefined` for a blank query means "no name condition", never "match
      // nothing"; a query that matches nobody returns zero rows.
      if (opts.search) conds.push(fullNameMatcher(opts.search));
      const where = and(...conds);

      // The count the header states, on the SAME joins and predicate as the page.
      const [countRow] = await tx
        .select({ n: count() })
        .from(reminderDispatches)
        .innerJoin(appointments, eq(appointments.id, reminderDispatches.appointmentId))
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .where(where);
      const total = Number(countRow?.n ?? 0);
      const pageSize = REMINDER_LOG_PAGE_SIZE;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);

      const therapist = alias(users, "reminder_log_therapist");
      const rows = await tx
        .select({
          id: reminderDispatches.id,
          createdAt: reminderDispatches.createdAt,
          templateId: reminderDispatches.templateId,
          outcome: reminderDispatches.outcome,
          suppressionReason: reminderDispatches.suppressionReason,
          providerStatus: reminderDispatches.providerStatus,
          providerErrorCode: reminderDispatches.providerErrorCode,
          statusAt: reminderDispatches.statusAt,
          appointmentId: appointments.id,
          appointmentStartsAt: appointments.startsAt,
          appointmentEndsAt: appointments.endsAt,
          patientId: patients.id,
          patientName: patients.fullName,
          patientPhone: patients.phone,
          therapistName: therapist.fullName,
          locationName: locations.name,
        })
        .from(reminderDispatches)
        .innerJoin(appointments, eq(appointments.id, reminderDispatches.appointmentId))
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        // LEFT: a therapist or clinic the viewer cannot resolve blanks a cell; it
        // must not delete a row about a message to a patient.
        .leftJoin(therapist, eq(therapist.id, appointments.practitionerId))
        .leftJoin(locations, eq(locations.id, appointments.locationId))
        .where(where)
        // Newest first; the id breaks ties so paging is stable.
        .orderBy(desc(reminderDispatches.createdAt), desc(reminderDispatches.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { rows, total, page, pageSize, pageCount };
    },
    "db:reminder-log",
  );
}
