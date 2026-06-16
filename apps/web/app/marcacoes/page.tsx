import { CalendarClock } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptyState } from "@osteojp/ui";

import { requireRequestContext } from "@/lib/auth/context";
import { s } from "@/lib/i18n";

export const metadata = { title: "Marcações" };

/**
 * Marcações — placeholder route (V2-W0-05, SPEC-v2-foundation §7.2).
 *
 * The sidebar ships all seven nav items from day one; Marcações points here
 * until the V2-W7 bookings-list view (the same scheduling data the agenda
 * renders as a grid) ships. Presentation only — no data model, no new query.
 * The copy reuses existing i18n strings (no dedicated nav.bookings key yet;
 * packages/i18n is outside this task's allowlist).
 */
export default async function MarcacoesPage() {
  try {
    await requireRequestContext();
  } catch {
    redirect("/login");
  }

  return (
    <main className="min-h-dvh">
      <EmptyState
        icon={CalendarClock}
        title={s["patients.tabAppointments"]}
        description={s["patients.noUpcoming"]}
      />
    </main>
  );
}
