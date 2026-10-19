import "server-only";
import { can } from "@osteojp/auth";

import { surveyVisible } from "@/lib/reminders/survey-mode";
import { listSurveySends } from "@/lib/surveys/survey-list";
import type { SurveyListEntry } from "@/lib/surveys/survey-list-core";

import type { RequestContext } from "../auth/context";

// SAT-01 (S11, spec 7.7) - one patient's survey sends and answers, for the
// "Avaliações de satisfação" section of the ficha.
//
// THE READ IS THE LIST'S, NOT A SECOND ONE. `listSurveySends` is what
// Comunicações reads: in the viewer's own session, where migration 0102's two
// SELECT policies decide which sends and which answers come back. This file
// asks it for one patient and adds no rule of its own about who reads what, so
// the ficha and the list cannot disagree. A send whose answer the viewer may
// not read arrives saying `answered` with no answer, and the ficha names it
// (copy text 81) exactly as the list does.
//
// NO ROWS IS NOT THE SAME AS NO SECTION.
//
//   null   the viewer is not offered the section: the survey is switched off
//          (staff see nothing of it, owner 2026-10-12), or the role does not
//          hold `surveys:read`. Nothing is read from the database.
//   []     the section is there and the viewer reads no send of this patient.
//
// ALL OF THE PATIENT'S SENDS, NOT ONE PAGE OF THEM. The ficha has no pager, so
// the pages of the list are read until the last. One patient's sends are few
// (at most one automatic send in 60 days), so this is one page in practice.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readPatientSurveyRows(
  ctx: RequestContext,
  patientId: string,
): Promise<SurveyListEntry[] | null> {
  if (!surveyVisible()) return null;
  if (!can(ctx.role, "surveys:read")) return null;
  if (!UUID.test(patientId)) return null;

  const rows: SurveyListEntry[] = [];
  let page = 1;
  for (;;) {
    const got = await listSurveySends(ctx, { patientId, page });
    rows.push(...got.rows);
    // `got.page` is the page the read settled on: it never passes the last one.
    if (got.page >= got.pageCount) break;
    page = got.page + 1;
  }
  return rows;
}
