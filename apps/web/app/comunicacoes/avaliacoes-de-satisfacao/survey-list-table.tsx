"use client";

import Link from "next/link";
import { EmptyState, StatusChip, Table, type TableColumn } from "@osteojp/ui";
import { ClipboardList } from "lucide-react";

import { s } from "@/lib/i18n";
import type { SurveyListRowView } from "@/lib/surveys/survey-list-core";

/**
 * SAT-01 - the Avaliações de satisfação table. CLIENT ONLY because `Table`
 * takes cell functions, which cannot cross the server boundary. Every row
 * arrives already selected under the viewer's own row policies, paged and
 * FORMATTED on the server in Europe/Lisbon, so this component decides nothing,
 * formats no date and holds no answer the viewer may not read.
 *
 * A RESERVED ANSWER (copy text 81) takes the place of the answer's cells: the
 * sentence stands in the first of them and the others are empty. The send's
 * own cells (the send, whether it was answered, the channel) are not part of
 * the answer and always show.
 */
export function SurveyListTable({
  rows,
  filtered,
  noClinic = false,
}: {
  rows: SurveyListRowView[];
  /** A month is chosen, so an empty table means "none that month", not "none ever". */
  filtered: boolean;
  /** Admin or reception with no clinic assignment: the database gives them no send to read. */
  noClinic?: boolean;
}) {
  const columns: Array<TableColumn<SurveyListRowView>> = [
    {
      key: "visit",
      header: s["surveyList.colVisit"],
      cell: (r) => <span className="tabular-nums">{r.visit}</span>,
    },
    {
      key: "patient",
      header: s["surveyList.colPatient"],
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium text-v2-text-primary">{r.patientName}</span>
          {r.patientHref && (
            <Link
              href={r.patientHref}
              className="text-xs text-v2-text-secondary underline underline-offset-2 hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {s["surveyList.openPatient"]}
            </Link>
          )}
        </span>
      ),
    },
    { key: "therapist", header: s["surveyList.colTherapist"], cell: (r) => r.therapist },
    { key: "clinic", header: s["surveyList.colClinic"], cell: (r) => r.clinic },
    {
      key: "send",
      header: s["surveyList.colSend"],
      cell: (r) => <span className="tabular-nums">{r.send}</span>,
    },
    {
      key: "answer",
      header: s["surveyList.colAnswer"],
      cell: (r) => <StatusChip tone={r.answer === "open" ? "neutral" : "success"}>{r.answerState}</StatusChip>,
    },
    {
      key: "nps",
      header: s["surveyList.colNps"],
      cell: (r) =>
        r.answer === "reserved" ? (
          <span data-testid="survey-answer-reserved" className="block min-w-64 max-w-sm text-xs text-v2-text-secondary">
            {s["surveyList.answerReserved"]}
          </span>
        ) : (
          <span className="tabular-nums">{r.nps}</span>
        ),
    },
    {
      key: "rating",
      header: s["surveyList.colRating"],
      cell: (r) => <span className="tabular-nums">{r.rating}</span>,
    },
    {
      key: "comment",
      header: s["surveyList.colComment"],
      cell: (r) => <span className="block max-w-sm whitespace-pre-wrap break-words">{r.comment}</span>,
    },
    { key: "contact", header: s["surveyList.colContact"], cell: (r) => r.contact },
    { key: "channel", header: s["surveyList.colChannel"], cell: (r) => r.channel },
    {
      key: "answeredAt",
      header: s["surveyList.colAnsweredAt"],
      cell: (r) => <span className="tabular-nums">{r.answeredAt}</span>,
    },
  ];

  // AN EMPTY LIST SAYS WHY, AND NEVER MORE THAN IS TRUE (strategy, 2026-10-14).
  // Text 54 says no survey has ever been sent, so it is said only when nothing
  // narrows the read: not for a chosen month (text 86: none that month), and
  // not to admin or reception with no clinic, whose reads the database narrows
  // to nothing (text 87: the reason, and what to do). No clinic comes first:
  // for them every month is empty for the same reason.
  const empty =
    rows.length > 0 ? null : noClinic ? (
      <EmptyState icon={ClipboardList} title={s["surveyList.noClinic"]} />
    ) : filtered ? (
      <EmptyState icon={ClipboardList} title={s["surveyList.emptyMonth"]} />
    ) : (
      <EmptyState icon={ClipboardList} title={s["surveyList.empty"]} description={s["surveyList.emptyHint"]} />
    );

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      caption={s["surveyList.title"]}
      state={empty ? "empty" : "ready"}
      empty={empty}
    />
  );
}
