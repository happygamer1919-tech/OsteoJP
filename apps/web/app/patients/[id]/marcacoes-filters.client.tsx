"use client";

import { Select } from "@osteojp/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { s } from "@/lib/i18n";
import type { AppointmentStatusValue } from "@/lib/scheduling/types";

/**
 * U1 — the Marcações history filters, on the patient profile.
 *
 * ==========================================================================
 * EVERY FILTER IS A URL PARAM, AND THE SERVER DOES THE FILTERING
 * ==========================================================================
 * Same rule the /patients filter bar states and for the same reasons: a
 * filtered view is a link, the back button returns to the previous filter, a
 * reload keeps it, and the narrowing happens in SQL rather than over an array
 * the browser already holds.
 *
 * THAT LAST HALF IS THE ONE THAT MATTERS HERE. `/marcacoes` filters its Estado
 * and Serviço dropdowns on the CLIENT, over the window it already fetched
 * (marcacoes-view.tsx: "presentation filters ... run on the client over the
 * fetched window"). This tab deliberately does not: `listPatientAppointments`
 * takes the filters and applies them as WHERE clauses, so a match is found
 * whether or not it was already on screen.
 *
 * ==========================================================================
 * THE TAB PARAM SURVIVES EVERY CHANGE
 * ==========================================================================
 * This lives on /patients/[id], whose tab is `?tab=consultas`. Dropping it on a
 * filter change would bounce the user back to Resumo mid-filter, so `tab` is
 * written on every navigation rather than merely preserved by accident.
 */

const ESTADOS: readonly AppointmentStatusValue[] = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;

const ESTADO_KEY = {
  scheduled: "appointment.status.scheduled",
  confirmed: "appointment.status.confirmed",
  completed: "appointment.status.completed",
  cancelled: "appointment.status.cancelled",
  no_show: "appointment.status.no_show",
} as const;

export type MarcacoesFilterValues = {
  from: string;
  to: string;
  estado: readonly AppointmentStatusValue[];
  therapist: string;
  clinic: string;
  service: string;
  semNota: boolean;
  order: "newest" | "oldest";
};

export function MarcacoesFilters({
  patientId,
  values,
  therapists,
  locations,
  services,
  count,
}: {
  patientId: string;
  values: MarcacoesFilterValues;
  // `{ id, label }` is the agenda's own dropdown vocabulary (`Option` in
  // lib/scheduling/types), so these arrive from `getAgendaOptions` untouched.
  // Re-spelling `label` as `name` at the call site would invent a second word
  // for one thing and put a mapping between the data and the control.
  therapists: readonly { id: string; label: string }[];
  locations: readonly { id: string; label: string }[];
  services: readonly { id: string; label: string }[];
  /** Rows the current filter matched — stated, so "no rows" is never ambiguous. */
  count: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  /**
   * THE TICK HAS TO APPEAR ON THE CLICK, NOT ON THE ROUND TRIP.
   *
   * These checkboxes are controlled by SERVER state: `checked` came straight
   * from `values`, and `onChange` only pushes a new URL. So between the click
   * and the server's answer the box stayed visibly unticked — on a slow
   * connection the user clicks again, and the second click UNDOES the first.
   * Playwright caught it as `locator.check: Clicking the checkbox did not
   * change its state`, which is exactly what a person would have experienced.
   *
   * So the displayed state is local and optimistic, and it is RE-SYNCED from
   * the server's values whenever they change — the render-time adjustment this
   * codebase already uses for the conflict banners in appointments-list.tsx,
   * rather than an effect. Compared by a serialized key because the array is
   * rebuilt on every render and would never be reference-equal.
   *
   * It is display only: the URL the server reads is still the single source of
   * truth, and a navigation that fails or is cancelled re-syncs the box back.
   */
  const serverEstadoKey = values.estado.join(",");
  const [shownEstado, setShownEstado] = useState<readonly AppointmentStatusValue[]>(values.estado);
  const [syncedEstadoKey, setSyncedEstadoKey] = useState(serverEstadoKey);
  if (serverEstadoKey !== syncedEstadoKey) {
    setSyncedEstadoKey(serverEstadoKey);
    setShownEstado(values.estado);
    setPending(false);
  }

  const [shownSemNota, setShownSemNota] = useState(values.semNota);
  const [syncedSemNota, setSyncedSemNota] = useState(values.semNota);
  if (values.semNota !== syncedSemNota) {
    setSyncedSemNota(values.semNota);
    setShownSemNota(values.semNota);
  }

  /**
   * Write the next filter state into the URL.
   *
   * ALWAYS DROPS `page`. A filter change that kept the page number would leave
   * the reader on page 7 of a result set that now has two, which renders empty
   * and reads as "nothing matched" — the exact wrong answer to a filter that
   * did match. The /patients bar and the /recuperacao pager both state this
   * rule; it is the same one.
   */
  function apply(next: Partial<MarcacoesFilterValues>): void {
    const v = { ...values, ...next };
    const p = new URLSearchParams();
    p.set("tab", "consultas");
    if (v.from) p.set("de", v.from);
    if (v.to) p.set("ate", v.to);
    if (v.estado.length > 0) p.set("estado", v.estado.join(","));
    if (v.therapist) p.set("terapeuta", v.therapist);
    if (v.clinic) p.set("clinica", v.clinic);
    if (v.service) p.set("servico", v.service);
    if (v.semNota) p.set("semnota", "1");
    if (v.order === "oldest") p.set("ordem", "antigas");
    setPending(true);
    router.push(`/patients/${patientId}?${p.toString()}`);
  }

  /**
   * Driven by the DISPLAYED set, not by the server's, so two quick clicks
   * compose (tick A, tick B) instead of the second one racing the first and
   * reverting it.
   */
  function toggleEstado(value: AppointmentStatusValue): void {
    const on = shownEstado.includes(value);
    const next = on ? shownEstado.filter((e) => e !== value) : [...shownEstado, value];
    setShownEstado(next);
    apply({ estado: next });
  }

  const active =
    Boolean(values.from || values.to || values.therapist || values.clinic || values.service) ||
    values.estado.length > 0 ||
    values.semNota ||
    values.order === "oldest";

  const field =
    "h-9 rounded-v2 border border-v2-border bg-surface px-2 text-sm text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

  return (
    <section
      aria-label={s["ficha.filters.legend"]}
      data-testid="marcacoes-filters"
      data-active={active ? "true" : "false"}
      className="flex flex-col gap-3 rounded-v2 border border-v2-border p-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["ficha.filters.from"]}
          <input
            type="date"
            data-testid="filter-from"
            className={field}
            value={values.from}
            onChange={(e) => apply({ from: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["ficha.filters.to"]}
          <input
            type="date"
            data-testid="filter-to"
            className={field}
            value={values.to}
            onChange={(e) => apply({ to: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["ficha.filters.therapist"]}
          <Select
            data-testid="filter-therapist"
            aria-label={s["ficha.filters.therapist"]}
            value={values.therapist}
            onChange={(e) => apply({ therapist: e.target.value })}
          >
            <option value="">{s["ficha.filters.all"]}</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["ficha.filters.clinic"]}
          <Select
            data-testid="filter-clinic"
            aria-label={s["ficha.filters.clinic"]}
            value={values.clinic}
            onChange={(e) => apply({ clinic: e.target.value })}
          >
            <option value="">{s["ficha.filters.all"]}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["ficha.filters.service"]}
          <Select
            data-testid="filter-service"
            aria-label={s["ficha.filters.service"]}
            value={values.service}
            onChange={(e) => apply({ service: e.target.value })}
          >
            <option value="">{s["ficha.filters.all"]}</option>
            {services.map((sv) => (
              <option key={sv.id} value={sv.id}>
                {sv.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-v2-text-secondary">
          {s["ficha.filters.order"]}
          <Select
            data-testid="filter-order"
            aria-label={s["ficha.filters.order"]}
            value={values.order}
            onChange={(e) => apply({ order: e.target.value === "oldest" ? "oldest" : "newest" })}
          >
            <option value="newest">{s["ficha.filters.orderNewest"]}</option>
            <option value="oldest">{s["ficha.filters.orderOldest"]}</option>
          </Select>
        </label>
      </div>

      {/* Estado is MULTI-select, so it is checkboxes rather than a <select
          multiple>: a multiple-select needs a modifier key to add a second
          value, which reception on a laptop will not discover. */}
      <fieldset className="flex flex-wrap items-center gap-3" data-testid="filter-estado">
        <legend className="sr-only">{s["ficha.filters.estado"]}</legend>
        <span className="text-xs text-v2-text-secondary">{s["ficha.filters.estado"]}</span>
        {ESTADOS.map((e) => (
          <label key={e} className="inline-flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              data-testid={`filter-estado-${e}`}
              checked={values.estado.includes(e)}
              onChange={() => toggleEstado(e)}
            />
            {s[ESTADO_KEY[e]]}
          </label>
        ))}

        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            data-testid="filter-sem-nota"
            checked={values.semNota}
            onChange={(e) => apply({ semNota: e.target.checked })}
          />
          {s["ficha.filters.withoutNote"]}
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm tabular-nums text-v2-text-secondary" data-testid="marcacoes-count">
          {s["ficha.filters.count"].replace("{count}", new Intl.NumberFormat("pt-PT").format(count))}
        </span>
        {active && (
          // A plain link, so it works with JS still loading and so it is the
          // canonical unfiltered URL rather than a cleared-params reconstruction.
          <a
            href={`/patients/${patientId}?tab=consultas`}
            data-testid="filter-clear"
            className="ml-auto inline-flex h-9 items-center rounded-v2 border border-v2-border px-3 text-sm font-medium text-v2-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-disabled={pending ? "true" : undefined}
          >
            {s["ficha.filters.clear"]}
          </a>
        )}
      </div>
    </section>
  );
}
