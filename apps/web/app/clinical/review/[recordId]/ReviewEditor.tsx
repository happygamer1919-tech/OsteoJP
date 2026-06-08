"use client";
import { useActionState, useState } from "react";
import { s } from "@/lib/i18n";

export type ReviewSaveState = {
  ok: boolean;
  code?: string;
  /** Present when code === "not_narrative_field": rejected key → reason. */
  rejected?: Record<string, string>;
};

const initialState: ReviewSaveState = { ok: false };

/**
 * Narrative-only review editor. The reviewer edits the draft's free-text
 * narrative fields as JSON; coded + safety fields are never shown here and are
 * rejected server-side if smuggled in. Finalize signs + locks the record.
 */
export function ReviewEditor({
  recordId,
  initialNarrative,
  saveAction,
  finalizeAction,
}: {
  recordId: string;
  initialNarrative: Record<string, string>;
  saveAction: (prev: ReviewSaveState, formData: FormData) => Promise<ReviewSaveState>;
  finalizeAction: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(saveAction, initialState);
  const [narrative, setNarrative] = useState<string>(
    JSON.stringify(initialNarrative, null, 2),
  );

  const errorMessage =
    state.code === "not_narrative_field"
      ? s["review.notNarrative"]
      : state.code === "invalidJson"
        ? s["review.invalidJson"]
        : state.code === "finalized"
          ? s["clinical.finalized"]
          : state.code
            ? s["review.error"]
            : null;

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-2">
        <label className="block text-sm font-medium" htmlFor={`narrative-${recordId}`}>
          {s["review.narrativeLabel"]}
        </label>
        <p className="text-xs text-text-secondary">{s["review.narrativeHint"]}</p>
        <textarea
          id={`narrative-${recordId}`}
          name="narrative"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={14}
          className="w-full rounded border px-3 py-2 font-mono text-xs"
        />
        {!state.ok && errorMessage && <p className="text-sm text-error">{errorMessage}</p>}
        {!state.ok && state.rejected && (
          <p className="text-xs text-error">
            {Object.keys(state.rejected).join(", ")}
          </p>
        )}
        {state.ok && <p className="text-sm text-success">{s["review.saved"]}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-3 py-1.5 text-sm font-medium"
        >
          {s["review.save"]}
        </button>
      </form>

      <form action={finalizeAction}>
        <button
          type="submit"
          className="rounded bg-brand-magenta px-3 py-1.5 text-sm font-medium text-text-inverse"
        >
          {s["review.finalize"]}
        </button>
      </form>
    </div>
  );
}
