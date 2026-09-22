# The gate freeze: what is in it, and the one rule about re-pinning

`.github/gate-manifest.json` pins the sha256 of every file that can change a
**required check's verdict**. `scripts/assert-gates-unchanged.mjs` runs inside
the required `Lint + typecheck + test` job and fails when one of them moves.
It exists because SR-71 — *"a lane never edits a gate to pass its own PR"* —
was written and then breached twice on the same day.

## The criterion for membership

**A file belongs here if editing it can change a required check's verdict.**

That is the whole test, ruled by the owner on 2026-09-22. It is why the set
includes things that do not look like gates (`.env.example` is the *input* the
`env-example-covers-the-code` guard compares code against, so adding a name
there silences it; `turbo.json` decides whether `lint`, `typecheck` and `test`
run at all; `package.json`'s **scripts block only**, because pointing
`test:scripts` at a directory that does not exist leaves every guard green while
running nothing).

And it is why `.claude/skills/**/*.md` came **out** on 2026-09-22: no required
check reads those files. They are still merge-class controlled — they are simply
not sha256-frozen. That is a real cost, because the first SR-71 breach happened
in exactly that file. If it needs freezing, the honest route is a check that
*reads* it; then it decides a verdict and belongs here on the stated criterion.

## THE RE-PIN RULE, so the next lane does not rediscover it

> **A manifest may pin bytes that are already on `main`. It may never pin a byte
> the pull request itself changes.**

Both look identical in a diff — `.github/gate-manifest.json` changed — and they
are opposites.

**The legitimate case.** A branch is cut, then something merges to `main` that
touches a gate file. CI builds a merge commit of head + base, so the merged tree
carries `main`'s bytes while the manifest pins the older ones, and the freeze
goes red. A manifest cannot be introduced or maintained at all without pinning
the bytes of the branch it merges into. This happened on the very first
GATE-CHANGE PR (#1425), when CARE-01 (#1374) merged three gate files underneath
it.

**The forbidden case.** The PR edits a guard and re-pins it in the same breath,
so the freeze goes green over a change nobody reviewed as a gate change. This is
what rule B in `assert-gates-unchanged.mjs` refuses.

**The discriminator, and run it rather than arguing it:**

```sh
# For every file whose pin moved, its content must ALREADY be main's.
git diff origin/main HEAD -- <the file>      # must be EMPTY
# And the PR's whole diff against main should be only what it means to change:
git diff --name-only origin/main HEAD
```

On #1425 all three re-pinned files were byte-identical to `origin/main`, and the
PR's entire diff was the six files the freeze introduces. That is the evidence a
reviewer should ask for, and it is cheap to produce.

## Changing the set

In a PR titled `GATE-CHANGE: …` that touches **nothing else**, is **never
armed**, and is **merged by the owner by hand**:

```sh
node scripts/gate-manifest.mjs --write
```

Rule C refuses a GATE-CHANGE PR that carries anything but gate files and the
manifest — including its own board card, which rides a separate board PR. That
is the rule working on its author first.
