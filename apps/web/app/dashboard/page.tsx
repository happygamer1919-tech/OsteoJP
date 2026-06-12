import { can } from "@osteojp/auth";
import { patients } from "@osteojp/db";
import {
  EmptyState,
  KpiCard,
  StatusChip,
  Table,
  type StatusTone,
  type TableColumn,
} from "@osteojp/ui";
import { sql } from "drizzle-orm";
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestContext, runScoped } from "@/lib/auth/context";
import { s } from "@/lib/i18n";
import { activePatientsOnly } from "@/lib/patients/filters";
import { listAppointments } from "@/lib/scheduling/data";
import { addDays, lisbonMidnightUtc, todayInLisbon } from "@/lib/scheduling/time";
import type { AgendaAppointment } from "@/lib/scheduling/types";

import { DateJump } from "./date-jump";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_TONE: Record<AgendaAppointment["status"], StatusTone> = {
  scheduled: "warning",
  confirmed: "success",
  completed: "info",
  cancelled: "neutral",
  no_show: "error",
};
const STATUS_KEY = {
  scheduled: "appointment.status.scheduled",
  confirmed: "appointment.status.confirmed",
  completed: "appointment.status.completed",
  cancelled: "appointment.status.cancelled",
  no_show: "appointment.status.no_show",
} as const;

const timeFmt = new Intl.DateTimeFormat("pt-PT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Lisbon",
});

const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const iconLink =
  "inline-flex size-10 items-center justify-center rounded-md border border-border-strong bg-surface text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const ghostLink =
  "inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/**
 * Dashboard (SPEC-staff-screens §3): "Resumo do dia". Presentation only — KPI
 * from the existing patient-count query, today's appointments from the existing
 * RLS + role-scoped listAppointments. No new metrics or endpoints.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const raw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const date = raw && DATE_RE.test(raw) ? raw : todayInLisbon();

  const countRows = await runScoped(ctx, (tx) =>
    tx
      .select({ count: sql<number>`count(*)::int` })
      .from(patients)
      .where(activePatientsOnly),
  );
  const patientCount = countRows[0]?.count ?? 0;

  const appointments = can(ctx.role, "appointments:read")
    ? await listAppointments(ctx, {
        startUtc: lisbonMidnightUtc(date),
        endUtc: lisbonMidnightUtc(addDays(date, 1)),
      })
    : [];

  const isTherapist = ctx.role === "therapist";
  const today = todayInLisbon();
  const addHref = `/agenda?date=${date}`;

  const therapistCol: TableColumn<AgendaAppointment> = {
    key: "therapist",
    header: s["dashboard.colTherapist"],
    cell: (a) => a.practitionerName,
  };
  const columns: Array<TableColumn<AgendaAppointment>> = [
    {
      key: "time",
      header: s["dashboard.colTime"],
      cell: (a) => (
        <span className={a.status === "cancelled" ? "text-text-muted line-through" : undefined}>
          {timeFmt.format(new Date(a.startsAt))}
        </span>
      ),
    },
    {
      key: "patient",
      header: s["dashboard.colPatient"],
      cell: (a) => <span className="font-medium text-text-primary">{a.patientName}</span>,
    },
    { key: "service", header: s["dashboard.colService"], cell: (a) => a.serviceName ?? "—" },
    ...(isTherapist ? [] : [therapistCol]),
    {
      key: "status",
      header: s["dashboard.colStatus"],
      align: "right",
      cell: (a) => (
        <StatusChip tone={STATUS_TONE[a.status]} dot>
          {s[STATUS_KEY[a.status]]}
        </StatusChip>
      ),
    },
  ];

  return (
    <main>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl text-text-primary">{s["dashboard.title"]}</h1>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard?date=${addDays(date, -1)}`} aria-label={s["dashboard.prevDay"]} className={iconLink}>
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <DateJump date={date} label={s["dashboard.pickDate"]} />
          <Link href={`/dashboard?date=${today}`} className={ghostLink}>
            {s["agenda.today"]}
          </Link>
          <Link href={`/dashboard?date=${addDays(date, 1)}`} aria-label={s["dashboard.nextDay"]} className={iconLink}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={s["dashboard.kpiActivePatients"]} value={patientCount} />
      </div>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl text-text-primary">{s["dashboard.appointments"]}</h2>
          <Link href={addHref} className={primaryLink}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {s["dashboard.add"]}
          </Link>
        </div>

        {appointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={s["dashboard.empty.title"]}
            description={s["dashboard.empty.help"]}
            heritage
            action={
              <Link href={addHref} className={primaryLink}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                {s["dashboard.add"]}
              </Link>
            }
          />
        ) : (
          <Table
            caption={s["dashboard.tableCaption"]}
            columns={columns}
            data={appointments}
            rowKey={(a) => a.id}
            getRowHref={() => addHref}
            getRowLabel={(a) => `${s["dashboard.openAppointment"]}: ${a.patientName}`}
          />
        )}
      </section>
    </main>
  );
}
