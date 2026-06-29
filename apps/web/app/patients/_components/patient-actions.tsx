"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { Button } from "@osteojp/ui";
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
        setError(err instanceof Error ? err.message : s["errors.generic"]);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-3">
        {isDeleted ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePatient(patientId))}
            variant="secondary"
            size="sm"
          >
            {s["patients.restore"]}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(s["patients.confirmDelete"])) {
                run(() => softDeletePatient(patientId));
              }
            }}
            variant="destructive"
            size="sm"
          >
            {s["patients.delete"]}
          </Button>
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
          <span className="text-xs text-text-secondary">{s["patients.mergeHint"]}</span>
          <div className="flex gap-2">
            <input
              aria-label={s["patients.mergeIntoLabel"]}
              value={survivorId}
              onChange={(e) => setSurvivorId(e.target.value)}
              placeholder={s["patients.mergeIntoLabel"]}
              className="flex-1 rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
            <Button
              type="submit"
              disabled={pending || survivorId.trim().length === 0}
              variant="secondary"
              size="sm"
            >
              {s["patients.mergeSubmit"]}
            </Button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  );
}
