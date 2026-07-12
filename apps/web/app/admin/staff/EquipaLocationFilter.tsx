"use client";

import { Select } from "@osteojp/ui";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const s = getStrings(DEFAULT_LOCALE);

/**
 * W5-32 — Equipa location filter. Mirrors the Agenda location select (same
 * @osteojp/ui Select, "Todas as localizações" first, then the tenant locations)
 * and drives a `?location=` URL param, PRESERVING the `?q=` search so the two
 * compose. Presentation-only; the server read does the filtering.
 */
export function EquipaLocationFilter({
  locations,
  path = "/admin/staff",
}: {
  locations: { id: string; name: string }[];
  path?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const current = searchParams.get("location") ?? "";

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) params.set("location", e.target.value);
    else params.delete("location");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${path}?${qs}` : path);
    });
  }

  return (
    <Select aria-label={s["header.location"]} value={current} onChange={onChange}>
      <option value="">{s["agenda.allLocations"]}</option>
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </Select>
  );
}
