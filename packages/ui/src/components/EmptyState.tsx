import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { HeritageBand } from "./HeritageBand";

/**
 * EmptyState — SPEC-foundation §4.10.
 *
 * Centered column (gap space-4, py space-12): a 48px surface-muted icon badge
 * (24px text-secondary icon), an h3 headline, a one-line body-sm guidance, and
 * an optional action. Tone per brand-voice: an empty screen is an invitation to
 * act, never an apology. Strings come from screens via i18n.
 *
 * When `heritage` is set, the azulejo HeritageBand renders above the badge
 * (SPEC §7.7): a space-12 motif band at a legible space-6 tile height, with a
 * space-6 gap down to the badge so the heavier band has room. It is decorative
 * (aria-hidden) and, like every heritage surface, stays off patient-facing
 * portal screens until JP sign-off (Q6).
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
  /** Render the azulejo HeritageBand above the badge (decorative, §7.7). */
  heritage?: boolean;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  heritage = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-4 py-12 text-center",
        className,
      )}
    >
      {heritage && <HeritageBand className="mb-2" />}

      <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
        <Icon
          size={24}
          strokeWidth={1.75}
          aria-hidden="true"
          className="text-text-secondary"
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
