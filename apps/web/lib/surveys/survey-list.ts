import "server-only";
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ForbiddenError, assertCan } from "@osteojp/auth";
import {
  appointmentSurveyResponses,
  appointmentSurveySends,
  appointments,
  locations,
  patients,
  users,
} from "@osteojp/db";

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { surveyVisible } from "@/lib/reminders/survey-mode";

import { parseSurveyMonth, type SurveyListEntry } from "./survey-list-core";

/**
 * SAT-01 (spec 7.3): the rows behind Avaliações de satisfação in Comunicações.
 * One row per send (S5), newest first, with its answer where the viewer may
 * read one.
 *
 * ==========================================================================
 * THROUGH runScoped, AS THE VIEWER. NEVER THE SEND PATH'S CONTEXT.
 * ==========================================================================
 * `withReminderTenantContext` is how the survey is SENT and ANSWERED; it runs
 * for a whole tenant with no user. Reading with it here would show every
 * member of staff every clinic's answers. So the capability is asserted first
 * and every table is read under the viewer's own claims, where migration
 * 0102's two SELECT policies decide the rows:
 *
 *   - sends (S4's roles): the owner, all; admin and reception, the sends whose
 *     appointment was at one of their clinics; a therapist, the sends of the
 *     patients they treat.
 *   - answers (S7): the owner, all; admin and reception by the same clinic
 *     rule; a therapist ONLY for a visit they attended, at one of their own
 *     clinics.
 *
 * THE SENDS ARE THE LIST, AND EVERYTHING ELSE IS A LEFT JOIN. A send this
 * viewer may read is a row on the page whatever else they may read: an answer,
 * a patient, a visit or a name the viewer's policies hide comes back NULL and
 * blanks its cells. An INNER join would delete the row, and with it the fact
 * that a survey was sent.
 *
 * A SEND THAT SAYS `answered` WITH NO ANSWER ROW is the one case the page
 * names (copy text 81): an answer exists and this viewer may not read it. The
 * comment, the scores and the contact choice never leave the database for
 * them.
 *
 * THE CODES TABLE IS NOT READ, HERE OR ANYWHERE A STAFF SCREEN CAN REACH. The
 * list shows that a send exists and its state, never its link (spec A7).
 *
 * ONE PATIENT'S SENDS ARE THE SAME READ, NARROWED (spec 7.7, the ficha).
 * `patientId` adds one condition and changes nothing else: the same session,
 * the same two policies, the same joins. It narrows within what the viewer may
 * read and opens nothing, so the ficha and this list cannot disagree about who
 * reads which send or which answer.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SURVEY_LIST_PAGE_SIZE = 50;

export type SurveyListPage = {
  rows: SurveyListEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listSurveySends(
  ctx: RequestContext,
  opts: { page?: number; month?: string | null; patientId?: string | null } = {},
): Promise<SurveyListPage> {
  assertCan(ctx.role, "surveys:read");
  // While the survey is switched off there is no list, for anyone (owner,
  // 2026-10-12). The page answers first; this is the same rule at the read, so
  // no other caller can show the rows of a survey that does not exist yet.
  if (!surveyVisible()) throw new ForbiddenError(ctx.role, "surveys:read");

  const month = parseSurveyMonth(opts.month);
  const patientId = opts.patientId ?? null;
  // A patient that is not an id is no patient: nothing, never the whole list.
  if (patientId !== null && !UUID.test(patientId)) {
    return { rows: [], total: 0, page: 1, pageSize: SURVEY_LIST_PAGE_SIZE, pageCount: 1 };
  }

  return runScoped(
    ctx,
    async (tx) => {
      const conds: (SQL | undefined)[] = [];
      if (month) {
        // The month of the SEND, by the Lisbon calendar: both bounds are Lisbon
        // wall-clock midnights, turned into instants by the database.
        conds.push(
          sql`${appointmentSurveySends.sentAt} >= (${month.from}::timestamp at time zone 'Europe/Lisbon')`,
          sql`${appointmentSurveySends.sentAt} < (${month.until}::timestamp at time zone 'Europe/Lisbon')`,
        );
      }
      if (patientId !== null) conds.push(eq(appointmentSurveySends.patientId, patientId));
      const where = conds.length ? and(...conds) : undefined;

      // The count on the SAME table and predicate as the page. No join can
      // change it: every join below is LEFT and to at most one row.
      const [countRow] = await tx.select({ n: count() }).from(appointmentSurveySends).where(where);
      const total = Number(countRow?.n ?? 0);
      const pageSize = SURVEY_LIST_PAGE_SIZE;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);

      const sender = alias(users, "survey_list_sender");
      const therapist = alias(users, "survey_list_therapist");
      const found = await tx
        .select({
          sendId: appointmentSurveySends.id,
          sentAt: appointmentSurveySends.sentAt,
          channel: appointmentSurveySends.channel,
          origin: appointmentSurveySends.origin,
          outcome: appointmentSurveySends.outcome,
          senderName: sender.fullName,
          patientId: appointmentSurveySends.patientId,
          patientName: patients.fullName,
          patientDeletedAt: patients.deletedAt,
          visitStartsAt: appointments.startsAt,
          therapistName: therapist.fullName,
          clinicName: locations.name,
          responseId: appointmentSurveyResponses.id,
          nps: appointmentSurveyResponses.nps,
          rating: appointmentSurveyResponses.rating,
          comment: appointmentSurveyResponses.comment,
          commentPurgedAt: appointmentSurveyResponses.commentPurgedAt,
          contactConsent: appointmentSurveyResponses.contactConsent,
          submittedAt: appointmentSurveyResponses.submittedAt,
        })
        .from(appointmentSurveySends)
        // One answer per send at most (0102: UNIQUE on send_id).
        .leftJoin(appointmentSurveyResponses, eq(appointmentSurveyResponses.sendId, appointmentSurveySends.id))
        .leftJoin(patients, eq(patients.id, appointmentSurveySends.patientId))
        .leftJoin(appointments, eq(appointments.id, appointmentSurveySends.appointmentId))
        .leftJoin(therapist, eq(therapist.id, appointments.practitionerId))
        // The clinic is the send's own copy, so it reads even where the visit does not.
        .leftJoin(locations, eq(locations.id, appointmentSurveySends.locationId))
        .leftJoin(sender, eq(sender.id, appointmentSurveySends.sentBy))
        .where(where)
        // Newest first; the id breaks ties so paging is stable.
        .orderBy(desc(appointmentSurveySends.sentAt), desc(appointmentSurveySends.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const rows: SurveyListEntry[] = found.map((r) => ({
        sendId: r.sendId,
        sentAt: r.sentAt,
        channel: r.channel,
        origin: r.origin,
        outcome: r.outcome,
        senderName: r.senderName,
        patientId: r.patientId,
        patientName: r.patientName,
        patientDeleted: r.patientDeletedAt !== null,
        visitStartsAt: r.visitStartsAt,
        therapistName: r.therapistName,
        clinicName: r.clinicName,
        answer:
          r.responseId !== null && r.nps !== null && r.rating !== null && r.submittedAt !== null
            ? {
                nps: r.nps,
                rating: r.rating,
                comment: r.comment,
                commentPurgedAt: r.commentPurgedAt,
                contactConsent: r.contactConsent === true,
                submittedAt: r.submittedAt,
              }
            : null,
      }));

      return { rows, total, page, pageSize, pageCount };
    },
    "db:survey-list",
  );
}
