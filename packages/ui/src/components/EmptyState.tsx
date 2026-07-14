import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

/**
 * EmptyState — SPEC-foundation §4.10.
 *
 * Centered column (gap space-4, py space-12): a 48px accent-1-50 icon badge
 * (24px accent-1-700 icon), an h3 headline, a one-line body-sm guidance, and an
 * optional action. Tone per brand-voice: an empty screen is an invitation to
 * act, never an apology. Strings come from screens via i18n.
 *
 * W7-03: the decorative azulejo motif band (HeritageBand) that used to render
 * ABOVE the badge is GONE, platform-wide — it was the "unwanted line" the owner
 * kept seeing. The `heritage` prop and the HeritageBand component were removed
 * outright rather than merely left unset, so no future call site can bring the
 * ornament back. An empty state is now exactly: icon, title, subtitle, action.
 *
 * The badge carries the brand instead of the ornament: accent-1-700 (logo
 * purple) on accent-1-50 — 8.43:1, far above the 3:1 a graphical object needs.
 * One of the defined purple roles in the 55/25/20 equity.
 *
 * @example
 * <EmptyState icon={Users} title={t("patients.empty.title")}
 *   description={t("patients.empty.help")}
 *   action={<Button iconLeft={Plus}>{t("patients.add")}</Button>} />
 */
export interface EmptyStateProps {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Optional primary/secondary action button. */
  action?: ReactNode;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-4 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-1-50">
        <Icon
          size={24}
          strokeWidth={1.75}
          aria-hidden="true"
          className="text-accent-1-700"
        />
      </span>

      <div className="flex flex-col gap-1">
        <h3 className="text-xl text-text-primary">{title}</h3>
        {description != null && (
          <p className="text-sm text-text-secondary">{description}</p>
        )}
      </div>

      {action != null && <div className="mt-2">{action}</div>}
    </div>
  );
}
