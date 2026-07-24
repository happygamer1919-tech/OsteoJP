"use client";

import { useEffect, useState } from "react";
import { Combobox, type ComboboxOption } from "@osteojp/ui";
import { searchPatientsAction } from "@/lib/patients/actions";

/**
 * PatientSelector (W12-13, notes unification R6) — the shared async patient
 * picker: a `@osteojp/ui` Combobox driven by `searchPatientsAction` (debounced,
 * tenant + role scoped server-side). Extracted from the duplicated combobox in
 * `notas-rapidas.tsx` so the Início notes block (and future callers) reuse ONE
 * implementation instead of a fifth copy. Selection out (`onChange`), no domain
 * logic; all user-facing strings are passed in so it stays i18n-agnostic.
 */
export function PatientSelector({
  value,
  onChange,
  placeholder,
  emptyLabel,
  ariaLabel,
  invalid,
}: {
  value: string | null;
  /** Fired with the selected patient id and its display label. */
  onChange: (patientId: string, label: string | null) => void;
  placeholder?: string;
  emptyLabel: string;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      searchPatientsAction(q)
        .then((rows) => setResults(rows.map((r) => ({ value: r.id, label: r.label }))))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Keep the selected patient visible even after the query is cleared.
  const options = query.trim().length < 2 ? (selectedOption ? [selectedOption] : []) : results;

  function handleSelect(v: string): void {
    const opt = results.find((r) => r.value === v) ?? selectedOption;
    setSelectedOption(opt ?? null);
    onChange(v, opt?.label ?? null);
  }

  return (
    <Combobox
      options={options}
      value={value}
      onChange={handleSelect}
      query={query}
      onQueryChange={setQuery}
      loading={loading}
      emptyLabel={emptyLabel}
      placeholder={placeholder}
      aria-label={ariaLabel}
      invalid={invalid}
    />
  );
}
