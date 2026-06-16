import { type MouseEventHandler, type ReactNode } from "react";

import { type V2Accent, V2_ACCENT_TINT } from "./v2-accent";

/**
 * QuickActionTile — SPEC-v2-foundation §9, SPEC-v2-dashboard §3.
 *
 * A 160x160 glass tile (`size-40` = 40 * 4px) for an "Acessos rápidos" action:
 * a large accent-tinted icon over a label, on the `v2-radius` glass surface.
 * It is a single tab stop and acts as a link (`href`) or a button (`onClick`),
 * with the §8 hover lift (`translateY(-4px)`, suppressed under reduced motion).
 *
 * Role gating (hiding a tile the role cannot use) and grid reflow are the
 * screen's job; the tile renders whatever it is given.
 *
 * @example
 * <QuickActionTile icon={<CalendarPlus />} label="Nova Marcação" href="/agenda/nova" />
 */
export interface QuickActionTileProps {
  icon: ReactNode;
  label: ReactNode;
  /** Renders as a link (one tab stop). */
  href?: string;
  /** With no href, renders as a button (one tab stop). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Accent family for the icon (default blue). */
  accent?: V2Accent;
  className?: string;
  "aria-label"?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function QuickActionTile({
  icon,
  label,
  href,
  onClick,
  accent = "blue",
  className,
  "aria-label": ariaLabel,
}: QuickActionTileProps) {
  const tint = V2_ACCENT_TINT[accent];

  const classNames = cx(
    "glass-card hover-lift flex size-40 cursor-pointer flex-col items-center " +
      "justify-center gap-3 p-6 text-center focus-visible:outline-none " +
      "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
    className,
  );

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "flex size-12 items-center justify-center rounded-full",
          tint.circle,
          tint.icon,
        )}
      >
        {icon}
      </span>
      <span className="text-sm font-medium text-v2-text-primary">{label}</span>
    </>
  );

  if (href != null) {
    return (
      <a href={href} className={classNames} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classNames} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
