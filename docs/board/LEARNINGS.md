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

---

## 3. Diagnosed before reading the log, twice in one session

**2026-08-19.** An E2E shard ran 25 minutes against a 7-minute median and went
red. **Twice I stated a cause before opening the log, and both times I was
wrong.**

**FIRST: I blamed my own change.** The failing shard was the one carrying the
spec I had just edited, so I reported to the owner that it was "my change until
proven otherwise". The log said the shard had spent 23 of its 25 minutes in
`Start Supabase (lean stack)`, hit the known `CI-supabase-cli-setup-flaky`, and
was killed by the job ceiling **0.7 seconds after Playwright started**. Zero
tests ran. Nothing in that log was evidence about my change in either direction.

**SECOND: I generalised from one sample.** Having found Supabase in that one
outlier, I told the owner that *every* long run was the Supabase start step. The
very next kill was a completely different step — `apt-get` hanging against
`archive.ubuntu.com` inside the Playwright browser install, with no Supabase
involvement at all. Four distinct causes are now on record across the same
symptom.

**WHY THE FIRST ERROR IS THE MORE DANGEROUS ONE, and it is not the obvious
reason.** Blaming your own change *sounds* like the humble, careful assumption,
which is exactly what makes it hard to challenge. But it is still a claim about
cause made without evidence, and it points work at the wrong place: the honest
next step after "probably mine" is to start editing the diff, and the diff was
innocent. A wrong cause that flatters the speaker is still a wrong cause.

**WHY THE SECOND IS EASY TO REPEAT.** One sample plus a plausible mechanism reads
exactly like a diagnosis. Nothing about the experience distinguishes them: the
mechanism was real, the log did say Supabase, and the conclusion was still false
because a single observation cannot tell you what a *class* of failures is caused
by. This project's own e2e doctrine already says one green run proves nothing
that can race; one red run proves no more.

**PREVENTION, and both halves are needed.**
**Read the failing log before stating any hypothesis** — to strategy, to the
owner, or in a report. Not before *investigating*; before **speaking**. Saying
"I don't know yet, reading the log" costs one sentence and forecloses nothing.
**Never generalise a CI diagnosis from a single failure.** One occurrence is an
occurrence. A *class* needs a count, and if the count is one, say one.

Related, and the same family one layer out: [[verify-premises-not-transcribe]].
The repo's e2e doctrine is `ACC-preselection-spec-flaky`, whose reported cause
was wrong four times before anyone read the artifact.

---

## 4. A test harness that omitted the runner's shell flags

**2026-08-19.** A CI step needed a retry, so the retry logic was extracted from
the workflow YAML and exercised locally with a stubbed command. **Four cases
passed.** The same script was then killed by CI, twice, on two shards.

**THE CAUSE.** GitHub executes `run:` blocks as
`bash --noprofile --norc -e -o pipefail`. The harness ran the extracted script
under a plain `bash` with no flags. The script's own `set -uo pipefail` does
**not** remove that injected `-e`, so on the runner a bare failing call aborted
the step instantly and the retry beneath it was unreachable — the exact code path
the harness had reported as working.

**WHY IT PASSED LOCALLY AND FAILED REMOTELY IS THE WHOLE POINT.** The script was
byte-identical in both places. Nothing about the *code* differed. The environment
differed, and the environment was the thing under test — a retry only exists to
handle a failure, and how a shell behaves on failure is decided by its flags.
A harness that changes the flags is testing a different program that happens to
share source.

**THE SISTER DEFECT, found in the same harness minutes later.** Its stubbing used
`sed` with `\s`, which **BSD sed does not support**, so on macOS the
substitutions matched nothing and the real `sudo` and `sleep` ran underneath. A
substitution that matches nothing exits 0. The harness reported success while
stubbing nothing — the same shape as the thing it was built to catch, one level
further out.

**PREVENTION.** **A harness that simulates CI must reproduce the runner's shell
flags and injected options before any pass it reports counts as evidence.**
Copy the invocation verbatim (`bash --noprofile --norc -e -o pipefail`), do not
approximate it. And **stub with shell functions rather than text substitution**:
a function override either exists or does not, whereas a `sed` that fails to
match is indistinguishable from one that succeeded.

---

## 5. A negative control that changed nothing and reported a pass

**2026-08-19.** A fix was proven with a negative control: revert the change, and
confirm the guard goes red. The revert was done with a regex substitution. **It
replaced zero call sites**, the unmodified (already-correct) script ran, it
passed, and that pass was briefly read as "the old form works too".

**WHY IT IS WORSE THAN NO CONTROL AT ALL.** A missing negative control leaves you
knowing you have not checked. A *vacuous* one leaves you believing you have. The
output is indistinguishable from a real result — same command, same green, same
sentence in the report — and it arrives at precisely the moment you are looking
for reassurance, which is when scrutiny is lowest.

It is the same defect the negative control exists to detect, wearing the
control's own clothes: a check that cannot fail, reporting that it did not fail.
`ACC-vacuous-guard-sweep` counts 123 of these in the product's tests; this one
was in the *instrument*, which is where this project keeps finding them
(see [[osteojp-e2e-debugging-doctrine]]).

**PREVENTION.** **A negative control must assert the count of things it
changed.** `assert n == 2` before running it. A zero-change control proves
nothing and must fail loudly rather than pass quietly. The same rule covers every
mechanical edit made in order to test something: if the edit is the premise of
the experiment, the edit needs its own assertion.
