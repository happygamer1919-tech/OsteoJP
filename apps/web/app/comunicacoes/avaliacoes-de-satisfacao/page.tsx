import { notFound, redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { resolveViewerLocationIds } from "@/lib/auth/viewer-locations";
import { s } from "@/lib/i18n";
import { SURVEY_LIST_HREF, commsSectionsForRole } from "@/lib/nav/comms-sections";
import { surveyVisible } from "@/lib/reminders/survey-mode";
import { listSurveySends } from "@/lib/surveys/survey-list";
import { parseSurveyMonth, toSurveyListRow } from "@/lib/surveys/survey-list-core";

import { Pager } from "@/components/pager.client";
import { CommsNav } from "../comms-nav.client";
import { SurveyListMonthFilter } from "./survey-list-month.client";
import { SurveyListTable } from "./survey-list-table";

export const metadata = { title: s["surveyList.title"] };

function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * SAT-01 (spec 7.3, copy section F) - AVALIAÇÕES DE SATISFAÇÃO.
 *
 * WHILE THE SURVEY IS SWITCHED OFF THIS ADDRESS IS NOT THERE (owner,
 * 2026-10-12: staff see nothing new). It answers "not found" before it asks
 * who is looking, so a visit says the same thing to a signed-in member of staff
 * and to a stranger, and the section is in no menu to lead here
 * (comms-sections.ts).
 *
 * THE ROUTE IS GATED, and so is the query. A viewer without `surveys:read` is
 * redirected (the courtesy); `listSurveySends` asserts the capability and reads
 * under the viewer's own session, where migration 0102's policies decide which
 * sends and which answers come back (the boundary).
 *
 * NO SEND BUTTON HERE YET. The spec puts "Enviar avaliação" on each row (7.3,
 * 7.6); it arrives with the manual send, which is its own piece.
 */
export default async function AvaliacoesDeSatisfacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!surveyVisible()) notFound();

  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  if (!can(ctx.role, "surveys:read")) redirect("/");

  const sp = await searchParams;
  const month = parseSurveyMonth(firstParam(sp.mes));
  const pageRaw = Number(firstParam(sp.page) ?? "1");
  const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const list = await listSurveySends(ctx, { page: requestedPage, month: month?.value ?? null });
  const rows = list.rows.map(toSurveyListRow);
  // Admin and reception read the sends of their own clinics (0102's policy), so
  // with no clinic assignment the list is empty whatever was sent, and the page
  // says why (copy text 87). Asked only when there is nothing to show. A
  // therapist's reads follow the patients they treat, not a clinic, and the
  // owner reads everything: neither is ever told this.
  const noClinic =
    rows.length === 0 &&
    (ctx.role === "admin" || ctx.role === "reception") &&
    (await resolveViewerLocationIds(ctx)).length === 0;

  const commsSections = commsSectionsForRole(ctx.role);

  return (
    <div className="flex flex-col gap-6 p-6">
      {commsSections.length > 1 && (
        <CommsNav
          items={commsSections.map(({ href, label }) => ({ href, label }))}
          label={s["comms.sectionsLabel"]}
        />
      )}
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold text-v2-text-primary">{s["surveyList.title"]}</h1>
          <p className="mt-1 max-w-3xl text-sm text-v2-text-secondary">{s["surveyList.subtitle"]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SurveyListMonthFilter initialMonth={month?.value ?? ""} />
        </div>

        <SurveyListTable rows={rows} filtered={month !== null} noClinic={noClinic} />

        <Pager
          basePath={SURVEY_LIST_HREF}
          params={month ? { mes: month.value } : {}}
          page={list.page}
          pageCount={list.pageCount}
          total={list.total}
        />
      </section>
    </div>
  );
}
