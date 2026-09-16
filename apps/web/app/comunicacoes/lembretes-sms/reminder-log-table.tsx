"use client";

import Link from "next/link";
import { EmptyState, StatusChip, Table, type TableColumn } from "@osteojp/ui";
import { MessagesSquare } from "lucide-react";

import { s } from "@/lib/i18n";

/**
 * COMMS-01 - the Lembretes SMS table. CLIENT ONLY because `Table` takes cell
 * functions, which cannot cross the server boundary. Every row arrives already
 * selected, scoped, paged and FORMATTED on the server in Europe/Lisbon, so this
 * component decides nothing and formats no date.
 */
export type ReminderLogRowView = {
  id: string;
  patientId: string;
  patientName: string;
  appointmentWhen: string;
  appointmentWho: string;
  channel: string;
  kind: string;
  scheduledFor: string;
  sentAt: string;
  statusLabel: string;
  statusTone: "success" | "neutral" | "warning" | "error";
  errorCode: string;
  phone: string;
};

export function ReminderLogTable({
  rows,
  onlyFailures,
  searching,
}: {
  rows: ReminderLogRowView[];
  onlyFailures: boolean;
  /** COMMS-03: a name search is applied, so an empty table means "nobody by that name". */
  searching: boolean;
}) {
  const columns: Array<TableColumn<ReminderLogRowView>> = [
    {
      key: "patient",
      header: s["remindersLog.colPatient"],
      cell: (r) => (
        <Link
          href={`/patients/${r.patientId}`}
          className="font-medium text-v2-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {r.patientName}
        </Link>
      ),
    },
    {
      key: "appointment",
      header: s["remindersLog.colAppointment"],
      cell: (r) => (
        <span className="flex flex-col">
          <span className="tabular-nums">{r.appointmentWhen}</span>
          <span className="text-xs text-v2-text-secondary">{r.appointmentWho}</span>
        </span>
      ),
    },
    { key: "channel", header: s["remindersLog.colChannel"], cell: (r) => r.channel },
    { key: "kind", header: s["remindersLog.colKind"], cell: (r) => r.kind },
    {
      key: "scheduledFor",
      header: s["remindersLog.colScheduledFor"],
      cell: (r) => <span className="tabular-nums">{r.scheduledFor}</span>,
    },
    {
      key: "sentAt",
      header: s["remindersLog.colSentAt"],
      cell: (r) => <span className="tabular-nums">{r.sentAt}</span>,
    },
    {
      key: "status",
      header: s["remindersLog.colStatus"],
      cell: (r) => <StatusChip tone={r.statusTone}>{r.statusLabel}</StatusChip>,
    },
    {
      key: "errorCode",
      header: s["remindersLog.colErrorCode"],
      cell: (r) => <span className="tabular-nums">{r.errorCode}</span>,
    },
    {
      key: "phone",
      header: s["remindersLog.colPhone"],
      cell: (r) => <span className="tabular-nums">{r.phone}</span>,
    },
  ];

  return (
    <Table
      columns={columns}
      data={rows}
      rowKey={(r) => r.id}
      caption={s["remindersLog.tableCaption"]}
      state={rows.length === 0 ? "empty" : "ready"}
      empty={
        <EmptyState
          icon={MessagesSquare}
          title={
            searching
              ? onlyFailures
                ? s["remindersLog.emptySearchFailures"]
                : s["remindersLog.emptySearch"]
              : onlyFailures
                ? s["remindersLog.emptyFailures"]
                : s["remindersLog.empty"]
          }
        />
      }
    />
  );
}
