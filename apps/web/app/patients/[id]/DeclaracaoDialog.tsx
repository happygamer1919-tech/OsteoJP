"use client";

import { useState, useTransition } from "react";
import { Button, Dialog } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { generateDeclaracaoUrlAction } from "./declaracao-actions";

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
}: {
  patientId: string;
  appointments: DeclaracaoAppointment[];
}) {
  const [open, setOpen] = useState(false);
  const [apptId, setApptId] = useState<string>("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
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
      setLocationId(null);
    }
  }

  function submit() {
    if (!date || !startTime || !endTime) {
      setError(s["documents.declaracao.incomplete"]);
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
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} data-testid="declaracao-start" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium">{s["documents.declaracao.endLabel"]}</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} data-testid="declaracao-end" />
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
