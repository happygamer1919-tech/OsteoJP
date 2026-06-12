"use client";

import { Button, DatePicker, Select, SegmentedControl } from "@osteojp/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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

const iconBtn =
  "inline-flex size-10 items-center justify-center rounded-md border border-border-strong bg-surface text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

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
    const therapist = next.therapist !== undefined ? next.therapist : filters.practitionerId;
    const location = next.location !== undefined ? next.location : filters.locationId;
    if (therapist && !lockTherapist) params.set("therapist", therapist);
    if (location) params.set("location", location);
    startTransition(() => router.push(`/agenda?${params.toString()}`));
  }

  const step = view === "week" ? 7 : 1;

  return (
    <main>
      {/* Toolbar (sticky under the app bar) */}
      <div className="sticky top-16 z-20 -mx-6 -mt-8 mb-6 flex flex-wrap items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <h1 className="text-2xl text-text-primary">{s["agenda.title"]}</h1>

        <SegmentedControl
          aria-label={s["agenda.title"]}
          value={view}
          onValueChange={(v) => navigate({ view: v as View })}
          items={[
            { value: "day", label: s["agenda.viewDay"] },
            { value: "week", label: s["agenda.viewWeek"] },
          ]}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={s["agenda.prevPeriod"]}
            onClick={() => navigate({ date: addDays(anchor, -step) })}
            className={iconBtn}
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="w-44">
            <DatePicker
              value={anchor}
              onChange={(d) => navigate({ date: d })}
              triggerLabel={s["agenda.pickDate"]}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate({ date: todayInLisbon() })}
            className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {s["agenda.today"]}
          </button>
          <button
            type="button"
            aria-label={s["agenda.nextPeriod"]}
            onClick={() => navigate({ date: addDays(anchor, step) })}
            className={iconBtn}
          >
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className="ml-1 hidden text-sm font-medium text-text-primary sm:inline">
            {formatAnchorLabel(view, anchor)}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!lockTherapist && (
            <div className="w-44">
              <Select
                aria-label={s["agenda.filterTherapists"]}
                value={filters.practitionerId ?? ""}
                onChange={(e) => navigate({ therapist: e.target.value || null })}
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
          <div className="w-44">
            <Select
              aria-label={s["header.location"]}
              value={filters.locationId ?? ""}
              onChange={(e) => navigate({ location: e.target.value || null })}
            >
              <option value="">{s["agenda.allLocations"]}</option>
              {options.locations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          {/* SPEC §4 calls for an "Adicionar" split button (Nova marcação /
              Bloquear horário); blocked-time has no data model, so the single
              action ships directly as Nova Marcação (preserves the e2e action). */}
          <Button iconLeft={Plus} onClick={() => setModal({ mode: "create" })}>
            {s["agenda.newAppointment"]}
          </Button>
        </div>
      </div>

      {appointments.length === 0 && (
        <p className="mb-4 rounded-md bg-surface-muted px-4 py-3 text-sm text-text-secondary">
          {s["agenda.noAppointments"]}
        </p>
      )}

      <AgendaGrid
        view={view}
        anchor={anchor}
        appointments={appointments}
        onSelectAppointment={(appt) => setModal({ mode: "edit", appt })}
        onSelectSlot={(date, time) => setModal({ mode: "create", slot: { date, time } })}
      />

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
