import type { GuestIntakeDisplay } from "@/lib/guest-intake/view";

/**
 * INTAKE-01 - one guest clinical intake, read-only, as staff see it.
 *
 * Rendered in two places: beside the request in reception's guest queue (inside
 * a client component) and on the patient ficha (a server component). So it has
 * no hooks and imports only a TYPE: nothing here can pull a server module into
 * the browser bundle.
 *
 * `whitespace-pre-wrap` keeps the person's own line breaks: verbatim means the
 * shape of what they wrote, not only the words. React escapes the text, so a
 * guest's answer can never become markup on a staff screen.
 */
export function GuestIntakeAnswers({ display }: { display: GuestIntakeDisplay }) {
  return (
    <div data-testid="guest-intake-answers" className="flex flex-col gap-3">
      <p className="text-xs text-text-secondary">{display.attribution}</p>
      <dl className="flex flex-col gap-2">
        {display.rows.map((row) => (
          <div
            key={row.field}
            data-field={row.field}
            className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4"
          >
            <dt className="shrink-0 text-sm text-text-secondary sm:w-48">{row.label}</dt>
            <dd
              className={`whitespace-pre-wrap break-words text-sm text-text-primary${
                row.emphasis ? " font-semibold" : ""
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="flex flex-col gap-1 border-t border-v2-border pt-2 text-xs text-text-secondary">
        {display.meta.map((m) => (
          <div key={m.label} className="flex flex-wrap gap-1">
            <dt>{m.label}:</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-text-secondary">{display.caveat}</p>
    </div>
  );
}
