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
 * Contrast note: the primary fill is v2-green-700 (~4.7:1 with text-inverse),
 * hover v2-green-800, active v2-green-900. THE LABEL VARIANTS USE 800, NOT 700 —
 * this note previously claimed "v2-green-700 text on light surfaces
 * (secondary/ghost) also clears AA (§3.4 SPEC)", which is true on white and
 * FALSE on every other light surface in theme.css. See the measured table beside
 * VARIANTS below and packages/ui/src/contrast-aa.test.ts, which now fails if the
 * claim is ever reintroduced. Originally resolved in QUESTIONS.md Q9.
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
  // v2-green-700 (#4E7D6B) + white ≈ 4.7:1 — AA compliant. This is the FILL,
  // where the background is the token and the text is white, so it is unaffected
  // by the correction below.
  primary:
    "bg-v2-green-700 text-text-inverse hover:bg-v2-green-800 active:bg-v2-green-900",
  // ================================================================= //
  // LABEL GREEN IS 800, NOT 700, AND THE REASON IS A MEASURED FAILURE.
  // ================================================================= //
  // These two variants put the green on the SURFACE as TEXT, and the surface is
  // not always white. v2-green-700 clears AA on `surface` (#FFFFFF, 4.70:1) and
  // MISSES IT ON EVERY OTHER LIGHT SURFACE THIS REPO DEFINES:
  //   bg #F7F9FB            4.45   the portal's page background
  //   surface-muted #F0F3F6 4.22
  //   v2-bg #F7F8FA         4.42
  //   v2-green-50 #EFF7F3   4.31   these two are the variants' OWN hover and
  //   v2-green-100 #DCEDE5  3.87   active tints, so secondary failed on hover
  // Found by PG9's axe scan on /portal/booking, where the ghost back button is
  // the one control rendered directly on `bg` rather than inside a white card:
  // one color-contrast violation, on one screen, at 4.45:1 against a 4.5
  // threshold. The dashboard's ghost and secondary buttons passed the same scan
  // because they sit inside Cards, which is why the defect survived.
  //
  // v2-green-800 (#3C6052) clears AA on all six: 5.79:1 at worst, 7.03:1 on
  // white. The token itself is NOT changed — it is correct as a fill, and its
  // §3.4 note in theme.css is corrected to say which surfaces it holds on.
  secondary:
    "bg-surface text-v2-green-800 border border-v2-green-700 hover:bg-v2-green-50 active:bg-v2-green-100",
  ghost:
    "bg-transparent text-v2-green-800 hover:bg-v2-green-50 hover:text-v2-green-900 active:bg-v2-green-100",
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
