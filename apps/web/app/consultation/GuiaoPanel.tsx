import { GUIAO_SECTIONS, GUIAO_TITLE } from "./guiao-content";

/**
 * W5-34 - collapsible, read-only "Guião do Exame Subjetivo" reference for the
 * recording screen. Native <details>/<summary> so it is COLLAPSED by default,
 * keyboard-accessible, and needs no JS: expanding pushes the page layout down
 * (it never overlays or blocks the recording controls above it - no modal, no
 * fixed/absolute positioning, no focus trap). Read-only static content (no
 * inputs), pt only (an en translation is a noted follow-up). Content mirrors
 * docs/clinical/guiao-exame-subjetivo.md.
 */
export function GuiaoPanel() {
  return (
    <details
      data-testid="guiao-panel"
      className="rounded border border-border bg-surface text-sm"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
        {GUIAO_TITLE}
      </summary>
      <div className="flex flex-col gap-1 border-t border-border p-2">
        {GUIAO_SECTIONS.map((section) => (
          <details key={section.id} data-testid={`guiao-section-${section.id}`} className="rounded">
            <summary className="flex min-h-11 cursor-pointer list-none items-center px-2 py-2 text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
              {section.title}
            </summary>
            <ul className="flex list-disc flex-col gap-1.5 px-6 py-2 text-sm text-text-secondary">
              {section.items.map((item, i) => (
                <li key={i} className="break-words">
                  {item}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </details>
  );
}
