# DNS Records — live state and what is still pending

Last updated: 2026-08-02 (corrected against live `dig`; the 2026-05-18 version of
this file was stale in every section)

Every row below was re-derived from live read-only `dig` on 2026-08-02. Do not
edit this file from memory, from a handoff, or from a dashboard screenshot —
re-run `dig` and record what it returns.

## Authoritative nameservers (CORRECTED)

    dig +short NS osteojp.pt
    aster.dns-parking.com.
    helios.dns-parking.com.

**The provider is no longer Webhs.** This file previously said the zone was on
Webhs at `ns1.webhs.org` / `ns2.webhs.org`. It is not, and has not been for some
time. DNS changes are made wherever `dns-parking.com` is administered (Hostinger),
not in a Webhs panel. Any runbook step that says "add this at Webhs" is wrong.

## App subdomains — live

| Host | Live record | State |
|---|---|---|
| `app.osteojp.pt` | `CNAME cname.vercel-dns.com` → `66.33.60.130`, `76.76.21.61` | **LIVE** |
| `api.osteojp.pt` | `CNAME cname.vercel-dns.com` → `66.33.60.67`, `76.76.21.98` | **LIVE** |
| `patient.osteojp.pt` | does not resolve | **PENDING** |
| `app-dev.osteojp.pt` | does not resolve | **PENDING** |

Note the mechanism differs from the old plan: these are **CNAMEs to
`cname.vercel-dns.com`**, not `A` records to `76.76.21.21`. The old A-record
table below is kept only as the pattern to follow for the two pending hosts —
prefer the CNAME form already in use, for consistency with what is live.

## Email — root domain vs sending subdomain (CORRECTED)

These are two separate identities and the docs used to conflate them.

**Root `osteojp.pt` — staff mailbox, NOT the app sender:**

    dig +short MX osteojp.pt
    10 a1.spambusters.email.
    20 n1.spambusters.email.
    30 a2.spambusters.email.

    dig +short TXT osteojp.pt
    "v=spf1 +a +mx +ip4:62.233.41.48 include:_spf.spambusters.email include:_spfnv7.serverhs.org ~all"

    dig +short TXT _dmarc.osteojp.pt
    "v=DMARC1; p=none;"

All three MX priorities are the **spambusters.email** filtering gateway. There is
no Google Workspace record in this zone and never has been; there is no
`*.mail.protection.outlook.com` host either. Outlook is at most the mailbox
*behind* the gateway, consistent with the standing "MX / email migration
POSTPONED INDEFINITELY" ruling (`docs/design/DECISIONS.md`, 2026-07-21). **Do not
change the root MX.** The app does not send from the root domain.

**Sending subdomain `send.osteojp.pt` — the Resend identity, VERIFIED 2026-08-02:**

    dig +short MX send.osteojp.pt
    10 feedback-smtp.eu-west-1.amazonses.com.

    dig +short TXT send.osteojp.pt
    "v=spf1 include:amazonses.com ~all"

    dig +short TXT resend._domainkey.send.osteojp.pt
    "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ..."   (DKIM public key present)

Status **Verified**, region **eu-west-1**, in the **`a-and-i-automation`** Resend
workspace. No Resend domain existed at all before 2026-08-02 — any doc or handoff
claiming otherwise predates reality.

Two consequences that bite:

1. **The From address must be at `send.osteojp.pt`.** `REMINDERS_EMAIL_FROM` set
   to something `@osteojp.pt` will fail: the root domain is not a verified Resend
   identity. Every doc that said "a verified osteojp.pt sender" was imprecise.
2. **The DKIM record is a `TXT` at `resend._domainkey.send.osteojp.pt`**, not a
   `CNAME` at `em._domainkey.osteojp.pt`. The old runbook check had both the host
   and the record type wrong and would always have reported failure.

`_dmarc.send.osteojp.pt` is not set. The root DMARC (`p=none`) does not cover the
subdomain by default in every evaluator; adding a subdomain DMARC record is
optional and not currently required by Resend for Verified status.

## Still pending

- `patient.osteojp.pt` — add `CNAME → cname.vercel-dns.com` (patient portal).
- `app-dev.osteojp.pt` — add `CNAME → cname.vercel-dns.com` (staging / previews).

Both are added on the Vercel project side already; they show "Invalid
Configuration" until the DNS record exists.

## Alternative: delegate to Vercel nameservers

If full Vercel DNS control is ever wanted, the `osteojp.pt` nameservers would move
to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. **This is not recommended now:**
it would require migrating the root MX, the root SPF and the whole
`send.osteojp.pt` Resend record set by hand, and a mistake there silently breaks
staff email. The per-record approach above touches nothing on the root.

## Manual follow-up (Vercel dashboard)

1. **Connect the GitHub repository** — Project → Settings → Git → Connect Git
   Repository, select `happygamer1919-tech/OsteoJP`. Triggers the GitHub App
   install and grants deploy access.
2. **Confirm Git settings** — production branch is `main`, preview deployments
   enabled for all other branches. Both are Vercel defaults once Git is
   connected; this is a confirmation step only.
