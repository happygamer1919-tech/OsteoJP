"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, StatusChip } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import { adjustPackSessionAction } from "@/lib/packs/actions";
import type { PackInstanceView } from "@/lib/packs/instances";

/**
 * W8-01c — the patient's pack instances with remaining sessions and the staff
 * manual consume/restore adjust control (the under-24h/no-show rule; audited,
 * NEVER a charge). Rendered in the Consultas tab. Renders nothing when the
 * patient has no packs.
 */
export function PatientPacks({
  patientId,
  instances,
  canAdjust,
}: {
  patientId: string;
  instances: PackInstanceView[];
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adjust(instanceId: string, direction: "consume" | "restore") {
    setBusy(`${instanceId}:${direction}`);
    setError(null);
    try {
      const r = await adjustPackSessionAction(instanceId, direction, patientId);
      if (!r.ok) {
        setError(
          r.error === "exhausted"
            ? s["packs.adjustExhausted"]
            : r.error === "complete"
              ? s["packs.adjustComplete"]
              : s["errors.generic"],
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (instances.length === 0) return null;

  return (
    <Card title={s["packs.sectionTitle"]}>
      <ul className="flex flex-col gap-3">
        {instances.map((inst) => {
          const active = inst.sessionsRemaining > 0;
          return (
            <li
              key={inst.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">{inst.packName}</span>
                <span className="text-xs text-text-secondary">{inst.baseServiceName}</span>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip tone={active ? "success" : "neutral"}>
                  {inst.sessionsRemaining}/{inst.sessionsTotal} {s["packs.sessions"]}
                </StatusChip>
                {canAdjust && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null || inst.sessionsRemaining <= 0}
                      onClick={() => adjust(inst.id, "consume")}
                    >
                      {s["packs.consume"]}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null || inst.sessionsRemaining >= inst.sessionsTotal}
                      onClick={() => adjust(inst.id, "restore")}
                    >
                      {s["packs.restore"]}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}
    </Card>
  );
}
