"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Combobox, Field, Input, type ComboboxOption } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { searchPatientsAction } from "@/lib/patients/actions";
import { createStubPatientAction, startConsultationAction } from "./actions";

type Mode = "existing" | "new";

/**
 * W4-06 start-consultation screen. Two paths converge on a valid patientId
 * (existing-patient search OR new stub), then a consent checkbox gates the
 * "Iniciar gravação" action. The Record affordance is unreachable until consent
 * is checked; the server re-checks consent (startConsultationAction) so the
 * gate cannot be bypassed. The MediaRecorder itself is W4-07 — here the ready
 * state marks the hand-off.
 */
export function StartConsultation() {
  const [mode, setMode] = useState<Mode>("existing");

  // existing-patient search
  const [patientId, setPatientId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ComboboxOption[]>([]);
  const [searching, setSearching] = useState(false);
  // Below the 2-char minimum (or off the existing tab) show nothing — derived so
  // the effect never sets state synchronously (react-hooks/set-state-in-effect).
  const options = useMemo<ComboboxOption[]>(
    () => (mode !== "existing" || query.trim().length < 2 ? [] : searchResults),
    [mode, query, searchResults],
  );

  // new stub
  const [stubName, setStubName] = useState("");
  const [stubPhone, setStubPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [stubLabel, setStubLabel] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced patient search (min 2 chars), mirrors the appointment drawer.
  useEffect(() => {
    const q = query.trim();
    if (mode !== "existing" || q.length < 2) return;
    const t = setTimeout(() => {
      setSearching(true);
      searchPatientsAction(q)
        .then((rows) => setSearchResults(rows.map((r) => ({ value: r.id, label: r.label }))))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, mode]);

  function resetPatient() {
    setPatientId(null);
    setStubLabel(null);
    setConsent(false);
    setReady(false);
    setError(null);
  }

  async function createStub() {
    setError(null);
    setCreating(true);
    const r = await createStubPatientAction({
      fullName: stubName,
      phone: stubPhone.trim() || null,
    });
    setCreating(false);
    if (!r.ok) {
      setError(r.error === "validation" ? s["consultation.nameRequired"] : s["errors.forbidden"]);
      return;
    }
    setPatientId(r.patientId);
    setStubLabel(stubName.trim());
  }

  async function start() {
    if (!patientId) return;
    setError(null);
    setStarting(true);
    const r = await startConsultationAction({ patientId, consent });
    setStarting(false);
    if (!r.ok) {
      setError(
        r.error === "consent_required"
          ? s["consultation.consentRequired"]
          : r.error === "not_found"
            ? s["consultation.patientNotFound"]
            : s["errors.forbidden"],
      );
      return;
    }
    setReady(true);
  }

  const patientChosen = mode === "existing" ? !!patientId : !!patientId && !!stubLabel;
  const canStart = patientChosen && consent && !starting && !ready;

  if (ready) {
    return (
      <div className="max-w-lg space-y-3">
        <h1 className="text-lg font-semibold">{s["consultation.title"]}</h1>
        <p role="status" className="rounded border border-teal-600 bg-teal-50 px-3 py-2 text-sm">
          {s["consultation.ready"]}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold">{s["consultation.title"]}</h1>

      <div className="flex gap-2" role="tablist" aria-label={s["consultation.title"]}>
        <Button
          type="button"
          variant={mode === "existing" ? "primary" : "secondary"}
          size="sm"
          onClick={() => {
            setMode("existing");
            resetPatient();
          }}
          aria-selected={mode === "existing"}
        >
          {s["consultation.existingPatient"]}
        </Button>
        <Button
          type="button"
          variant={mode === "new" ? "primary" : "secondary"}
          size="sm"
          onClick={() => {
            setMode("new");
            resetPatient();
          }}
          aria-selected={mode === "new"}
        >
          {s["consultation.newPatient"]}
        </Button>
      </div>

      {mode === "existing" ? (
        // The Combobox does not consume Field context (like the appointment
        // drawer), so it takes a manual <label htmlFor> for its accessible name.
        <div className="flex flex-col gap-1">
          <label htmlFor="consultation-patient" className="text-xs font-medium text-text-primary">
            {s["consultation.patient"]}
            <span aria-hidden="true" className="text-error"> *</span>
          </label>
          <Combobox
            id="consultation-patient"
            options={options}
            value={patientId}
            onChange={(v) => {
              setPatientId(v);
              setConsent(false);
            }}
            query={query}
            onQueryChange={setQuery}
            loading={searching}
            placeholder={s["consultation.patientTypeToSearch"]}
            emptyLabel={s["consultation.patientSearchEmpty"]}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={s["consultation.name"]} required>
            <Input
              value={stubName}
              onChange={(e) => setStubName(e.target.value)}
              disabled={!!patientId}
            />
          </Field>
          <Field label={s["consultation.phoneOptional"]}>
            <Input
              value={stubPhone}
              onChange={(e) => setStubPhone(e.target.value)}
              disabled={!!patientId}
            />
          </Field>
          {!patientId && (
            <Button type="button" size="sm" onClick={createStub} disabled={creating || !stubName.trim()}>
              {creating ? s["consultation.creating"] : s["consultation.createStub"]}
            </Button>
          )}
          {patientId && stubLabel && (
            <p className="text-sm text-text-secondary">
              {s["consultation.stubCreated"]}: {stubLabel}
            </p>
          )}
        </div>
      )}

      <Checkbox
        label={s["consultation.consentLabel"]}
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        disabled={!patientChosen}
      />

      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}

      <Button type="button" onClick={start} disabled={!canStart}>
        {starting ? s["consultation.starting"] : s["consultation.startRecording"]}
      </Button>
    </div>
  );
}
