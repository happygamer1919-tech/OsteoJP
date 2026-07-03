"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Combobox, type ComboboxOption } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { appendPatientNoteAction, searchPatientsAction } from "@/lib/patients/actions";

const MAX_LEN = 5000;

/**
 * Notas Rápidas (W2-11 rewire) — a quick way to append a note to a SELECTED
 * patient's append-only history (`patient_note_revisions`). Pick a patient, type
 * the note, save. No patient selected → cannot save. (The former per-staff
 * scratchpad on `quick_notes` is retired from this card; its rows are left in
 * the DB, untouched.)
 */
export function NotasRapidas() {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

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

  function onSelect(value: string): void {
    setPatientId(value);
    setSelectedOption(results.find((r) => r.value === value) ?? selectedOption);
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!patientId) {
      setError(s["dashboard.quickNotePatientRequired"]);
      return;
    }
    const content = text.trim();
    if (!content) {
      setError(s["dashboard.quickNoteRequired"]);
      return;
    }
    startTransition(async () => {
      const r = await appendPatientNoteAction(patientId, content);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setText("");
      setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Combobox
        options={options}
        value={patientId}
        onChange={onSelect}
        query={query}
        onQueryChange={setQuery}
        loading={loading}
        emptyLabel={s["dashboard.quickNoteNoPatient"]}
        placeholder={s["dashboard.quickNotePatientPlaceholder"]}
        aria-label={s["dashboard.quickNotePatient"]}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_LEN}
        rows={4}
        aria-label={s["dashboard.notes"]}
        placeholder={s["dashboard.notesPlaceholder"]}
        className="w-full resize-none rounded-md border border-v2-border bg-transparent p-3 text-sm text-v2-text-primary placeholder:text-v2-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        {saved && !pending && (
          <p role="status" className="text-xs text-v2-text-secondary">
            {s["dashboard.notesSaved"]}
          </p>
        )}
        <Button type="submit" loading={pending} variant="primary">
          {s["common.save"]}
        </Button>
      </div>
    </form>
  );
}
