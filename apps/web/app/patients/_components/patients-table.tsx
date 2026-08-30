"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { EmptyState, StatusChip, Table, type TableColumn, type TableSort } from "@osteojp/ui";
import { Users } from "lucide-react";

import { s } from "@/lib/i18n";

/**
 * UX-01 - the patients table. CLIENT ONLY BECAUSE `Table` TAKES AN
 * `onSortChange` CALLBACK; every row it renders was selected, ordered, filtered
 * and paged on the server.
 *
 * THE ROWS ARE ALREADY FORMATTED. Dates arrive as pt-PT strings rendered on the
 * server in Europe/Lisbon. A `Date` formatted in the browser renders in the
 * BROWSER's timezone, which for a clinic in Lisbon read on a laptop still set to
 * another zone is wrong by an hour twice a year and wrong by a day at the edges,
 * silently, because a date is always plausible. Same rule as /recuperacao.
 */

export type PatientRowView = {
  id: string;
  number: string;
  fullName: string;
  nif: string;
  phone: string;
  location: string;
  lastVisit: string;
  nextAppointment: string;
  hasUpcoming: boolean;
};

export function PatientsTable({
  rows,
  sort,
  dir,
  filtered,
}: {
  rows: PatientRowView[];
  sort: "name" | "lastVisit";
  dir: "asc" | "desc";
  filtered: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onSortChange(next: TableSort) {
    const sp = new URLSearchParams(params.toString());
    sp.set("sort", next.key);
    sp.set("dir", next.direction);
    sp.delete("page"); // a re-sort starts at the top, not at page 7 of the old order
    startTransition(() => router.push(`/patients?${sp}`));
  }

  const columns: Array<TableColumn<PatientRowView>> = [
    {
      key: "number",
      header: s["patients.colNumber"],
      align: "right",
      cell: (r) => <span className="tabular-nums text-v2-text-secondary">{r.number}</span>,
    },
    {
      key: "name",
      header: s["patients.colPatient"],
      sortable: true,
      cell: (r) => (
        <Link
          href={`/patients/${r.id}`}
          className="font-medium text-v2-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {r.fullName}
        </Link>
      ),
    },
    { key: "nif", header: s["patients.colNif"], cell: (r) => <span className="tabular-nums">{r.nif}</span> },
    { key: "phone", header: s["patients.colPhone"], cell: (r) => <span className="tabular-nums">{r.phone}</span> },
    { key: "location", header: s["patients.colLocation"], cell: (r) => r.location },
    {
      key: "lastVisit",
      header: s["patients.colLastVisit"],
      sortable: true,
      cell: (r) => <span className="tabular-nums">{r.lastVisit}</span>,
    },
    {
      key: "next",
      header: s["patients.colNextAppointment"],
      cell: (r) =>
        r.hasUpcoming ? (
          <StatusChip tone="success">{r.nextAppointment}</StatusChip>
        ) : (
          <span className="text-v2-text-secondary">{r.nextAppointment}</span>
        ),
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      caption={s["patients.tableCaption"]}
      state={rows.length === 0 ? "empty" : "ready"}
      sort={{ key: sort === "name" ? "name" : "lastVisit", direction: dir }}
      onSortChange={onSortChange}
      empty={
        <EmptyState
          icon={Users}
          title={filtered ? s["patients.noResultsTitle"] : s["patients.emptyTitle"]}
          description={filtered ? s["patients.noResults"] : s["patients.emptyHelp"]}
        />
      }
    />
  );
}
