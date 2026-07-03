"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { appendPatientNoteAction } from "@/lib/patients/actions";

/**
 * Append-only note composer (W2-11). Adds a NEW revision to
 * `patient_note_revisions` for this patient; never edits an existing one.
 */
export function NotesComposer({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const content = text.trim();
    if (!content) {
      setError(s["patients.noteRequired"]);
      return;
    }
    startTransition(async () => {
      const r = await appendPatientNoteAction(patientId, content);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setText("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={s["patients.noteComposerPlaceholder"]}
        className="w-full resize-none rounded-md border border-border-strong bg-transparent p-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      />
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} variant="primary">
          {s["patients.noteAdd"]}
        </Button>
      </div>
    </form>
  );
}
