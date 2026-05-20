# CLAUDE.md Reference

> Short pointer to the authoritative `CLAUDE.md` at the repo root, plus the scoped-CLAUDE.md convention used in subdirectories. Lives in `docs/` so contributors landing in the documentation folder can find the architectural rules quickly.

---

## What is `CLAUDE.md`?

[`/CLAUDE.md`](../CLAUDE.md) is the **authoritative architectural and operational rule set** for the OsteoJP platform. It defines:

- **Hard architecture rules** that must not be violated (multi-tenancy, RLS, clinical record state machine, audit logging, EU data residency)
- **The tech stack** (Next.js 15, Drizzle, Supabase EU, Vercel `fra1`, Inngest, Sentry EU, etc.)
- **Repo layout** — which apps and packages exist and what each is for
- **Permission matrix** — what each role (Admin, Therapist, Receptionist) can and cannot do
- **Coding conventions** — server actions over API routes, no `any`, date and money handling, naming rules
- **Brand summary** — colors, typography, tone reference
- **Owner-confirmable items** — decisions that must not be auto-made
- **Out of scope for V1** — features explicitly parked until V1.1+

---

## When Claude Code reads it

[Claude Code](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview) automatically reads `CLAUDE.md` files when it starts a session inside a repository. Specifically:

- On launch, Claude Code reads the `CLAUDE.md` at the **repo root** of the current working directory.
- As it operates inside subdirectories, it also picks up any nested `CLAUDE.md` files along the path — these **extend or override** the root rules in scope for that directory only.
- The contents become part of Claude Code's system context for that session, shaping how it interprets requests, writes code, and decides what to flag or refuse.

So a developer running `claude` inside `apps/web/` automatically gets both the root rules and any web-specific rules layered on top. The developer doesn't have to paste them in or remind Claude Code to read them — it happens at startup.

---

## Scoped `CLAUDE.md` convention for subdirectories

Place a `CLAUDE.md` at the root of any subdirectory that has rules specific to its scope. These are **additive** to the root — they don't repeat the root's rules; they only describe what's different or extra for that subdirectory.

Examples likely to exist as the build progresses:

| Path | Purpose |
|---|---|
| `/CLAUDE.md` | Repo-wide rules. Authoritative. Always read. |
| `apps/web/CLAUDE.md` | Rules specific to the staff platform (Next.js app) — routing conventions, server-action patterns, component placement |
| `apps/admin/CLAUDE.md` | Rules specific to the superadmin app — stricter audit-log expectations, tenant-management UX |
| `packages/db/CLAUDE.md` | Drizzle schema rules, RLS policy conventions, migration safety |
| `packages/auth/CLAUDE.md` | Permission matrix enforcement rules, JWT handling, role-checking patterns |
| `packages/ingestion/CLAUDE.md` | AI partner ingestion contract, HMAC/signature validation, payload handling |
| `packages/integrations/CLAUDE.md` | InvoiceXpress, IfThenPay, Stripe, Twilio, Resend integration patterns, retry / idempotency rules |

**Rules for writing scoped `CLAUDE.md` files:**

- Be **additive** — only describe what differs from or extends the root. Don't repeat the root's content.
- Stay **short** — long files dilute attention. If a scoped CLAUDE.md grows past ~50 lines, consider whether some rules belong in the root instead.
- Stay **specific to the scope** — rules in `packages/db/CLAUDE.md` apply only when working inside `packages/db/`. Don't put cross-cutting rules there.
- If a scoped rule contradicts the root, the **root wins**. Update the conflicting scoped file instead.

---

## Who should read `CLAUDE.md`

Any human or AI contributor making changes in this repo, before they make those changes. This includes:

- All contributors to the OsteoJP platform
- Claude Code when invoked inside the project folder (it reads CLAUDE.md automatically)
- Any future contributors, licensees, or auditors

---

## When to consult it

Read the relevant `CLAUDE.md` (root + any in-scope subdirectory) when:

- Starting any new task in the repo
- Proposing a change to architecture, schema, or integrations
- Unsure whether something is owner-confirmable or auto-decidable
- Onboarding to the project for the first time
- Reviewing a PR that touches anything beyond docs or content

---

## How it relates to other docs

| Document | Purpose |
|---|---|
| [`/CLAUDE.md`](../CLAUDE.md) | Architectural rules, conventions, hard constraints (root scope) |
| Scoped `CLAUDE.md` files | Additive rules for specific subdirectories (e.g. `apps/web/CLAUDE.md`) |
| [`handoff-brief.md`](./handoff-brief.md) | Team context, who owns what, communication norms |
| [`mega-plan.md`](./mega-plan.md) | Phased task plan across the build |
| [`brand-tokens.md`](./brand-tokens.md) | Visual identity — colors, typography, spacing |
| [`brand-voice.md`](./brand-voice.md) | Written voice — tone, vocabulary, PT/EN guidance |

`CLAUDE.md` (root and scoped) is the **technical** source of truth. The docs in this folder are the **organisational and content** source of truth. They are complementary, not overlapping.

---

## If `CLAUDE.md` conflicts with anything

The root `CLAUDE.md` wins. If a scoped `CLAUDE.md` or another document (including this one) suggests something that contradicts the root, treat the root as authoritative and update the conflicting document. Flag the conflict before making any change in code.