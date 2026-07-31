"use client";

import { useState, useTransition } from "react";

import { knownField } from "@/lib/patients/known-field";
import { Button, Dialog, TimeField } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { generateDeclaracaoUrlAction } from "./declaracao-actions";

// W12-31: "HH:mm" time helpers. Lexical compare on zero-padded "HH:mm" equals
// chronological order, so no Date needed.
const HHMM = /^\d{2}:\d{2}$/;
const isAfter = (end: string, start: string): boolean =>
  HHMM.test(end) && HHMM.test(start) && end > start;
/** start + `mins`, clamped to 23:59 so a manual default never spills past the day. */
const addMinutesSameDay = (hhmm: string, mins: number): string => {
  if (!HHMM.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export type DeclaracaoAppointment = {
  id: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  locationId: string;
  locationName: string;
};

// Europe/Lisbon projections for the editable prefill.
const lisbonDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso)); // YYYY-MM-DD
const lisbonTime = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso)); // HH:MM
const apptLabel = (a: DeclaracaoAppointment): string =>
  `${lisbonDate(a.startsAt)} ${lisbonTime(a.startsAt)}–${lisbonTime(a.endsAt)} · ${a.locationName}`;

/**
 * W5-31 — "Imprimir Declaração de Presença" button + dialog on the Documentos
 * tab. Pick a marcação (prefills date / hora início / hora fim / location) OR
 * enter manually; all three fields stay editable. Generate calls the server
 * action and opens the returned short-lived signed PDF URL.
 */
export function DeclaracaoDialog({
  patientId,
  appointments,
  patientNif,
}: {
  patientId: string;
  appointments: DeclaracaoAppointment[];
  /** W12-24: the patient's stored NIF, prefilled into the (editable) NIF field. */
  patientNif?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [apptId, setApptId] = useState<string>("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  // W12-24: NIF is the PATIENT's (not the marcação's), so it prefills once from
  // patients.nif and is untouched by the marcação/manual switch.
  // PL-20: and when it IS on file, it is no longer ASKED - the value is shown,
  // with "Alterar" for a one-off override that never touches the record.
  const storedNif = knownField(patientNif);
  const [nif, setNif] = useState(storedNif.kind === "known" ? storedNif.value : "");
  const [overrideNif, setOverrideNif] = useState(false);
  // PL-03a: optional free text added to THIS declaration only (transient, never
  // persisted). Length-capped so a long note cannot push the signature/footer
  // off the single page.
  const [observacoes, setObservacoes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function selectAppointment(id: string) {
    setApptId(id);
    const a = appointments.find((x) => x.id === id);
    if (a) {
      setDate(lisbonDate(a.startsAt));
      setStartTime(lisbonTime(a.startsAt));
      setEndTime(lisbonTime(a.endsAt));
      setLocationId(a.locationId);
    } else {
      // W12-24: "Introdução manual" starts fully blank - explicitly clear the
      // marcação-derived fields (previously only locationId was reset, leaving
      // stale date/hora when switching back from a selected marcação).
      setDate("");
      setStartTime("");
      setEndTime("");
      setLocationId(null);
    }
  }

  // W12-31: typing Início defaults Fim to one hour later (same day) whenever Fim
  // is unset or not after the new start, so Fim can never land before Início.
  function changeStart(v: string) {
    setStartTime(v);
    setEndTime((prev) => (isAfter(prev, v) ? prev : addMinutesSameDay(v, 60)));
  }

  function submit() {
    if (!date || !startTime || !endTime) {
      setError(s["documents.declaracao.incomplete"]);
      return;
    }
    if (!isAfter(endTime, startTime)) {
      setError(s["documents.declaracao.endBeforeStart"]);
      return;
    }
    setError(null);
    startTransition(async () => {
      const { url } = await generateDeclaracaoUrlAction({
        patientId,
        date,
        startTime,
        endTime,
        locationId,
        nif: nif.trim() || null,
        observacoes: observacoes.trim() || null,
      });
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setOpen(false);
      } else {
        setError(s["documents.declaracao.error"]);
      }
    });
  }

  const field = "rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {s["documents.declaracao.button"]}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={s["documents.declaracao.title"]}
        confirmLabel={s["documents.declaracao.generate"]}
        onConfirm={submit}
        confirmLoading={pending}
        cancelLabel={s["common.cancel"]}
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{s["documents.declaracao.marcacaoLabel"]}</span>
            <select
              value={apptId}
              onChange={(e) => selectAppointment(e.target.value)}
              className={field}
              data-testid="declaracao-marcacao"
            >
              <option value="">{s["documents.declaracao.manualOption"]}</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {apptLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{s["documents.declaracao.dateLabel"]}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} data-testid="declaracao-date" />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium">{s["documents.declaracao.startLabel"]}</span>
              {/* W12-31: 24h TimeField (hour/minute selects) replaces the native
                  time input, which rendered AM/PM under a 12h browser locale. */}
              <div data-testid="declaracao-start">
                <TimeField value={startTime} onChange={changeStart} className="w-full" />
              </div>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium">{s["documents.declaracao.endLabel"]}</span>
              <div data-testid="declaracao-end">
                <TimeField value={endTime} onChange={setEndTime} className="w-full" />
              </div>
            </label>
          </div>
          {/* PL-20: the NIF is the PATIENT's, so a known one is shown, not
              asked. "Alterar" reveals the input for a one-off value on THIS
              document; because the record already holds a NIF, nothing typed
              here is written back (shouldPersistCapturedValue). An UNKNOWN NIF
              is asked exactly once and saved to the patient, so the next
              document does not ask again. Still optional either way - a blank
              NIF is simply omitted from the generated declaration. */}
          {storedNif.kind === "known" && !overrideNif ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{s["documents.declaracao.nifLabel"]}</span>
              <span className="flex items-center gap-2">
                <span data-testid="declaracao-nif-known">{storedNif.value}</span>
                <button
                  type="button"
                  onClick={() => setOverrideNif(true)}
                  data-testid="declaracao-nif-override"
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-accent-2-700 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {s["common.edit"]}
                </button>
              </span>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{s["documents.declaracao.nifLabel"]}</span>
              <input
                type="text"
                inputMode="numeric"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                className={field}
                data-testid="declaracao-nif"
              />
              {storedNif.kind === "unknown" && (
                <span className="text-xs text-text-secondary" data-testid="declaracao-nif-savehint">
                  {s["documents.declaracao.nifSaveHint"]}
                </span>
              )}
            </label>
          )}
          {/* PL-03a: optional free-text observações for THIS declaration only
              (transient, never persisted). Rendered in the PDF between the
              treatment sentence and "Por ser verdade". maxLength protects the
              single-page layout (signature + footer). */}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{s["documents.declaracao.observacoesLabel"]}</span>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              maxLength={500}
              className={field}
              data-testid="declaracao-observacoes"
            />
          </label>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
