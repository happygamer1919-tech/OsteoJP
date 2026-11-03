# Standing rules for every SOLO agent brief (copied from the 11-02 rules file; this copy survives a Mac restart)

STANDING RULES (non-negotiable; breaking one is worse than not finishing):
- Repo: OsteoJP, PUBLIC on GitHub. Main clone ~/Projects/GitHub/OsteoJP (do not touch its checkout). Make your own worktree: `git -C ~/Projects/GitHub/OsteoJP worktree add ~/Projects/GitHub/osteojp-solo-wt/<name> -b <branch> origin/main` after `git -C ~/Projects/GitHub/OsteoJP fetch origin`. Work only there. Read its CLAUDE.md first and follow it.
- Shell: run scripts with `bash --noprofile --norc` or `zsh -f`. NEVER run env, printenv, set, export -p, or shell tracing (set -x, bash -x). The owner's shell profile exports variables; never trace or print a shell environment.
- Never read, list or stat the owner's secrets folder. Never read any .env file except .env.example. Never print, echo, log or commit any credential value.
- You never contact production: no production database, no Inngest API/dashboard, no Vercel CLI or API, no Sentry writes. Code, git, GitHub (gh) and a LOCAL throwaway database only.
- Patient health data never enters your context. Do not open .out files in the handover folder unless your brief names one.
- Git: never commit or push to main; no rebase, no force push, never --no-verify or a hooks-path override (if a hook blocks, STOP and report); never bare `git stash`. Neutral PR titles (the repo is public; compliance-gap detail stays private). Never write "fix/close/resolve #N" anywhere. Do NOT merge any PR, do NOT arm auto-merge, do NOT run scripts/merge-on-green.sh, do not touch labels. Open PRs only when your brief says so.
- No new dependency or vendor. Destructive operations: don't.
- Explicit halts (`|| { echo STOP...; exit 1; }`), never set -e.
- A harness or classifier refusal is a STOP: do not retry, reword or route around it; report it verbatim.
- Writing: no em dashes anywhere (code comments, docs, PR bodies, your report). The owner does not read code: PR bodies lead with a plain-language summary.
- Commit trailer, exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB
- PR body ends with:
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01JvvfVLuwzgmEq8mt6xRwrB
- Time is Lisbon (TZ=Europe/Lisbon); the Mac shows Toronto time.
- Your final message: what you did, file paths, PR number and head sha if any, test commands and their exact pass counts, and anything you could not do. Facts only; say plainly what is unverified.
- DATABASE env (added 11-02 after a near miss): the parent environment may carry a DATABASE_URL that points somewhere real. EVERY test command you run must set it explicitly: `DATABASE_URL=` (blank) for non-DB runs, or the local lane URL (127.0.0.1 only) for a DB run you were told to make. Never run a .db.test file with an inherited DATABASE_URL.
