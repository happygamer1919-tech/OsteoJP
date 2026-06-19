#!/usr/bin/env -S npx tsx
// tools/fisiozero-extractor/src/cli.ts
//
// Entry point. Builds config from env + flags, prints a PII-free startup notice
// (including the encryption-at-rest reminder, since this tool writes raw patient
// data to disk — see docs/QUESTIONS.md 2026-06-18), runs the serial archiver, and
// prints the completeness summary the gated review depends on.
//
// Run (gated 8-patient batch):
//   FISIOZERO_STORAGE_STATE=/secure/fz-state.json \
//     pnpm --filter @osteojp/fisiozero-extractor extract -- --limit 8 --out /secure/fz-archive

import { existsSync } from "node:fs";
import { buildConfig, type ExtractorConfig } from "./config";
import { PlaywrightFisiozeroClient, SessionExpiredError } from "./client";
import { runExtraction, type RunSummary } from "./extractor";

function printStartup(config: ExtractorConfig): void {
  console.log("Fisiozero Tier-1 raw archiver");
  console.log("─".repeat(60));
  console.log(`  base URL       : ${config.baseUrl}`);
  console.log(`  id range       : ${config.startId} .. ${config.endId}`);
  console.log(`  limit          : ${config.limit ?? "(none — full enumeration)"}`);
  console.log(`  rate window    : ${config.rateMinMs}-${config.rateMaxMs} ms / patient (jittered)`);
  console.log(`  output dir     : ${config.outDir}`);
  console.log(`  checkpoint     : ${config.checkpointPath}`);
  console.log("─".repeat(60));
  console.log("  SECURITY: this writes raw patient PII (HTML, XLS, attachments)");
  console.log("  in plaintext. Point --out at an ENCRYPTED, EU-resident volume and");
  console.log("  keep it off any synced/cloud folder. App-level encryption is not");
  console.log("  performed by this tool (docs/QUESTIONS.md 2026-06-18).");
  console.log("─".repeat(60));
}

function printSummary(summary: RunSummary): void {
  console.log("");
  console.log("Run summary");
  console.log("─".repeat(60));
  for (const p of summary.patients) {
    const attach = `${p.attachmentsDownloaded}/${p.attachmentsDiscovered}`;
    const pdfs = `${p.episodePdfsDownloaded}/${p.episodePdfsDiscovered}`;
    const flags: string[] = [];
    if (p.attachmentsDownloaded < p.attachmentsDiscovered) flags.push("ATTACHMENT-GAP");
    if (p.status === "done" && p.episodes > 0 && p.episodePdfsDownloaded === 0) flags.push("NO-EPISODE-PDF");
    if (p.status === "done" && !p.xlsCaptured) flags.push("NO-XLS");
    if (p.status === "error") flags.push(`ERROR:${p.errorCode ?? "?"}`);
    const flagStr = flags.length ? `  ⚠ ${flags.join(" ")}` : "";
    console.log(
      `  #${p.id}  ${p.status.padEnd(7)}  episodes=${p.episodes}  ` +
        `attachments=${attach}  pdfs=${pdfs}  xls=${p.xlsCaptured ? "yes" : "no"}${flagStr}`,
    );
  }
  console.log("─".repeat(60));
  console.log(
    `  attempted=${summary.attempted}  done=${summary.done}  ` +
      `absent=${summary.absent}  errored=${summary.errored}  skipped=${summary.skipped}`,
  );
  console.log(
    `  episodes captured=${summary.totalEpisodes}  ` +
      `pdfs downloaded/discovered=${summary.totalEpisodePdfsDownloaded}/${summary.totalEpisodePdfsDiscovered}  ` +
      `attachments downloaded/discovered=${summary.totalAttachmentsDownloaded}/${summary.totalAttachmentsDiscovered}`,
  );
  const anomalies = summary.patients.filter(
    (p) =>
      p.status === "error" ||
      (p.status === "done" && (
        !p.xlsCaptured ||
        p.attachmentsDownloaded < p.attachmentsDiscovered ||
        (p.episodes > 0 && p.episodePdfsDownloaded === 0)
      )),
  );
  console.log(`  anomalies needing review: ${anomalies.length}`);
  console.log("─".repeat(60));
}

async function main(): Promise<number> {
  let config: ExtractorConfig;
  try {
    config = buildConfig(process.argv.slice(2), process.env);
  } catch (err) {
    console.error(`Config error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (!existsSync(config.storageStatePath)) {
    console.error(
      `Storage state file not found at ${config.storageStatePath}. ` +
        `Capture a Playwright storageState JSON from a logged-in Fisiozero browser ` +
        `session and point FISIOZERO_STORAGE_STATE at it.`,
    );
    return 1;
  }

  printStartup(config);

  const client = new PlaywrightFisiozeroClient({
    storageStatePath: config.storageStatePath,
    baseUrl: config.baseUrl,
    retries: config.retries,
    backoffBaseMs: config.backoffBaseMs,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  try {
    const summary = await runExtraction(client, config);
    printSummary(summary);
    return 0;
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      console.error("");
      console.error("SESSION EXPIRED. The Fisiozero session is no longer valid.");
      console.error("Re-capture a fresh storageState JSON from a logged-in browser and");
      console.error("re-run — the checkpoint will resume where it stopped.");
      return 2;
    }
    console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  } finally {
    await client.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
