"use client";

import { GlassCard } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/**
 * Dashboard error boundary (SPEC-v2-dashboard §7): a restrained glass error card
 * with a retry that re-renders. No red flood (SPEC-v2-foundation §10) — the
 * error tone is the brand error token on text only.
 */
const retryBtn =
  "inline-flex h-10 items-center justify-center rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition duration-fast ease-standard motion-safe:active:scale-[0.97] hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

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
          <button type="button" onClick={reset} className={retryBtn}>
            {s["common.retry"]}
          </button>
        </div>
      </GlassCard>
    </main>
  );
}
