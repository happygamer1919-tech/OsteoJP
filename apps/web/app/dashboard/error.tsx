"use client";

import { Button, GlassCard } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/**
 * Dashboard error boundary (SPEC-v2-dashboard §7): a restrained glass error card
 * with a retry that re-renders. No red flood (SPEC-v2-foundation §10) — the
 * error tone is the brand error token on text only.
 */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <GlassCard title={s["dashboard.error.title"]}>
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-v2-text-secondary">{s["dashboard.error.help"]}</p>
          <Button onClick={reset} variant="primary">
            {s["common.retry"]}
          </Button>
        </div>
      </GlassCard>
    </main>
  );
}
