import { type LucideIcon, Loader2 } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";

/**
 * Button — SPEC-foundation §4.1.
 *
 * Four variants, three sizes, six states (default, hover, focus-visible,
 * active, disabled, loading). Active state adds motion-safe:scale-[0.97] press
 * feedback; gated under motion-safe so prefers-reduced-motion users see only
 * the color change. All colors, spacing, radius, type and motion are
 * design tokens from theme.css (docs/brand-tokens.md + SPEC §2 motion); no hex,
 * rgb, or arbitrary Tailwind values.
 *
 * Accessibility: global focus-visible ring (2px `focus-ring` token =
 * accent-2-600, 2px offset);
 * loading sets `aria-busy` and blocks interaction while keeping width; an
 * icon-only button (no children) is square and REQUIRES an `aria-label`.
 *
 * Contrast note: the primary fill is accent-2-700 (~4.8:1 with text-inverse),
 * hover accent-2-800, active accent-2-900. accent-2-600 white text is only
 * ~3.3:1 (below AA 4.5:1 for the 12–16px label), so it is not used for filled
 * text surfaces. Resolved in QUESTIONS.md Q9; SPEC §4.1 matches.
 *
 * @example
 * import { Plus } from "lucide-react";
 * import { Button } from "@osteojp/ui";
 *
 * <Button variant="primary" iconLeft={Plus}>{t("patient.add")}</Button>
 * <Button variant="ghost" size="sm" iconLeft={X} aria-label={t("common.close")} />
 * <Button variant="primary" loading>{t("common.save")}</Button>
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy, blocks interaction, preserves width. */
  loading?: boolean;
  /** Leading icon (lucide). Rendered at 20px, stroke 1.75, decorative. */
  iconLeft?: LucideIcon;
  /** Trailing icon (lucide). Rendered at 20px, stroke 1.75, decorative. */
  iconRight?: LucideIcon;
  children?: ReactNode;
}

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(" ");

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded font-semibold " +
  "whitespace-nowrap select-none align-middle transition duration-fast ease-standard " +
  "motion-safe:active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:border-transparent disabled:shadow-none " +
  "disabled:bg-surface-muted disabled:text-text-muted";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-2-700 text-text-inverse hover:bg-accent-2-800 active:bg-accent-2-900",
  secondary:
    "bg-surface text-text-primary border border-border-strong hover:bg-surface-muted active:bg-neutral-200",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary active:bg-neutral-200",
  // error now has a 50–900 scale (QUESTIONS.md Q10); base = error-700, so
  // hover/active step to error-800 / error-900 per SPEC §4.1.
  destructive:
    "bg-error text-text-inverse hover:bg-error-800 active:bg-error-900",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

/** Icon-only buttons are square (height === width) with no horizontal padding. */
const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 w-8 px-0",
  md: "h-10 w-10 px-0",
  lg: "h-12 w-12 px-0",
};

const Spinner = () => (
  <Loader2 className="animate-spin" size={20} strokeWidth={1.75} aria-hidden="true" />
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconLeft: IconLeft,
    iconRight: IconRight,
    children,
    className,
    type,
    disabled,
    onClick,
    ...rest
  },
  ref,
) {
  const isIconOnly = children == null || children === false;

  if (
    process.env.NODE_ENV !== "production" &&
    isIconOnly &&
    !rest["aria-label"] &&
    !rest["aria-labelledby"]
  ) {
    // SPEC §3 / a11y baseline: icon-only controls must expose an accessible name.
    console.warn(
      "Button: an icon-only button (no children) requires an `aria-label`.",
    );
  }

  // Loading keeps the rendered width: with a leading icon the spinner swaps in
  // place of it (same 20px) and the label stays; without one, the content is
  // held at opacity-0 and a centered spinner overlays it.
  const overlaySpinner = loading && !IconLeft;
  const leading = loading
    ? IconLeft
      ? <Spinner />
      : null
    : IconLeft
      ? <IconLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      : null;

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cx(
        BASE,
        VARIANTS[variant],
        isIconOnly ? ICON_ONLY_SIZES[size] : SIZES[size],
        loading && "pointer-events-none",
        className,
      )}
      {...rest}
    >
      <span
        className={cx(
          "inline-flex items-center justify-center gap-2",
          overlaySpinner && "opacity-0",
        )}
      >
        {leading}
        {!isIconOnly && <span>{children}</span>}
        {IconRight && !loading && (
          <IconRight size={20} strokeWidth={1.75} aria-hidden="true" />
        )}
      </span>
      {overlaySpinner && (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
});
