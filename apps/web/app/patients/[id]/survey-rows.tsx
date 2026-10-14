import { getStrings, type Locale } from "@osteojp/i18n";

import type { SurveyListRowView } from "../../../lib/surveys/survey-list-core";

/**
 * SAT-01 (S11, spec 7.7, copy sections G and K) - this patient's survey sends
 * and answers, inside "Avaliações de satisfação" on the ficha.
 *
 * Newest first, one entry per send, with the list's own columns as labels:
 * visit, therapist, clinic, send, answer, then the answer itself. Not the
 * patient (this is their ficha) and not the channel: copy section G names the
 * columns and neither is among them.
 *
 * STACKED, NOT A TABLE. The Resumo column is narrow, and ten columns in it
 * would scroll sideways; the same labels read down the page instead.
 *
 * EVERY ROW ARRIVES ALREADY SELECTED under the viewer's own row policies and
 * FORMATTED on the server in Europe/Lisbon (`toSurveyListRow`), so this
 * component decides nothing and holds no answer the viewer may not read.
 *
 * A RESERVED ANSWER (copy text 81) takes the place of the answer's lines. A
 * send with no answer has no answer lines at all: "Sem resposta" says it.
 *
 * NO ROWS, TWO SENTENCES (strategy, Q-19, 2026-10-14). Only the owner reads
 * every send of the tenant (0102's policy), so only to the owner does an empty
 * read mean that none was sent (copy text 78). Anyone else is told that none
 * is visible to them (text 88): the app cannot tell "none exists" from "none
 * you may read" without asking the database something it does not answer.
 *
 * NO SEND BUTTON HERE YET. The spec puts "Enviar avaliação" and its status
 * line in this section (7.6); they arrive with the manual send, its own piece.
 */
export function SurveyRows({
  rows,
  locale,
  viewerIsOwner,
}: {
  rows: SurveyListRowView[];
  locale: Locale;
  /** The viewer's role is `owner`: the one role whose read is not narrowed. */
  viewerIsOwner: boolean;
}) {
  const s = getStrings(locale);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-secondary" data-testid="ficha-survey-rows-none">
        {viewerIsOwner ? s["patients.surveyRowsNone"] : s["patients.surveyRowsNoneVisible"]}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4" data-testid="ficha-survey-rows" aria-label={s["patients.surveySwitchTitle"]}>
      {rows.map((r, i) => (
        <li
          key={r.id}
          data-testid="ficha-survey-row"
          data-answer={r.answer}
          className={i > 0 ? "border-t border-border pt-4" : undefined}
        >
          <dl className="flex flex-col gap-2">
            <Line label={s["surveyList.colVisit"]} value={r.visit} />
            <Line label={s["surveyList.colTherapist"]} value={r.therapist} />
            <Line label={s["surveyList.colClinic"]} value={r.clinic} />
            <Line label={s["surveyList.colSend"]} value={r.send} />
            <Line label={s["surveyList.colAnswer"]} value={r.answerState} />
            {r.answer === "shown" && (
              <>
                <Line label={s["surveyList.colNps"]} value={r.nps} />
                <Line label={s["surveyList.colRating"]} value={r.rating} />
                <Line label={s["surveyList.colComment"]} value={r.comment} />
                <Line label={s["surveyList.colContact"]} value={r.contact} />
                <Line label={s["surveyList.colAnsweredAt"]} value={r.answeredAt} />
              </>
            )}
          </dl>
          {r.answer === "reserved" && (
            <p className="mt-2 text-body-sm text-text-secondary" data-testid="ficha-survey-answer-reserved">
              {s["surveyList.answerReserved"]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-sm text-text-secondary">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-right text-sm tabular-nums text-text-primary">
        {value}
      </dd>
    </div>
  );
}
