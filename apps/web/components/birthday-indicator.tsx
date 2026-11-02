import { type ElementType } from "react";
import { Cake } from "lucide-react";

import { s } from "@/lib/i18n";
import type { BirthdayRow } from "@/lib/patients/birthdays";

/**
 * Indicação de Aniversários, part 1: the birthday icon in the staff top bar
 * (Fisiozero parity, "Notificação de aniversariantes", "Ícone no topo da
 * página"). The shell draws it only when the tenant switched it on; it shows
 * today's count, and opens a short list of today's birthday patients, each a
 * link to the ficha.
 *
 * PROVISIONAL LOOK. Fisiozero's icon was not seen switched on (the switch was
 * off in the browser session of 2026-11-02), so its count badge, its zero state
 * and what its click opens are OsteoJP's guess until the owner's screenshot
 * arrives. At zero this draws the icon with no count, and the list says so.
 *
 * NO CLIENT JAVASCRIPT. A native `<details>`: the `<summary>` is a real button
 * to the keyboard (Tab, then Enter or Space opens and closes it) and to a
 * screen reader, and the links inside are ordinary tab stops.
 *
 * Its look follows the notification bell beside it: a 44px round target, the
 * secondary text colour, the same focus ring and the same badge.
 */
export function BirthdayIndicator({
  rows,
  linkComponent: Link = "a",
  className,
}: {
  rows: BirthdayRow[];
  /** next/link from the shell; a plain anchor in tests. */
  linkComponent?: ElementType;
  className?: string;
}) {
  const n = rows.length;
  const countText =
    n === 1 ? s["birthdays.countOne"] : s["birthdays.countMany"].replace("{n}", String(n));
  // The badge is visual; the count is also in the accessible name.
  const accessibleName = n > 0 ? `${s["birthdays.title"]}, ${countText}` : s["birthdays.title"];
  const shown = n > 99 ? "99+" : String(n);

  return (
    <details
      className={["relative", className].filter(Boolean).join(" ")}
      data-testid="birthday-indicator"
    >
      <summary
        title={s["birthdays.title"]}
        className="relative inline-flex size-11 cursor-pointer list-none items-center justify-center rounded-full text-v2-text-secondary transition-colors hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
      >
        <span className="sr-only">{accessibleName}</span>
        <Cake aria-hidden="true" size={20} strokeWidth={1.75} />
        {n > 0 && (
          <span
            aria-hidden="true"
            data-testid="birthday-count"
            className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-v2-green-700 px-1 text-[10px] font-medium leading-4 text-text-inverse"
          >
            {shown}
          </span>
        )}
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-v2 border border-v2-border bg-surface p-3 shadow-lg">
        <p className="mb-2 text-sm font-medium text-v2-text-primary">{s["birthdays.title"]}</p>
        {n === 0 ? (
          <p className="text-sm text-v2-text-secondary">{s["birthdays.empty"]}</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/patients/${r.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-v2 px-2 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  <span className="text-accent-2-700">{r.fullName}</span>
                  <span className="shrink-0 text-v2-text-secondary">
                    {r.age === 1
                      ? s["birthdays.turnsOne"]
                      : s["birthdays.turnsMany"].replace("{n}", String(r.age))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
