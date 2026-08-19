# LEARNINGS

Process lessons from the OsteoJP portal build, one entry per lesson. Newest at
the bottom, because the order they were learned in is part of the record.

**This file is for the mistake and the prevention, not for the fix.** A defect in
the product belongs on a board card. A defect in HOW WE WORK belongs here: what
happened, what it cost, and the specific practice that stops the next one. An
entry with no prevention line is not an entry.

Related, and deliberately kept separate: `PORTAL-REHYDRATE.md` §1.3 carries the
one principle every terminal boots with, and §7.1 the standing rules that came
out of these. When a lesson here hardens into a rule, it moves there and this
entry stays as its provenance.

> **PROVENANCE OF THE FILE ITSELF, 2026-08-19.** This file did not exist until
> today. A dispatch asked for two entries to be appended to `LEARNINGS.md`; a
> full history search (`git log --all --diff-filter=A -- "*LEARNINGS*"`, and a
> `--name-only` sweep of every commit on every branch) found no such path had
> ever been committed in this repository. Nothing was overwritten and nothing was
> recovered; the file was created here, and the mismatch was reported in the same
> session's status report rather than resolved silently.

---

## 1. A stray `git stash pop` popped somebody else's stash

**2026-08-19.** A `git stash pop` was run without checking what was on top of the
stack. The INSTANCE is reported from the run that ended at `d69270a`; the STACK
STATE quoted below was read this session with `git stash list` at that same sha,
and it still holds. The stack's top entry was **not this session's** - it was
`On portal/GUEST-06-queue-convert-action: item-c-and-script`, left behind by
earlier work on an unrelated branch. Popping it applied that old change on top of
the current tree and **conflicted `docs/board/portal-board.json` plus two other
files**. The board was restored from `HEAD`.

**WHY IT IS WORSE THAN A NORMAL CONFLICT, which is the reason it is written down
rather than shrugged off.** `git stash pop` is reached for as an *undo* - the
mental model is "put back what I just set aside", and in that model the stack has
exactly one entry and it is yours. The stack is **repository-wide and it
persists across branches and across sessions**. So the command that felt like
restoring your own work silently reached for a different session's, on a
different branch, from a different day. And because the tree afterwards contains
plausible-looking content rather than obvious garbage, the mistake presents as a
merge conflict rather than as "you have just applied a stranger's change" - which
is the §1.3 shape exactly: an unknown case wearing the face of a known one.

The board file made it expensive rather than merely annoying. A 400KB JSON file
with a conflict in it cannot be eyeballed, and a bad resolution drops cards
invisibly - the same hazard `PORTAL-REHYDRATE.md` §1.2 already flags for the
two-lane collision case.

**PREVENTION, and it is one command.** **Run `git stash list` FIRST and confirm
the top entry belongs to THIS session before any `pop`.** The listing names the
branch each stash was taken on, which is enough to tell. If it is not yours, or
you are not certain, **do not pop: apply by name** - `git stash apply stash@{n}`
against the entry you actually mean, which also leaves the stack intact if you
are wrong. Reserve bare `git stash pop` for the case where you created the stash
in the same session and nothing has happened since.

**Still true as of this writing:** three stashes are on the stack, and the top one
is still that same GUEST-06 entry. Nothing has been popped or dropped - deleting
another session's stash is destructive and owner-confirmable - so the next
terminal to run a bare `pop` in this repository hits exactly the same thing.

---

## 2. A hand-set `lane` was rejected by the validator, and the derivation was right

**2026-08-19.** A board card was edited with its `lane` written in by hand.
`node docs/board/validate-board.mjs` rejected it and the derivation was right;
the hand-set value was wrong.

**PROVENANCE, kept explicit because this file is only worth reading if it is
honest about what it saw.** The INSTANCE is reported from the run that ended at
`d69270a` and is not something this terminal watched happen. The MECHANISM below
was re-derived from `docs/board/validate-board.mjs` at `d69270a` and is not taken
from the report: `deriveLane()` and the check that follows it
(`lane "..." contradicts status/blocked_on - derived lane is "..."`) are both in
that file and were read this session.

**WHY THE VALIDATOR IS RIGHT AND THE HAND CANNOT BE.** `lane` is not a fact about
the card, it is a **function of two facts** - `home_lane` (the card's KIND, which a
human does set) and the card's state (`status`, and `blocked_on` when the status
is `blocked`). `deriveLane()` in `validate-board.mjs` is the whole rule: `status
== shipped` gives `shipped`; a `home_lane == in_flight` card that is `blocked` on
a named person gives `blocked_on_people`; everything else keeps its `home_lane`.
Writing `lane` by hand does not record a decision, it records a **guess at the
output of that function**, and a guess can disagree with its own inputs.

The failure mode it prevents is specific and has bitten this board: a card whose
status changes but whose lane does not **keeps sitting in the old column on the
owner's render**. It looks shipped in one view and in flight in another, and
because the render is Ivan's only status surface, the wrong half is what he
reads. The validator turning that into a red gate is the feature.

**PREVENTION.** **Never hand-set `lane`. Set `home_lane` and the state fields, and
let the derivation place the card.** When editing the board programmatically,
either omit `lane` and let the validator's rule tell you what it must be, or
compute it with the same three-line rule rather than typing a value. The
validator is not a formatter to be satisfied - it is the only thing standing
between a status change and a stale column.

This restates `PORTAL-REHYDRATE.md` §4.3, which already says it. The entry is
here because a rule that is written down and still broken needs its instance
recorded, not just its text repeated.
