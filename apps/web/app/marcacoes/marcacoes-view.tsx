"use client";

import {
  DatePicker,
  EmptyState,
  GlassCard,
  GlassPanel,
  Input,
  Select,
  StatusBadge,
  StatusChip,
  ToastProvider,
} from "@osteojp/ui";
import type { AppointmentTone } from "@osteojp/ui";
import { CalendarClock, Repeat, Search, TriangleAlert, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { s } from "@/lib/i18n";
import { deriveEstado, estadoStrikesName } from "@/lib/scheduling/estado";
import { matchesSearch } from "@/lib/search/text-filter";
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
import { AppointmentHoverCard } from "../agenda/appointment-hover-card";
import { EstadoMarker } from "../agenda/estado-marker";
// W12-00: the marcacoes list row reuses the SAME appointment manage surface the
// agenda card opens - the AppointmentDrawer in edit mode and its existing server
// actions (updateAppointment / rescheduleAppointment / cancelAppointment /
// cloneAppointment). No parallel edit path, no schema change: the list row was
// the only appointment surface with no open/edit affordance (CB GRAVE).
import { AppointmentDrawer, type ModalState } from "../agenda/appointment-drawer";

type StringKey = keyof typeof s;

export type MarcacoesFilters = {
  from: string;
  to: string;
  practitionerId: string | null;
  locationId: string | null;
  /** Presentation-only (client-side); not an Agenda query field. */
  status: string | null;
  /** Presentation-only (client-side); a tenant service id (W6-01b), or null. */
  service: string | null;
};

/** A tenant service the Serviço filter offers (W6-01b: data-driven, DB-sourced).
 *  Filters include INACTIVE services, so this list is the full listServices set. */
export type ServiceFilterOption = { id: string; name: string };

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

// 100 fill + 200 hairline with v2-text-primary label (≥11:1 on every 100 tint),
// so AA never depends on the accent (§2.1 / §3.4). Presentation only: this is
// the fixed colour-tint palette for the KNOWN colour-coded service names. The
// Serviço FILTER options are NOT sourced from here (W6-01b): they come from the
// tenant's real services via listServices; any service outside this palette
// renders with the neutral tint below.
const SERVICE_TINT: Record<ServiceAccent, string> = {
  green: "bg-v2-green-100 border-v2-green-200",
  lavender: "bg-v2-lavender-100 border-v2-lavender-200",
  gold: "bg-v2-gold-100 border-v2-gold-200",
  blue: "bg-v2-blue-100 border-v2-blue-200",
  burgundy: "bg-v2-burgundy-100 border-v2-burgundy-200",
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
  onOpen,
}: {
  appt: AgendaAppointment;
  conflicting: boolean;
  /** W12-00: opens this marcacao in the shared AppointmentDrawer (edit mode). */
  onOpen: (appt: AgendaAppointment) => void;
}) {
  // W12-11 R10: the estado drives the leading glyph + the name strikethrough
  // (Falta only). `cancelled` still de-emphasises the service chip below.
  const cancelled = appt.status === "cancelled";
  const estado = deriveEstado(appt.status, appt.confirmationState);
  const struck = estadoStrikesName(estado);
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

        {/* Patient, led by the estado glyph. */}
        <span
          className={`flex min-w-0 items-center gap-1 text-sm font-medium sm:flex-1 ${
            struck ? "text-v2-text-secondary line-through" : "text-v2-text-primary"
          }`}
        >
          <EstadoMarker estado={estado} />
          <User size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-v2-text-secondary" />
          {recurring && (
            <>
              <Repeat
                size={14}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 text-v2-text-secondary"
              />
              <span className="sr-only">{s["appointment.recurring"]}</span>
            </>
          )}
          <span className="truncate">{appt.patientName}</span>
        </span>

        {/* Service. */}
        <ServiceChip name={appt.serviceName} cancelled={cancelled} />

        {/* Location + therapist. */}
        <span className="text-xs text-v2-text-secondary">{appt.locationName}</span>
        <span className="text-xs text-v2-text-secondary">{appt.practitionerName}</span>

        {/* Audit provenance (W9-06, item 10): who created the marcacao. NULL
            createdByName = a portal booking, shown as the owner-ruled label, never
            blank. Compact form on the list (creator only); the full created-at
            timestamp is on the detail drawer. */}
        <span className="text-xs text-v2-text-secondary">
          {s["appointment.createdBy"]}: {appt.createdByName ?? s["appointment.createdByPortal"]}
        </span>

        {/* W10-05: the shared unified hover popup (mini-dashboard), replacing the
            W9-06 note-only NoteHoverCard. The SAME AppointmentHoverPanel the agenda
            card renders; staff-only (the portal never imports it). Shown on hover
            AND keyboard focus of its trigger. */}
        <AppointmentHoverCard appt={appt} />

        {/* Conflict marker, consistent with the agenda (warning tone, not red). */}
        {conflicting && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-700">
            <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
            {s["agenda.conflict"]}
          </span>
        )}

        {/* Status + no-note indicator. */}
        <span className="flex items-center gap-2 sm:ml-auto">
          {appt.status === "completed" && !appt.hasNote && (
            <StatusChip tone="warning">{s["appointment.noNote"]}</StatusChip>
          )}
          <StatusBadge tone={STATUS_TONE[appt.status]}>
            {s[STATUS_KEY[appt.status]]}
          </StatusBadge>
        </span>

        {/* W12-00 (CB GRAVE): the row's open/edit affordance. Before this loop the
            /marcacoes rows were inert display cards with no way to open or edit a
            marcacao (edit lived only on the agenda card + the patient Consultas
            tab). A real, keyboard-focusable button (never the whole GlassCard,
            which would nest the hover trigger's role="button" - GlassCard's own
            interactive contract forbids nested interactive children) opens the
            SAME AppointmentDrawer in edit mode. The aria-label carries the patient
            name so screen readers disambiguate one row's control from the next. */}
        <button
          type="button"
          onClick={() => onOpen(appt)}
          aria-label={`${s["marcacoes.openAppointment"]}: ${appt.patientName}`}
          className="inline-flex h-9 shrink-0 items-center rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["marcacoes.openAppointment"]}
        </button>
      </div>
    </GlassCard>
  );
}

export function MarcacoesView({
  filters,
  lockTherapist,
  options,
  serviceFilterOptions,
  appointments,
  canHardDelete,
}: {
  filters: MarcacoesFilters;
  lockTherapist: boolean;
  options: AgendaOptions;
  /** DB-sourced tenant services for the Serviço filter (W6-01b), inactive included. */
  serviceFilterOptions: ServiceFilterOption[];
  appointments: AgendaAppointment[];
  /** W12-00: gates the drawer's admin-only password hard-delete, exactly as the
   *  agenda passes it (`can(role, "settings:manage")`). The reused drawer, not
   *  this view, enforces every action server-side. */
  canHardDelete: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // W12-00: modal state for the shared AppointmentDrawer, mirroring the agenda
  // (agenda-view.tsx `setModal`). The list only ever opens edit mode; create/lote
  // stay on the agenda. Reuses the drawer's existing wiring with zero logic
  // duplication.
  const [modal, setModal] = useState<ModalState | null>(null);

  // W5-02 patient-name search: client-side, presentation-only filter over the
  // already-fetched (role-scoped) window, same tier as the Status/Serviço
  // filters. Local state (not a URL param) so typing never churns history.
  const [search, setSearch] = useState("");

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

  // Presentation-only filters (Search / Status / Serviço) over the fetched window.
  const visible = appointments.filter((a) => {
    if (!matchesSearch(search, a.patientName)) return false;
    if (filters.status && a.status !== filters.status) return false;
    // W6-01b: filter by the actual tenant service id (data-driven), not a
    // hardcoded colour category. The tint below stays name-keyed for display.
    if (filters.service && a.serviceId !== filters.service) return false;
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
    // ToastProvider wraps the whole view (not just the drawer) exactly as the
    // agenda does: the drawer's success/delete Toasts fire in `succeed()` right
    // before `onDone` closes it, so the region must outlive the drawer or the
    // toast would unmount the instant it appears.
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
    <main className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl text-v2-text-primary">{s["marcacoes.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["marcacoes.subtitle"]}</p>
      </div>

      {/* Filters (SPEC-v2-marcacoes §1.2): date range, location, status,
          service, therapist. Self-contained glass bar.
          `relative z-10` mirrors the agenda toolbar (agenda-view.tsx): without
          an explicit position + z-index, this backdrop-filter element and the
          results GlassPanel below it (also backdrop-filter, glass-card) both
          land in the z-index:auto paint bucket and are ordered by DOM/tree
          order — the later GlassPanel then paints OVER this bar's absolutely
          positioned DatePicker popovers (which are trapped inside this bar's
          own stacking context and can't out-rank a later same-level sibling
          on z-index alone). That's why day cells were invisible: they were
          rendered and clickable, just painted underneath the results panel. */}
      <div className="glass-nav relative z-10 flex flex-wrap items-end gap-3 rounded-v2 px-4 py-3 shadow-v2-float">
        <div className="flex items-center gap-2">
          <div className="w-40">
            <DatePicker
              value={filters.from}
              max={filters.to}
              onChange={(d) => navigate({ from: d })}
              triggerLabel={s["marcacoes.filterDateFrom"]}
              prevMonthLabel={s["calendar.previousMonth"]}
              nextMonthLabel={s["calendar.nextMonth"]}
            />
          </div>
          <span className="text-sm text-v2-text-secondary">{s["marcacoes.dateTo"]}</span>
          <div className="w-40">
            <DatePicker
              value={filters.to}
              min={filters.from}
              onChange={(d) => navigate({ to: d })}
              triggerLabel={s["marcacoes.filterDateTo"]}
              prevMonthLabel={s["calendar.previousMonth"]}
              nextMonthLabel={s["calendar.nextMonth"]}
            />
          </div>
        </div>

        {/* W5-02: patient-name search, aligned into the same toolbar row as the
            other filters (UI-STYLE.md §6). Client-side filter only. */}
        <div className="w-56">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leadingIcon={Search}
            aria-label={s["common.search"]}
            placeholder={s["marcacoes.searchPlaceholder"]}
          />
        </div>

        {/* W10-04 isolation: therapist loses the location switcher (mirrors the
            therapist-switcher gate below and the agenda). */}
        {!lockTherapist && (
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
        )}

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
            {serviceFilterOptions.map((svc) => (
              <option key={svc.id} value={svc.id}>
                {svc.name}
              </option>
            ))}
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
                    <AppointmentRow
                      key={a.id}
                      appt={a}
                      conflicting={conflicts.has(a.id)}
                      onOpen={(appt) => setModal({ mode: "edit", appt })}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </GlassPanel>
      )}
    </main>

    {/* W12-00: the SAME drawer the agenda mounts, in edit mode. onDone refetches
        the list (router.refresh) so a saved estado/reschedule/cancel is reflected
        without a manual reload. anchor is a create-only default (edit reads the
        appointment's own start), passed here as the range start for completeness.
        Every server action + the permission matrix live inside the drawer,
        unchanged; this view only supplies the entry point. */}
    {modal && (
      <AppointmentDrawer
        state={modal}
        options={options}
        anchor={filters.from}
        canHardDelete={canHardDelete}
        onClose={() => setModal(null)}
        onDone={() => {
          setModal(null);
          startTransition(() => router.refresh());
        }}
      />
    )}
    </ToastProvider>
  );
}
