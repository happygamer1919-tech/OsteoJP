"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import {
  mergePatients,
  restorePatient,
  softDeletePatient,
} from "../../../lib/patients/actions";

const s = getStrings(DEFAULT_LOCALE);

// Destructive controls (soft-delete / restore / merge). Only rendered when the
// caller's role holds patients:delete — the server actions re-check anyway.
export function PatientActions({
  patientId,
  isDeleted,
}: {
  patientId: string;
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [survivorId, setSurvivorId] = useState("");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4">
      <div className="flex flex-wrap gap-3">
        {isDeleted ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePatient(patientId))}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {s["patients.restore"]}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(s["patients.confirmDelete"])) {
                run(() => softDeletePatient(patientId));
              }
            }}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
          >
            {s["patients.delete"]}
          </button>
        )}
      </div>

      {!isDeleted && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const survivor = survivorId.trim();
            if (survivor) {
              run(() =>
                mergePatients({ survivorId: survivor, loserId: patientId }),
              );
            }
          }}
          className="flex flex-col gap-1.5"
        >
          <span className="text-xs text-zinc-500">{s["patients.mergeHint"]}</span>
          <div className="flex gap-2">
            <input
              value={survivorId}
              onChange={(e) => setSurvivorId(e.target.value)}
              placeholder={s["patients.mergeIntoLabel"]}
              className="flex-1 rounded border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-[#3DAEB3]"
            />
            <button
              type="submit"
              disabled={pending || survivorId.trim().length === 0}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {s["patients.mergeSubmit"]}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
