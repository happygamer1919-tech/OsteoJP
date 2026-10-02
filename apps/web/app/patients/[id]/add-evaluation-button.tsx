"use client";

import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { Button } from "@osteojp/ui";

/**
 * EPI-01b: the submit button of a group's "+ Avaliação" form. Its only job
 * beyond a plain submit is to hold still while the action runs: a second click
 * would file a second draft (and, on an imported group, open a second episode).
 * `loading` sets aria-busy and blocks the pointer (packages/ui Button); `disabled`
 * blocks a second Enter from the keyboard as well. The form,
 * its hidden fields and the action are the server page's; nothing is decided here.
 */
export function AddEvaluationButton({ label, ariaLabel }: { label: string; ariaLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      iconLeft={Plus}
      loading={pending}
      disabled={pending}
      aria-label={ariaLabel}
      data-testid="record-group-add-evaluation"
    >
      {label}
    </Button>
  );
}
