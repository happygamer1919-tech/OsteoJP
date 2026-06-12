"use client";

import { CircleAlert } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "./Button";

/**
 * ErrorState — SPEC-foundation §4.10.
 *
 * The EmptyState skeleton with a CircleAlert in `error`: headline, a
 * plain-language cause, and a retry action wired to a callback. Never put a raw
 * error code in the headline — pass it as `code` and it renders on a small,
 * de-emphasized line for support reference.
 *
 * (The code line uses text-secondary rather than text-muted: text-muted fails
 * WCAG AA on white; see QUESTIONS.md Q11/Q12 for the systemic note.)
 *
 * @example
 * <ErrorState title={t("records.error.title")}
 *   description={t("records.error.cause")} code="REF-500"
 *   retryLabel={t("common.retry")} onRetry={refetch} />
 */
export interface ErrorStateProps {
  title: ReactNode;
  /** Plain-language cause (never a raw error code). */
  description?: ReactNode;
  /** Optional support reference (e.g. an error id), shown de-emphasized. */
  code?: ReactNode;
  retryLabel?: ReactNode;
  onRetry?: () => void;
  className?: string;
}

const cx = (...c: Array<string | false | null | undefined>): string =>
  c.filter(Boolean).join(" ");

export function ErrorState({
  title,
  description,
  code,
  retryLabel,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-4 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-muted">
        <CircleAlert
          size={24}
          strokeWidth={1.75}
          aria-hidden="true"
          className="text-error"
        />
      </span>

      <div className="flex flex-col gap-1">
        <h3 className="text-xl text-text-primary">{title}</h3>
        {description != null && (
          <p className="text-sm text-text-secondary">{description}</p>
        )}
        {code != null && <p className="text-xs text-text-secondary">{code}</p>}
      </div>

      {onRetry != null && retryLabel != null && (
        <Button onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
