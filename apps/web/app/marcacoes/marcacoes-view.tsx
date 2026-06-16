"use client";

import {
  DatePicker,
  EmptyState,
  GlassCard,
  GlassPanel,
  Select,
  StatusBadge,
} from "@osteojp/ui";
import type { AppointmentTone } from "@osteojp/ui";
import { CalendarClock, Repeat, TriangleAlert, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { s } from "@/lib/i18n";
import { intervalsOverlap } from "@/lib/scheduling/overlap";
import {
  formatAnchorLabel,
  formatTimeOfDay,
  lisbonParts,
  todayInLisbon,
} from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AgendaOptions,
  AppointmentStatusValue,
} from "@/lib/scheduling/types";

type StringKey = keyof typeof s;

export type MarcacoesFilters = {
  from: string;
  to: string;
  practitionerId: string | null;
  locationId: string | null;
  /** Presentation-only (client-side); not an Agenda query field. */
  status: string | null;
  /** Presentation-only (client-side); service accent or "other". */
  service: string | null;
};

// v2 glass toolbar idiom — mirrors the agenda toolbar controls.

/* ------------------------------------------------------------------ */
/* Service category → v2 accent (SPEC-v2-marcacoes §2.1 / SPEC-v2-agenda */
/* §2.1). Mirrors agenda-grid.tsx: the five categories are the complete  */
/* colour-coded set; anything else is the neutral "Outros serviços"      */
/* fallback. GlassStatusChip carries only semantic tones, so the service */
/* chip is an in-route token pill (foundation follow-up Q-V2W7-1) — the   */
/* same tint tokens as the agenda cards.                                  */
/* ------------------------------------------------------------------ */
type ServiceAccent = "green" | "lavender" | "gold" | "blue" | "burgundy";

const SERVICE_ORDER: ServiceAccent[] = [
  "green",
  "lavender",
  "gold",
  "blue",
  "burgundy",
];

// 100 fill + 200 hairline with v2-text-primary label (≥11:1 on every 100 tint),
// so AA never depends on the accent (§2.1 / §3.4).
const SERVICE_TINT: Record<ServiceAccent, string> = {
  green: "bg-v2-green-100 border-v2-green-200",
  lavender: "bg-v2-lavender-100 border-v2-lavender-200",
  gold: "bg-v2-gold-100 border-v2-gold-200",
  blue: "bg-v2-blue-100 border-v2-blue-200",
  burgundy: "bg-v2-burgundy-100 border-v2-burgundy-200",
};

const SERVICE_LABEL: Record<ServiceAccent, StringKey> = {
  green: "agenda.serviceMassagemTerapeutica",
  lavender: "agenda.serviceMassagemRelaxamento",
  gold: "agenda.serviceDrenagemLinfatica",
  blue: "agenda.serviceMassagemDesportiva",
  burgundy: "agenda.serviceOsteopatia",
};

/** Match a service name (accent- and case-insensitive) to its colour category. */
function serviceAccent(name: string | null): ServiceAccent | null {
  if (!name) return null;
  const n = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (n.startsWith("osteopat")) return "burgundy";
  if (n.includes("drenagem linfatica")) return "gold";
  if (n.includes("massagem desportiva")) return "blue";
  if (n.includes("massagem relaxamento") || n.includes("massagem de relaxamento"))
    return "lavender";
  if (n.includes("massagem terapeutica")) return "green";
  return null;
}

/* ------------------------------------------------------------------ */
/* Conflict detection — mirrors agenda-grid.tsx exactly, reusing the    */
/* shared intervalsOverlap. Computed over the full fetched window so a   */
/* conflict shows even if its partner is filtered out of the view.       */
/* ------------------------------------------------------------------ */
function sameRoom(a: AgendaAppointment, b: AgendaAppointment): boolean {
  const ra = a.room?.trim().toLowerCase();
  const rb = b.room?.trim().toLowerCase();
  return !!ra && !!rb && ra === rb && a.locationId === b.locationId;
}

function conflictingIds(appts: AgendaAppointment[]): Set<string> {
  const flagged = new Set<string>();
  for (let i = 0; i < appts.length; i++) {
    for (let j = i + 1; j < appts.length; j++) {
      const a = appts[i]!;
      const b = appts[j]!;
      if (a.status === "cancelled" || b.status === "cancelled") continue;
      if (a.practitionerId !== b.practitionerId && !sameRoom(a, b)) continue;
      if (
        intervalsOverlap(
          new Date(a.startsAt),
          new Date(a.endsAt),
          new Date(b.startsAt),
          new Date(b.endsAt),
        )
      ) {
        flagged.add(a.id);
        flagged.add(b.id);
      }
    }
  }
  return flagged;
}

/* ------------------------------------------------------------------ */
/* Status (DB enum) → StatusBadge tone + label. completed reads as a    */
/* positive terminal state (green); no_show as neutral, never red (§10). */
/* ------------------------------------------------------------------ */
const STATUS_VALUES: AppointmentStatusValue[] = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];
const STATUS_TONE: Record<AppointmentStatusValue, AppointmentTone> = {
  scheduled: "pending",
  confirmed: "confirmed",
  completed: "confirmed",
  cancelled: "cancelled",
  no_show: "cancelled",
};
const STATUS_KEY: Record<AppointmentStatusValue, StringKey> = {
  scheduled: "appointment.status.scheduled",
  confirmed: "appointment.status.confirmed",
  completed: "appointment.status.completed",
  cancelled: "appointment.status.cancelled",
  no_show: "appointment.status.no_show",
};

function ServiceChip({ name, cancelled }: { name: string | null; cancelled: boolean }) {
  if (!name) return null;
  const accent = cancelled ? null : serviceAccent(name);
  const tint = accent ? SERVICE_TINT[accent] : "bg-v2-surface border-v2-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-v2-text-primary ${tint}`}
    >
      {name}
    </span>
  );
}

function AppointmentRow({
  appt,
  conflicting,
}: {
  appt: AgendaAppointment;
  conflicting: boolean;
}) {
  const cancelled = appt.status === "cancelled";
  const recurring = !!(appt.recurrenceRule || appt.recurrenceParentId);
  return (
    <GlassCard
      className={conflicting ? "ring-1 ring-warning" : undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
        {/* Date/time (24h Lisbon), mirroring the agenda block format. */}
        <span className="shrink-0 text-sm tabular-nums text-v2-text-primary sm:w-28">
          {formatTimeOfDay(new Date(appt.startsAt))}-{formatTimeOfDay(new Date(appt.endsAt))}
        </span>

        {/* Patient. */}
        <span
          className={`flex min-w-0 items-center gap-1 text-sm font-medium sm:flex-1 ${
            cancelled ? "text-v2-text-secondary line-through" : "text-v2-text-primary"
          }`}
        >
          <User size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
          {recurring && (
            <Repeat
              size={14}
              strokeWidth={1.75}
              aria-label={s["appointment.recurring"]}
              className="shrink-0 text-v2-text-secondary"
            />
          )}
          <span className="truncate">{appt.patientName}</span>
        </span>

        {/* Service. */}
        <ServiceChip name={appt.serviceName} cancelled={cancelled} />

        {/* Location + therapist. */}
        <span className="text-xs text-v2-text-secondary">{appt.locationName}</span>
        <span className="text-xs text-v2-text-secondary">{appt.practitionerName}</span>

        {/* Conflict marker, consistent with the agenda (warning tone, not red). */}
        {conflicting && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-700">
            <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
            {s["agenda.conflict"]}
          </span>
        )}

        {/* Status. */}
        <span className="sm:ml-auto">
          <StatusBadge tone={STATUS_TONE[appt.status]}>
            {s[STATUS_KEY[appt.status]]}
          </StatusBadge>
        </span>
      </div>
    </GlassCard>
  );
}

export function MarcacoesView({
  filters,
  lockTherapist,
  options,
  appointments,
}: {
  filters: MarcacoesFilters;
  lockTherapist: boolean;
  options: AgendaOptions;
  appointments: AgendaAppointment[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function navigate(next: Partial<MarcacoesFilters>) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    params.set("from", merged.from);
    params.set("to", merged.to);
    if (merged.practitionerId && !lockTherapist)
      params.set("therapist", merged.practitionerId);
    if (merged.locationId) params.set("location", merged.locationId);
    if (merged.status) params.set("status", merged.status);
    if (merged.service) params.set("service", merged.service);
    startTransition(() => router.push(`/marcacoes?${params.toString()}`));
  }

  // Conflicts are computed over the full fetched window (before the
  // presentation filters), exactly as the agenda runs them.
  const conflicts = conflictingIds(appointments);
  const today = todayInLisbon();

  // Presentation-only filters (Status / Serviço) over the fetched window.
  const visible = appointments.filter((a) => {
    if (filters.status && a.status !== filters.status) return false;
    if (filters.service) {
      const acc = serviceAccent(a.serviceName);
      if (filters.service === "other") {
        if (!(a.serviceName != null && acc === null)) return false;
      } else if (acc !== filters.service) {
        return false;
      }
    }
    return true;
  });

  // Group chronologically by Lisbon day, preserving the query's asc order.
  const groups: { date: string; items: AgendaAppointment[] }[] = [];
  const byDate = new Map<string, AgendaAppointment[]>();
  for (const a of visible) {
    const d = lisbonParts(new Date(a.startsAt)).date;
    let list = byDate.get(d);
    if (!list) {
      list = [];
      byDate.set(d, list);
      groups.push({ date: d, items: list });
    }
    list.push(a);
  }

  return (
    <main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl text-v2-text-primary">{s["marcacoes.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["marcacoes.subtitle"]}</p>
      </div>

      {/* Filters (SPEC-v2-marcacoes §1.2): date range, location, status,
          service, therapist. Self-contained glass bar. */}
      <div className="glass-nav flex flex-wrap items-end gap-3 rounded-v2 px-4 py-3 shadow-v2-float">
        <div className="flex items-center gap-2">
          <div className="w-40">
            <DatePicker
              value={filters.from}
              max={filters.to}
              onChange={(d) => navigate({ from: d })}
              triggerLabel={s["marcacoes.filterDateFrom"]}
            />
          </div>
          <span className="text-sm text-v2-text-secondary">{s["marcacoes.dateTo"]}</span>
          <div className="w-40">
            <DatePicker
              value={filters.to}
              min={filters.from}
              onChange={(d) => navigate({ to: d })}
              triggerLabel={s["marcacoes.filterDateTo"]}
            />
          </div>
        </div>

        <div className="w-56">
          <Select
            aria-label={s["header.location"]}
            value={filters.locationId ?? ""}
            onChange={(e) => navigate({ locationId: e.target.value || null })}
          >
            <option value="">{s["agenda.allLocations"]}</option>
            {options.locations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-48">
          <Select
            aria-label={s["marcacoes.filterStatus"]}
            value={filters.status ?? ""}
            onChange={(e) => navigate({ status: e.target.value || null })}
          >
            <option value="">{s["marcacoes.allStatuses"]}</option>
            {STATUS_VALUES.map((v) => (
              <option key={v} value={v}>
                {s[STATUS_KEY[v]]}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-48">
          <Select
            aria-label={s["marcacoes.filterService"]}
            value={filters.service ?? ""}
            onChange={(e) => navigate({ service: e.target.value || null })}
          >
            <option value="">{s["marcacoes.allServices"]}</option>
            {SERVICE_ORDER.map((a) => (
              <option key={a} value={a}>
                {s[SERVICE_LABEL[a]]}
              </option>
            ))}
            <option value="other">{s["agenda.serviceOther"]}</option>
          </Select>
        </div>

        {!lockTherapist && (
          <div className="w-56">
            <Select
              aria-label={s["agenda.filterTherapists"]}
              value={filters.practitionerId ?? ""}
              onChange={(e) => navigate({ practitionerId: e.target.value || null })}
            >
              <option value="">{s["agenda.allTherapists"]}</option>
              {options.therapists.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <GlassPanel>
          <EmptyState
            icon={CalendarClock}
            title={s["marcacoes.emptyTitle"]}
            description={s["marcacoes.emptyHelp"]}
          />
        </GlassPanel>
      ) : (
        <GlassPanel>
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <section key={g.date}>
                <h2
                  className={`mb-3 text-sm font-medium ${
                    g.date === today ? "text-v2-green-700" : "text-v2-text-secondary"
                  }`}
                >
                  {formatAnchorLabel("day", g.date)}
                </h2>
                <div className="flex flex-col gap-3">
                  {g.items.map((a) => (
                    <AppointmentRow key={a.id} appt={a} conflicting={conflicts.has(a.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </GlassPanel>
      )}
    </main>
  );
}
