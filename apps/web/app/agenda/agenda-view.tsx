"use client";

import { DatePicker, Select, SegmentedControl, ToastProvider } from "@osteojp/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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
import { AppointmentDrawer, type ModalState } from "./appointment-drawer";

// v2 glass toolbar controls (SPEC-v2-foundation §7 nav-button idiom): no opaque
// border/fill, neutral hover tint, the global focus ring. Mirrors the shell's
// own icon buttons so the agenda toolbar reads as part of the v2 chrome.
const iconBtn =
  "inline-flex size-10 items-center justify-center rounded-v2 text-v2-text-secondary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

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

  // SPEC-v2-agenda §4: mobile collapses to the Dia view. This is a presentation
  // override — the URL `view` (and the server fetch range) are untouched; below
  // the lg breakpoint the grid, the range label, and the date step all render as
  // a single day. Starts false so the SSR/first-client render match (no
  // hydration mismatch); the effect corrects it on mount.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)"); // below Tailwind `lg`
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const effectiveView: View = isMobile ? "day" : view;

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

  const step = effectiveView === "week" ? 7 : 1;

  return (
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
    <main>
      {/* Toolbar: full-bleed sticky glass bar. Under the v2 SidebarAppShell the
          desktop content area has no top bar (sticks to top-0); on mobile it
          sits below the shell's sticky h-16 header (top-16). z-10 keeps it under
          that header (z-20). */}
      <div className="glass-nav sticky top-16 z-10 -mx-6 -mt-8 mb-6 flex flex-wrap items-center gap-3 px-6 py-3 lg:top-0">
        <h1 className="text-2xl text-v2-text-primary">{s["agenda.title"]}</h1>

        {/* Day/week toggle is desktop-only: mobile is always the Dia view (§4). */}
        <div className="hidden lg:block">
          <SegmentedControl
            aria-label={s["agenda.title"]}
            value={view}
            onValueChange={(v) => navigate({ view: v as View })}
            items={[
              { value: "day", label: s["agenda.viewDay"] },
              { value: "week", label: s["agenda.viewWeek"] },
            ]}
          />
        </div>

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
              prevMonthLabel={s["calendar.previousMonth"]}
              nextMonthLabel={s["calendar.nextMonth"]}
            />
          </div>
          <button
            type="button"
            onClick={() => navigate({ date: todayInLisbon() })}
            className="inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
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
          <span className="ml-1 hidden text-sm font-medium text-v2-text-primary sm:inline">
            {formatAnchorLabel(effectiveView, anchor)}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!lockTherapist && (
            <div className="w-56">
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
          <div className="w-56">
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
          {/* Primary action: filled Wellness Green (SPEC-v2-agenda §1.4). The
              packages/ui Button is brand-teal with no green variant; styled
              in-route on v2 tokens to meet the spec (green-700 fill + inverse
              text = 4.7:1 AA). A green Button variant is logged as a foundation
              follow-up in docs/design/QUESTIONS.md (Q-V2W2-2), never added inside
              a section wave.
              Blocked-time has no data model, so the single action ships as Nova
              Marcação (preserves the e2e action). */}
          <button
            type="button"
            onClick={() => setModal({ mode: "create" })}
            className="inline-flex h-10 items-center gap-2 rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-v2-green-800 active:bg-v2-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {s["agenda.newAppointment"]}
          </button>
        </div>
      </div>

      {/* No empty-period banner: the agenda grid (empty time columns) is its
          own empty affordance, so a separate banner is redundant (W4-07). */}
      <AgendaGrid
        view={effectiveView}
        anchor={anchor}
        appointments={appointments}
        onSelectAppointment={(appt) => setModal({ mode: "edit", appt })}
        onSelectSlot={(date, time) => setModal({ mode: "create", slot: { date, time } })}
      />

      {modal && (
        <AppointmentDrawer
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
    </ToastProvider>
  );
}
