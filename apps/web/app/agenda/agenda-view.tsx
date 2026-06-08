"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { s } from "@/lib/i18n";
import {
  addDays,
  formatAnchorLabel,
  todayInLisbon,
  type AgendaView as View,
} from "@/lib/scheduling/time";
import type {
  AgendaAppointment,
  AgendaFilters,
  AgendaOptions,
} from "@/lib/scheduling/types";
import { AgendaGrid } from "./agenda-grid";
import { AppointmentModal, type ModalState } from "./appointment-modal";

export function AgendaView({
  view,
  anchor,
  filters,
  lockTherapist,
  options,
  appointments,
}: {
  view: View;
  anchor: string;
  filters: AgendaFilters;
  lockTherapist: boolean;
  options: AgendaOptions;
  appointments: AgendaAppointment[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modal, setModal] = useState<ModalState | null>(null);

  function navigate(next: {
    view?: View;
    date?: string;
    therapist?: string | null;
    location?: string | null;
  }) {
    const params = new URLSearchParams();
    params.set("view", next.view ?? view);
    params.set("date", next.date ?? anchor);
    const therapist =
      next.therapist !== undefined ? next.therapist : filters.practitionerId;
    const location =
      next.location !== undefined ? next.location : filters.locationId;
    if (therapist && !lockTherapist) params.set("therapist", therapist);
    if (location) params.set("location", location);
    startTransition(() => router.push(`/agenda?${params.toString()}`));
  }

  const step = view === "week" ? 7 : 1;

  return (
    <main className="flex min-h-dvh flex-col bg-bg">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <h1 className="text-lg font-semibold text-text-primary">
          {s["app.name"]} · {s["agenda.title"]}
        </h1>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <div className="inline-flex overflow-hidden rounded border border-border-strong">
          <ToggleButton
            active={view === "day"}
            onClick={() => navigate({ view: "day" })}
          >
            {s["agenda.viewDay"]}
          </ToggleButton>
          <ToggleButton
            active={view === "week"}
            onClick={() => navigate({ view: "week" })}
          >
            {s["agenda.viewWeek"]}
          </ToggleButton>
        </div>

        <div className="inline-flex items-center gap-1">
          <NavButton
            label={s["agenda.prevPeriod"]}
            onClick={() => navigate({ date: addDays(anchor, -step) })}
          >
            ←
          </NavButton>
          <button
            type="button"
            onClick={() => navigate({ date: todayInLisbon() })}
            className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-primary hover:bg-surface-muted"
          >
            {s["agenda.today"]}
          </button>
          <NavButton
            label={s["agenda.nextPeriod"]}
            onClick={() => navigate({ date: addDays(anchor, step) })}
          >
            →
          </NavButton>
          <span className="ml-2 text-sm font-medium text-text-primary">
            {formatAnchorLabel(view, anchor)}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!lockTherapist && (
            <select
              aria-label={s["agenda.filterTherapists"]}
              value={filters.practitionerId ?? ""}
              onChange={(e) =>
                navigate({ therapist: e.target.value || null })
              }
              className="rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary"
            >
              <option value="">{s["agenda.allTherapists"]}</option>
              {options.therapists.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label={s["header.location"]}
            value={filters.locationId ?? ""}
            onChange={(e) => navigate({ location: e.target.value || null })}
            className="rounded border border-border-strong bg-surface px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">{s["agenda.allLocations"]}</option>
            {options.locations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModal({ mode: "create" })}
            className="rounded bg-brand-teal px-3 py-1.5 text-sm font-medium text-text-inverse hover:bg-brand-teal/90"
          >
            + {s["agenda.newAppointment"]}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
        <AgendaGrid
          view={view}
          anchor={anchor}
          appointments={appointments}
          onSelectAppointment={(appt) => setModal({ mode: "edit", appt })}
          onSelectSlot={(date, time) =>
            setModal({ mode: "create", slot: { date, time } })
          }
        />
      </div>

      {modal && (
        <AppointmentModal
          state={modal}
          options={options}
          anchor={anchor}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </main>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm ${
        active
          ? "bg-brand-teal text-text-inverse"
          : "bg-surface text-text-primary hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded border border-border-strong px-2.5 py-1.5 text-sm text-text-primary hover:bg-surface-muted"
    >
      {children}
    </button>
  );
}
