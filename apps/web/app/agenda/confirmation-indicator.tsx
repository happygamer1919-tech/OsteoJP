import { Check, Clock, X } from "lucide-react";

import { s } from "@/lib/i18n";
import type { AppointmentConfirmationStateValue } from "@/lib/scheduling/types";

/**
 * Confirmation indicator (BACKLOG "confirmation thumbs on appointment
 * preview", 0024). Displays `confirmationState` — pendente / confirmada /
 * recusada — which is a SEPARATE axis from the appointment's lifecycle
 * `status` (scheduled/confirmed/completed/cancelled/no_show). Never merge the
 * two: this renders regardless of `status` and never reads or sets it.
 *
 * Deliberately monochrome (icon shape carries the meaning, not color): the
 * lifecycle `status="confirmed"` already owns a green StatusBadge, so a
 * colored icon here would read as the same concept restated. Icon shape
 * (Clock / Check / X) plus a text label (visible in `showLabel` mode, `sr-only`
 * otherwise) means the state is never conveyed by color alone (WCAG 1.4.1).
 */
const ICON: Record<AppointmentConfirmationStateValue, typeof Check> = {
  pending: Clock,
  confirmed: Check,
  declined: X,
};

const LABEL_KEY: Record<AppointmentConfirmationStateValue, keyof typeof s> = {
  pending: "appointment.confirmationPending",
  confirmed: "appointment.confirmationConfirmed",
  declined: "appointment.confirmationDeclined",
};

export function ConfirmationIndicator({
  state,
  showLabel,
  className,
}: {
  state: AppointmentConfirmationStateValue;
  /** Render the label as visible text (drawer) instead of sr-only (compact preview). */
  showLabel?: boolean;
  className?: string;
}) {
  const Icon = ICON[state];
  const label = s[LABEL_KEY[state]];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 text-v2-text-secondary ${className ?? ""}`}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      {showLabel ? (
        <span className="text-xs">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
