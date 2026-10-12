import { Banner } from "@osteojp/ui";

import { conflictLines } from "@/lib/scheduling/conflict-lines";
import type { ConflictInfo } from "@/lib/scheduling/types";

/**
 * The conflict warning of a refused appointment save: the agenda's edit panel
 * and the Terapeuta field of the ficha's "Gerir marcação" (MARC-THERAPIST-01)
 * both draw this one, so a conflict reads the same from either screen. The
 * words are lib/scheduling/conflict-lines.ts; whether a "Guardar mesmo assim"
 * sits beside it is each screen's own business.
 */
export function ConflictBanner({ conflicts }: { conflicts: readonly ConflictInfo[] }) {
  return (
    <Banner tone="warning">
      <span className="flex flex-col gap-1" data-testid="conflict-lines">
        {conflictLines(conflicts).map((line) => (
          <span key={line.kind} className="block">
            <span className="font-medium">{line.heading}</span>
            {": "}
            {line.text}
          </span>
        ))}
      </span>
    </Banner>
  );
}
