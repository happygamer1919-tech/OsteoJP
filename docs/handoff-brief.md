# Handoff Brief — OsteoJP Platform

> Internal context document for the OsteoJP build. Captures who's working on what, how the team collaborates, and what each contributor is accountable for.
>
> Companion documents: [`mega-plan.md`](./mega-plan.md) (phased task assignments), [`claude-md-reference.md`](./claude-md-reference.md) (architectural rules), [`brand-tokens.md`](./brand-tokens.md), [`brand-voice.md`](./brand-voice.md).

---

## The project

**OsteoJP** is a Portuguese osteopathy + physiotherapy clinic with locations in Linda-a-Velha and Castelo Branco, and a Montemor-o-Novo location opening. Reference site: https://osteojp.pt. Brand pillars: **Osteopatia, Fisioterapia, Formação**.

The team is building a **unified clinic platform** to replace the current Fisiozero + Stylus.pt setup. The platform must:

- Be **multi-tenant from day 1** (the platform will be licensed to other clinics later)
- Be **EU data-resident** (Portugal-focused)
- Handle scheduling, patient records, clinical forms, invoicing, payments
- Expose an **API-first ingestion endpoint** that a partner's AI automation pushes completed clinical reports into
- Launch **before the end of June 2026**

## Tech stack

- Next.js 15 (App Router) + TypeScript strict
- shadcn/ui + Tailwind v4
- PostgreSQL via Supabase (EU/Frankfurt) + Drizzle ORM
- Auth: Supabase Auth with JWT (`tenant_id` + role claims)
- Hosted on Vercel (Frankfurt region)
- Sentry (EU), Resend, Twilio, InvoiceXpress, IfThenPay, Stripe
- Inngest for background jobs
- Monorepo: pnpm + Turborepo
- Repo: `happygamer1919-tech/OsteoJP` on GitHub

The full architectural rule set lives in [`/CLAUDE.md`](../CLAUDE.md) at the repo root. Anyone (or any AI tool) making changes in this repo should read it first.

---

## Team

The build is being delivered by two contributors:

### The lead

Owns architecture, integrations, security-critical work, and all production application code. Reviews and merges every PR.

### Max

Joining the project to take on ~30–40% of the workload. Owns the content, configuration, QA, documentation, and communication layer. **Does not** write production application code, design database schemas, or modify integration logic. Specifically responsible for:

- Authoring clinical form templates as JSON Schema (from PDF samples)
- Translating UI strings PT ↔ EN
- Writing email and SMS templates
- Manual QA on every PR — loading preview URLs and walking workflows
- Writing test scenarios in plain English (the lead converts them to Playwright)
- Authoring documentation
- Brand work (palette extraction, voice guide, typography)
- Creating seed data (realistic Portuguese patient records)
- Bug triage with clear repro steps
- Owner-facing comms during migration and launch

If a task assigned to Max drifts into production code or integration logic, it's flagged and escalated to the lead.

---

## How the team collaborates

- **GitHub is the source of truth.** Every change goes through a Pull Request. No one commits to `main` directly.
- **Branches** — one per task. Naming: `feat/short-task-name`, `docs/short-task-name`, `fix/short-task-name`.
- **Issues** — every task is a GitHub issue. The assigned contributor picks it up, does the work, opens a PR that closes the issue.
- **Tools used daily** — VS Code with Claude Code in the terminal, GitHub Desktop for visual git, GitHub.com for PRs and issues.
- **Preview URLs** — every PR auto-deploys to a Vercel preview link. Reviewers click through and verify the work before approving.
- **Branch protection on `main`** — PR required, 1 approval required, status checks must pass.

---

## Communication norms

- **Direct.** No motivational filler.
- **Technical concepts** are explained briefly the first time they appear, not re-explained on every mention.
- **Risky actions** (deletes, force-pushes, modifications to shared infra) are flagged explicitly with a recommendation to confirm with the lead first.
- **Wrong assumptions are corrected directly.** No hedging.
- **Single recommendations over option lists** unless the contributor asks for alternatives.
- **Hard rules over soft suggestions** when something must not be done.

---

## Hard rules

- Never commit directly to `main` — always a feature branch + PR.
- Never `git push --force` without explicit lead approval.
- Never modify files in `packages/db/migrations/` or `packages/auth/` — those are lead-owned.
- Never invent file paths or repo structure — when unsure, ask.
- When something fails and the fix is unclear, escalate with the full error to the lead.
- Any decision that touches owner-confirmable scope (invoicing legal compliance, clinical data retention, V1 vs V1.1 scope line, new third-party vendors) is flagged and stopped, not auto-decided. See [`/CLAUDE.md`](../CLAUDE.md) for the full list.

---

## Out of scope for V1

Patient portal, WhatsApp integration, mobile app, telehealth, insurance integration, waitlist, loyalty programs, the Pilates module, the Formação module, mandatory CID-10 enforcement, full historical archive migration. These are documented and parked for V1.1 or later.

---

## Success criteria for Max in week 1

- Machine fully set up (toolchain installed and verified).
- First PR opened and merged (a small content/docs task).
- Comfortable with the branch → push → PR → review → merge loop.
- Has run Claude Code inside VS Code at least once.