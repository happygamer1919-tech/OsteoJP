"use client";

import { Select } from "@osteojp/ui";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { s } from "@/lib/i18n";

/**
 * T5b: the owner's clinic toggle on the Inicio revenue tile. "Todas as
 * localizacoes" (the default, every clinic) or one clinic.
 *
 * The platform's own `Select`, the same control and the same "Todas as
 * localizacoes" first entry as the Faturacao location filter, so the owner
 * meets one idiom for "which clinic" on both pages.
 *
 * THE CHOICE LIVES IN THE URL (`?location=<id>`), never in client state: the
 * figure is computed on the server from that parameter, so a reload, a shared
 * link and the back button all show the figure the control says. `date` is the
 * page's explicit `?date=`, kept so choosing a clinic does not move the day
 * the rest of Inicio is showing.
 *
 * Rendered only for the owner; the page decides that (canChooseRevenueLocation)
 * and getMonthlyRevenue ignores `?location=` for every other role, so this
 * component is never the fence.
 */
export function RevenueLocationToggle({
  locations,
  value,
  date,
}: {
  locations: ReadonlyArray<{ id: string; name: string }>;
  /** The clinic the figure is for, or null for every clinic. */
  value: string | null;
  /** The page's explicit `?date=`, or null when it has none. */
  date: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div data-testid="dashboard-revenue-location">
      <Select
        aria-label={s["dashboard.revenueLocation"]}
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => {
          const params = new URLSearchParams();
          if (date) params.set("date", date);
          if (e.target.value) params.set("location", e.target.value);
          const qs = params.toString();
          startTransition(() => router.push(qs ? `/dashboard?${qs}` : "/dashboard"));
        }}
      >
        <option value="">{s["dashboard.revenueAllLocations"]}</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
