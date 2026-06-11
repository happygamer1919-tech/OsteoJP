/**
 * Shared visual skin for text controls (Input, Textarea) — SPEC-foundation §4.2.
 * Surface bg, 1px border-strong, default radius, accent-2-500 border + global
 * focus ring on focus, error border when invalid, muted surface when disabled.
 * Token-only; the focus border/ring transitions use the W1-01 motion tokens.
 */
export const cx = (
  ...classes: Array<string | false | null | undefined>
): string => classes.filter(Boolean).join(" ");

export const controlSkin = (invalid: boolean): string =>
  cx(
    "w-full rounded bg-surface text-sm text-text-primary",
    "placeholder:text-text-muted",
    "transition-colors duration-fast ease-standard",
    "border",
    invalid
      ? "border-error"
      : "border-border-strong focus:border-accent-2-500",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted",
  );
