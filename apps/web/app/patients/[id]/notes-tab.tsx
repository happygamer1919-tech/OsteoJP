"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ToastProvider } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { getAppointmentAction } from "@/lib/scheduling/appointment-read-actions";
import type { AgendaAppointment, AgendaOptions } from "@/lib/scheduling/types";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";
import { AppointmentDrawer } from "@/app/agenda/appointment-drawer";
import { NotesList } from "./notes-list";

/**
 * PL-17 — the Notas tab, with its notes wired back to the marcações they
 * document. Owner CR 2026-07-30: "you can see the notes but it is not written to
 * which appointment related, add a connection in the patient profile in his
 * notes to press on a button and it will open the side right panel with the
 * appointment details".
 *
 * The list itself is the shipped PL-13 NotesList; this adds the client shell
 * that can hold a drawer. The marcação is fetched by id on demand
 * (getAppointmentAction, appointments:read + RLS) rather than pre-loaded for
 * every note — a patient with a long history would otherwise pay for rows the
 * reader never opens. The panel is the SAME AppointmentDrawer the agenda and
 * Marcações open, so there is one appointment surface, not a third one.
 */
export function NotesTab({
  notes,
  options,
  viewer,
  canHardDelete,
}: {
  notes: PatientNoteRevision[];
  options: AgendaOptions;
  viewer: { role: AgendaViewerRole; userId: string };
  canHardDelete: boolean;
}) {
  const router = useRouter();
  const [appt, setAppt] = useState<AgendaAppointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function openAppointment(appointmentId: string) {
    setError(null);
    startTransition(async () => {
      const r = await getAppointmentAction(appointmentId);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setAppt(r.data);
    });
  }

  return (
    <ToastProvider regionLabel={s["toast.regionLabel"]}>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <NotesList notes={notes} onOpenAppointment={openAppointment} />
      {appt && (
        <AppointmentDrawer
          state={{ mode: "edit", appt }}
          options={options}
          anchor={appt.startsAt.slice(0, 10)}
          canHardDelete={canHardDelete}
          viewer={viewer}
          onClose={() => setAppt(null)}
          onDone={() => {
            setAppt(null);
            router.refresh();
          }}
        />
      )}
    </ToastProvider>
  );
}

/** The drawer's viewer role type, re-exported here to keep the page's props flat. */
type AgendaViewerRole = Parameters<typeof AppointmentDrawer>[0]["viewer"]["role"];
