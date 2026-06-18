---
description: Run the a11y reviewer agent against portal-app changes: focus states, contrast against brand tokens, 44px touch targets, aria-labels on icon-only controls. Scoped to apps/portal and packages/ui changes only.
---

You are running the OsteoJP portal accessibility review. Invoke the
`a11y-reviewer` subagent defined at `.claude/agents/a11y-reviewer.md` and pass
it the portal-scoped diff.

## What to review

Get the diff scoped to portal and shared UI:

```bash
git fetch origin --quiet
git diff origin/main...HEAD -- apps/portal/ packages/ui/
```

If the diff is empty, fall back to:

```bash
git diff HEAD -- apps/portal/ packages/ui/
```

If still empty, report: "No portal or ui changes found in the current branch."
and stop.

## Pass to the a11y-reviewer agent

Invoke the `a11y-reviewer` agent (`.claude/agents/a11y-reviewer.md`) with
this context added to its standard instruction set:

> **Portal-specific rules (in addition to the agent's standard checks):**
>
> Every screen under `apps/portal/app/portal/` is a patient-facing surface.
> Apply the stricter patient-portal rules for all five checks:
>
> 1. **Focus state** — the portal shell (`PortalChrome`, `PortalShell`) and
>    every bottom-tab nav item must have a visible focus ring. The skip-link
>    (`href="#main-content"`) must be the first focusable element and must
>    become visible on focus (`focus:not-sr-only`). A missing skip-link or
>    invisible skip-link focus state is a `blocker`.
>
> 2. **Contrast** — the portal uses `accent-2-700` (#45B9A7 teal) as the
>    primary brand color. Text on teal must use `text-text-inverse` (#FFFFFF).
>    Confirm `accent-2-700` background + white text clears 4.5:1. Also check
>    `text-text-secondary` (muted grey) on `bg-surface` — muted text used as
>    body copy (not placeholder) at <14px is a `blocker`.
>
> 3. **Keyboard** — the bottom nav tabs (Início, Marcações, Formulários,
>    Clínicas, Conta) must be reachable and activatable by keyboard. If they
>    use `<div onClick>` rather than `<a>` or `<button>`, that is a `blocker`.
>    `NavButton` wraps `<Button>` which renders a real `<button>` — verify
>    `onClick` paths use `router.push` (not `window.location.href`) for
>    SPA-correct keyboard behavior.
>
> 4. **aria-label on icon-only controls** — the bottom-nav icons (Home,
>    Calendar, FileText, MapPin, User from lucide-react), any icon-only card
>    action, and the skip-link target `<main>` (which has `tabIndex={-1}` for
>    programmatic focus — this is correct, not a defect) must all be checked.
>    The `aria-hidden="true"` on decorative icons is required and its absence
>    is a `fix`.
>
> 5. **44px touch targets** — every bottom-nav tab, every quick-action card,
>    every primary button (`min-h-11` = 44px is the portal convention), and the
>    "Alterar palavra-passe" list row in account must be ≥44×44px. A sub-44px
>    primary action is a `blocker`; a sub-44px secondary action is a `fix`.

## Output

Print whatever the `a11y-reviewer` agent returns. Do not add prose before or
after. If the agent returns `PASS`, print `PASS` and stop.

## If the subagent is unavailable

If you cannot invoke the `a11y-reviewer` subagent, perform the review yourself
using the full specification in `.claude/agents/a11y-reviewer.md`, applying the
portal-specific rules above on top of the standard checks.
