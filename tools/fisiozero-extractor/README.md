# @osteojp/fisiozero-extractor

Standalone **Tier-1 raw archiver** for the clinic's own Fisiozero patient records
(GDPR data portability, clinic owns the data). It captures raw bytes only — full
HTML per sub-view, the per-patient XLS, and every attachment — with a per-patient
`manifest.json` (SHA-256 + byte count per file).

It does **not** normalize data, does **not** implement the `FisiozeroSource` seam,
and does **not** write the `0014` migration ledger. Those are deferred until real
raw captures exist (see `docs/DECISIONS.md` 2026-06-18). This tool imports nothing
from `packages/db`.

## Why scraping (not a CSV/ZIP export)

Recon established that `app.fisiozero.pt` has no JSON API and no free bulk export.
The only free export is a per-patient XLS that omits episodes and attachments; the
bulk export is a paid action that terminates clinic access. So the sanctioned path
is to archive the raw data while authorized access is open.

## Auth — no credentials in code

The extractor never enters or logs credentials. It loads a Playwright
`storageState` JSON captured from a logged-in browser:

1. Log in to Fisiozero in a browser you control.
2. Export the session as a Playwright `storageState` JSON (cookies + origins).
3. Point `FISIOZERO_STORAGE_STATE` at that file.

If any request bounces to the login screen, the run stops with
`SESSION EXPIRED` — recapture the file and re-run; the checkpoint resumes.

## Run (gated 8-patient batch)

From the repo root:

```bash
FISIOZERO_STORAGE_STATE=/secure/fz-state.json \
  pnpm --filter @osteojp/fisiozero-extractor extract -- \
  --limit 8 \
  --out /secure/fz-archive
```

`--limit 8` stops after 8 **present** patients (absent/gapped ids don't count).
Do not remove `--limit` until the 8-patient batch has been hand-reviewed.

### Flags / env

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--storage-state` | `FISIOZERO_STORAGE_STATE` | — (required) | Path to the Playwright storageState JSON |
| `--base-url` | `FISIOZERO_BASE_URL` | `https://app.fisiozero.pt` | Target instance |
| `--start` | `FISIOZERO_START_ID` | `174159` | First integer patient id |
| `--end` | `FISIOZERO_END_ID` | `199974` | Last integer patient id |
| `--limit` | `FISIOZERO_LIMIT` | none | Stop after N present patients |
| `--out` | `FISIOZERO_OUT_DIR` | `./fisiozero-archive` | Tier-1 archive root |
| `--checkpoint` | `FISIOZERO_CHECKPOINT` | `<out>/checkpoint.jsonl` | Resume checkpoint |
| `--rate-min` / `--rate-max` | `FISIOZERO_RATE_MIN_MS` / `_MAX_MS` | `2000` / `3000` | Per-patient delay window (jittered) |
| `--retries` | `FISIOZERO_RETRIES` | `4` | Transient-error retries (exp backoff) |

## What it writes (per patient)

```
<out>/patients/<id>/
  ficha.html                  # raw, untransformed
  lists/osteo_epi.html
  lists/avl.html
  episodes/episode-01.html ...
  consultar_hist.html
  export_ficha_utente.xls
  attachments/<scraped files> # original bytes; colliding names disambiguated
  manifest.json               # written LAST: every file + sha256 + bytes + counts
```

The serial loop, per patient, in order: set-active → ficha → `osteo_epi` + `avl` →
each scraped episode detail → `consultar_hist` → XLS → every scraped attachment.
**Single serial loop, never concurrent** — the server holds the active patient in
session, so parallel fetches would corrupt it.

## Resumability

The checkpoint (`checkpoint.jsonl`, one row per id: `done` / `absent` / `error`)
is appended after every patient. Re-runs skip `done`/`absent` and never duplicate.
A kill mid-patient loses at most that patient, which is re-archived cleanly.

## Security — encryption at rest

This tool writes raw patient **PII in plaintext**. App-level encryption / key
management was deliberately not built (owner-confirmable). Point `--out` at an
**encrypted, EU-resident** volume and keep it off any synced/cloud folder. The CLI
prints this reminder on startup. See `docs/QUESTIONS.md` 2026-06-18.

## Tests

```bash
pnpm --filter @osteojp/fisiozero-extractor test
pnpm --filter @osteojp/fisiozero-extractor typecheck
```

The live Playwright path is exercised only against the real instance during the
gated run; all pure logic and the serial loop (via an injected fake client) are
unit-tested.
