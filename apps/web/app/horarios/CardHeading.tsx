import Link from "next/link";
import { StatusChip } from "@osteojp/ui";

import { s } from "@/lib/i18n";

/**
 * LE-inspector-and-editor-select-different-therapists — THE CARD AND THE
 * INSPECTOR ARE THE SAME SELECTION, ONE PRESS APART, AND THE CARD SAYS WHICH.
 *
 * The defect is structural: the inspector is ONE panel for the page, its
 * therapist coming from `?t=`, while the editors are one card PER therapist.
 * Nothing tied the two together, so the inspector could be answering about
 * somebody else while you edited.
 *
 * A `<Link>`, NOT A CLIENT BUTTON WITH `router.push`, and the difference is not
 * style. `?t=` is already the page's therapist selection and already reached by
 * a soft navigation from the inspector's own <Select>; a Link is that same
 * navigation, server-rendered, with no new client component and no new state to
 * disagree with the URL. The `#inspetor` fragment brings the panel into view,
 * because a card at the bottom of a roster changing an answer at the top of the
 * page is a change nobody can see.
 *
 * THE SELECTED CARD SHOWS A CHIP RATHER THAN THE LINK. It is not decoration: it
 * is the statement that this card and the panel above are about one person, made
 * where the person is working. Two affordances that both said "Ver no inspetor"
 * would leave the reader to compare a name at the top with a name here, which is
 * exactly the comparison that failed.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it does not move the inspector when an
 * EDITOR is opened. Firing a server round trip from a dialog's open handler
 * re-renders the tree under a dialog that is mid-open, and a dialog that closes
 * as you press it is a worse defect than the one being removed. It is also not
 * needed for the ruling: every editor already names its therapist - the two
 * range panels pass `title={... + therapistName}` (SCHED-04) and their
 * confirmations name them too since #1218, and the week editor sits under this
 * heading.
 */
export function CardHeading({
  id,
  label,
  period,
  inInspector,
}: {
  id: string;
  label: string;
  period: string;
  inInspector: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-medium text-v2-text-primary">{label}</h2>
      {inInspector ? (
        <span data-testid={`card-in-inspector-${id}`}>
          <StatusChip tone="success">{s["inspector.shownInInspector"]}</StatusChip>
        </span>
      ) : (
        <Link
          href={`/horarios?t=${encodeURIComponent(id)}&p=${encodeURIComponent(period)}#inspetor`}
          data-testid={`card-inspect-${id}`}
          className="rounded text-xs underline decoration-dotted underline-offset-2 text-v2-text-secondary hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {s["inspector.showInInspector"]}
        </Link>
      )}
    </div>
  );
}
