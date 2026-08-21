"use client";

import { useTransition } from "react";

import { s } from "@/lib/i18n";
import { revokeFollowupPostponement } from "@/lib/followup/actions";

/**
 * RB-01 — the patients currently postponed out of the list.
 *
 * IT IS A SECTION AND NOT A HIDDEN STATE, which is the card's requirement
 * ("reversible, and the reversal is recorded rather than erasing the row -
 * visible who and when on both halves"). A postponement that vanishes from
 * every screen is indistinguishable from one that never happened, and it is
 * also unrecoverable from a misclick: without this list, a receptionist who
 * postpones the wrong patient by twelve weeks has no way back.
 */

export type PostponedRow = {
  id: string;
  patientId: string;
  fullName: string;
  /** Preformatted in Europe/Lisbon by the server. */
  until: string;
  byName: string | null;
};

export function Postponed({ rows }: { rows: PostponedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-v2 border border-v2-border bg-surface-muted p-6 text-center">
        <p className="text-sm text-v2-text-secondary">{s["followup.postponed.empty"]}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <PostponedCard key={r.id} row={r} />
      ))}
    </ul>
  );
}

function PostponedCard({ row }: { row: PostponedRow }) {
  const [pending, start] = useTransition();

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-v2 border border-v2-border bg-surface-base p-3">
      <div>
        <span className="text-sm font-semibold text-v2-text-primary">{row.fullName}</span>
        <p className="text-xs text-v2-text-secondary">
          {s["followup.postponed.until"].replace("{when}", row.until)}
          {" · "}
          {/* WHO, and "Adiado" without a name when the staff row is gone. The
              two are different facts and the screen says which one it has. */}
          {row.byName
            ? s["followup.postponed.by"].replace("{who}", row.byName)
            : s["followup.postponed.byUnknown"]}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await revokeFollowupPostponement(row.id);
          })
        }
        className="rounded-v2 border border-v2-border px-3 py-1.5 text-xs font-semibold"
      >
        {s["followup.postponed.revoke"]}
      </button>
    </li>
  );
}
