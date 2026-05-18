# DNS Records — Pending Verification

Last updated: 2026-05-18

These records must be added at the `osteojp.pt` DNS provider (currently: Webhs, nameservers `ns1.webhs.org` / `ns2.webhs.org`) before Vercel can verify the domains.

All three subdomains are already added to the Vercel project `osteojp-platform` (scope: `ivan-bong-420-s-projects`). They will show "Invalid Configuration" or "Pending" in the Vercel dashboard until DNS propagates.

## Records to add

| Type | Host              | Value         | Notes                        |
|------|-------------------|---------------|------------------------------|
| A    | app.osteojp.pt    | 76.76.21.21   | Production (staff platform)  |
| A    | app-dev.osteojp.pt| 76.76.21.21   | Staging / preview builds     |
| A    | api.osteojp.pt    | 76.76.21.21   | Future API / edge functions  |

## Alternative: delegate to Vercel nameservers

If you prefer full Vercel DNS control (enables automatic subdomain management), change the `osteojp.pt` nameservers to:

| Type | Value              |
|------|--------------------|
| NS   | ns1.vercel-dns.com |
| NS   | ns2.vercel-dns.com |

This replaces the current Webhs nameservers and requires migrating any existing DNS records for `osteojp.pt` manually beforehand.

## Recommended approach

Add individual A records (table above). This is the least-disruptive path — it does not touch the root domain or other existing DNS entries.

## Next steps

DNS records need to be added at the osteojp.pt DNS provider before domains will verify. Out of scope for this PR.

## Manual follow-up required (Vercel dashboard)

Do these two steps in the Vercel dashboard after this PR merges:

1. **Connect the GitHub repository** — Project → Settings → Git → Connect Git Repository. Select `happygamer1919-tech/OsteoJP`. This triggers the GitHub App install and grants Vercel deploy access.

2. **Confirm Git settings** — once connected, verify that the production branch is set to `main` and that preview deployments are enabled for all other branches. Both are Vercel defaults once the Git integration is active; this is just a confirmation step.
