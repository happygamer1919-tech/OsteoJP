"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { s } from "@/lib/i18n";
import { saveQuickNotes } from "@/lib/dashboard/actions";

const MAX_LEN = 2000;

/**
 * Notas rápidas — per-staff private scratchpad. Each staff member has their
 * own isolated note; notes are NOT shared across the team. Persists via a
 * server action; RLS enforces staff_user_id = auth.uid() at the DB layer.
 */
export function NotasRapidas({ initialNotes }: { initialNotes: string }) {
  const [optimistic, setOptimistic] = useOptimistic(initialNotes);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = textareaRef.current?.value ?? "";
    setSaved(false);
    startTransition(async () => {
      setOptimistic(text);
      await saveQuickNotes(text);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        ref={textareaRef}
        name="notes"
        defaultValue={optimistic}
        maxLength={MAX_LEN}
        rows={4}
        aria-label={s["dashboard.notes"]}
        placeholder={s["dashboard.notesPlaceholder"]}
        className="w-full resize-none rounded-md border border-v2-border bg-transparent p-3 text-sm text-v2-text-primary placeholder:text-v2-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      />
      <div className="flex items-center justify-end gap-3">
        {saved && !pending && (
          <p role="status" className="text-xs text-v2-text-secondary">
            {s["dashboard.notesSaved"]}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {pending ? s["common.loading"] : s["common.save"]}
        </button>
      </div>
    </form>
  );
}
