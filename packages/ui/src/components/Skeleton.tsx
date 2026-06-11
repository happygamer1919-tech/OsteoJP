import { type ReactNode } from "react";

/**
 * Skeleton + helpers — SPEC-foundation §4.10.
 *
 * A surface-muted placeholder that pulses while content loads and goes static
 * under prefers-reduced-motion (the global rule collapses the animation).
 * Skeletons mirror real layout dimensions so content does not jump on load —
 * size them with `className` (e.g. h-4 w-32, size-10).
 *
 * Variants: `text` (a text line), `block` (token-sized rect), `circle`.
 * Composition helpers: SkeletonText (n stacked lines), SkeletonTable (rows×cols).
 *
 * @example
 * <Skeleton variant="circle" className="size-10" />
 * <SkeletonText lines={3} />
 * <SkeletonTable rows={5} cols={4} />
 */
export type SkeletonVariant = "text" | "block" | "circle";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function Skeleton({ variant = "block", className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block animate-pulse bg-surface-muted",
        variant === "text" && "h-4 rounded",
        variant === "block" && "rounded",
        variant === "circle" && "rounded-full",
        className,
      )}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className,
}: SkeletonTableProps): ReactNode {
  return (
    <div className={cx("flex flex-col gap-3", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} variant="text" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
