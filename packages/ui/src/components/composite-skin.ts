import { cx } from "./control-skin";

/**
 * Shared skin for the W2-01 composite components (Combobox, DatePicker,
 * TimeField). Mirrors the Input control skin but consumes the corrected
 * `focus-ring` token (accent-2-600, brand-tokens §1.9) rather than the older
 * accent-2-500 ring baked into control-skin (an existing file this wave may not
 * modify). The a11y reviewer now enforces the accent-2-600 ring, so new
 * surfaces use it directly.
 */
export { cx };

/** Global focus-visible ring using the corrected `focus-ring` token. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

/** Input-skin frame (surface bg, border, focus border + ring, invalid, disabled). */
export const fieldSkin = (invalid?: boolean): string =>
  cx(
    "w-full rounded bg-surface text-sm text-text-primary placeholder:text-text-muted",
    "transition-colors duration-fast ease-standard border",
    invalid
      ? "border-error"
      : "border-border-strong focus:border-accent-2-500 focus-within:border-accent-2-500",
    FOCUS_RING,
    "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted",
  );
