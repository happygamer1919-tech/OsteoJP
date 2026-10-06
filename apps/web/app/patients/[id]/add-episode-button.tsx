"use client";

import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@osteojp/ui";

/**
 * EPI-01b, piece 2: the submit button of a "+ Episódio" form (the form on the
 * Registos tab, and the confirmation that opens another episode of a specialty
 * that already has an open one). Like "+ Avaliação"'s button, its only job
 * beyond a plain submit is to hold still while the action runs, so a second
 * click or a second Enter cannot post twice. The form, its fields and the
 * action are the server page's; nothing is decided here.
 */
export function AddEpisodeButton({
  label,
  ariaLabel,
  testId,
  plus = false,
}: {
  label: string;
  ariaLabel?: string;
  testId: string;
  /** Draw the plus icon before the label ("+ Episódio"). */
  plus?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      iconLeft={plus ? Plus : undefined}
      loading={pending}
      disabled={pending}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {label}
    </Button>
  );
}
