"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { editAppointmentNoteAction } from "@/lib/patients/actions";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";

/**
 * PL-13 (owner ruling 2026-07-30): the patient Notas thread is EDITABLE in place
 * with a last-edited stamp. Each note in the unified store (`editable: true`)
 * gets a pen affordance that opens an inline editor; saving calls
 * `editAppointmentNoteAction`, which stamps `edited_at` + `last_edited_by`. Legacy
 * revisions (`editable: false`) render read-only. The author + created line is
 * always shown; when a note has been edited, the "editada por … · …" stamp is
 * shown beneath it.
 */
export function NotesList({ notes }: { notes: PatientNoteRevision[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} />
      ))}
    </ul>
  );
}

function NoteItem({ note }: { note: PatientNoteRevision }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const content = text.trim();
    if (!content) {
      setError(s["patients.noteRequired"]);
      return;
    }
    startTransition(async () => {
      const r = await editAppointmentNoteAction(note.id, content);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onCancel() {
    setText(note.content);
    setError(null);
    setEditing(false);
  }

  return (
    <li className="rounded-lg border border-border-strong p-3">
      {editing ? (
        <form onSubmit={onSave} className="flex flex-col gap-2" data-testid="note-edit-form">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={5000}
            autoFocus
            aria-label={s["patients.noteEdit"]}
            className="w-full resize-none rounded-md border border-border-strong bg-transparent p-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {s["common.cancel"]}
            </Button>
            <Button type="submit" loading={pending} variant="primary">
              {s["common.save"]}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap text-sm text-text-primary">{note.content}</p>
            {note.editable && (
              <button
                type="button"
                onClick={() => {
                  setText(note.content);
                  setEditing(true);
                }}
                aria-label={s["patients.noteEdit"]}
                className="shrink-0 rounded-md p-1 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {note.authorName ?? s["patients.noteSystemAuthor"]} ·{" "}
            {new Date(note.createdAt).toLocaleString("pt-PT")}
          </p>
          {note.editedAt && (
            <p className="mt-0.5 text-xs italic text-text-secondary" data-testid="note-edited-stamp">
              {s["patients.noteEditedBy"]} {note.editedByName ?? s["patients.noteSystemAuthor"]} ·{" "}
              {new Date(note.editedAt).toLocaleString("pt-PT")}
            </p>
          )}
        </>
      )}
    </li>
  );
}
