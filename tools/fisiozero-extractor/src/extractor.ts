// tools/fisiozero-extractor/src/extractor.ts
//
// The single serial loop. Per patient, in the order recon mandates, over ONE
// shared cookie jar, never concurrent — because the server holds the "current
// patient" in session and parallel fetches would corrupt it:
//
//   set-active → ficha → osteo_epi + avl → each episode detail →
//   consultar_hist → export XLS → all scraped attachments
//
// Everything is written to the Tier-1 archive untransformed. Absent (gapped) ids
// are recorded and skipped, not errored. A login bounce (SessionExpiredError) is
// fatal and aborts the whole run. Transient failures on a patient mark that one
// patient `error` and the loop continues. Checkpoint is appended after every
// patient, so a kill resumes cleanly and a re-run never duplicates.

import { PatientArchive } from "./archive";
import {
  appendCheckpoint,
  loadCheckpoint,
  shouldSkip,
  type CheckpointRecord,
  type CheckpointStatus,
} from "./checkpoint";
import { SessionExpiredError, type FisiozeroClient } from "./client";
import type { ExtractorConfig } from "./config";
import {
  extractAttachmentUrls,
  extractEpisodeUrls,
  fileNameFromUrl,
  isFichaAbsent,
} from "./html";
import { encodePatientId, idRange } from "./ids";
import { PATIENT_OPS, opUrl, setActiveUrl, xlsExportUrl } from "./urls";
import { randomBetween, sleep as realSleep } from "./util";

export type PatientResult = {
  id: number;
  status: CheckpointStatus;
  episodes: number;
  attachmentsDiscovered: number;
  attachmentsDownloaded: number;
  xlsCaptured: boolean;
  errorCode?: string;
};

export type RunSummary = {
  startId: number;
  endId: number;
  limit?: number;
  attempted: number;
  done: number;
  absent: number;
  errored: number;
  skipped: number;
  totalEpisodes: number;
  totalAttachmentsDiscovered: number;
  totalAttachmentsDownloaded: number;
  patients: PatientResult[];
};

export type LoopDeps = {
  sleep: (ms: number) => Promise<void>;
  rng: () => number;
};

const defaultDeps: LoopDeps = { sleep: realSleep, rng: Math.random };

/** Archive one already-active-or-to-be-activated patient. Pure orchestration over the client. */
export async function extractPatient(
  client: FisiozeroClient,
  config: ExtractorConfig,
  id: number,
): Promise<PatientResult> {
  const base = config.baseUrl;
  const iParam = encodePatientId(id);

  const result: PatientResult = {
    id,
    status: "done",
    episodes: 0,
    attachmentsDiscovered: 0,
    attachmentsDownloaded: 0,
    xlsCaptured: false,
  };

  try {
    // 1. Set the active patient in server session.
    await client.getText(setActiveUrl(base, id));

    // 2. Ficha HTML — also the absent/gap signal.
    const ficha = await client.getText(opUrl(base, PATIENT_OPS.ficha));
    if (isFichaAbsent(ficha.body)) {
      return { ...result, status: "absent" };
    }

    const archive = new PatientArchive(config.outDir, id, base, iParam);
    archive.addText("ficha.html", "ficha_html", ficha.url, ficha.body);

    // 3. Episode + evaluation list pages.
    const episodeList = await client.getText(opUrl(base, PATIENT_OPS.episodes));
    archive.addText("lists/osteo_epi.html", "episode_list_html", episodeList.url, episodeList.body);

    const evalList = await client.getText(opUrl(base, PATIENT_OPS.evaluations));
    archive.addText("lists/avl.html", "evaluation_list_html", evalList.url, evalList.body);

    // Episode-detail links are scraped from both list pages, never constructed.
    const episodeUrls = Array.from(
      new Set([
        ...extractEpisodeUrls(base, episodeList.body),
        ...extractEpisodeUrls(base, evalList.body),
      ]),
    );

    // Attachment URLs accumulate from the ficha and every episode page.
    const attachmentUrls = new Set<string>(extractAttachmentUrls(base, ficha.body));

    // 4. Each episode detail page.
    for (let i = 0; i < episodeUrls.length; i++) {
      const epUrl = episodeUrls[i]!;
      const ep = await client.getText(epUrl);
      const name = `episodes/episode-${String(i + 1).padStart(2, "0")}.html`;
      archive.addText(name, "episode_detail_html", ep.url, ep.body);
      for (const a of extractAttachmentUrls(base, ep.body)) attachmentUrls.add(a);
    }
    result.episodes = episodeUrls.length;

    // 5. Appointment/payment/SMS history.
    const history = await client.getText(opUrl(base, PATIENT_OPS.history));
    archive.addText("consultar_hist.html", "history_html", history.url, history.body);

    // 6. Per-patient XLS (active-patient scoped).
    try {
      const xls = await client.getBinary(xlsExportUrl(base));
      const isHtml = (xls.contentType ?? "").includes("text/html");
      if (xls.status < 400 && xls.bytes.byteLength > 0 && !isHtml) {
        archive.addBinary("export_ficha_utente.xls", "xls", xls.url, xls.bytes);
        result.xlsCaptured = true;
      }
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      // XLS miss is non-fatal; the discovered/captured delta surfaces it.
    }

    // 7. All scraped attachments (exhaustive; the silent-miss surface).
    result.attachmentsDiscovered = attachmentUrls.size;
    for (const url of attachmentUrls) {
      try {
        const bin = await client.getBinary(url);
        const isHtml = (bin.contentType ?? "").includes("text/html");
        if (bin.status < 400 && bin.bytes.byteLength > 0 && !isHtml) {
          const relPath = archive.reserveAttachmentPath(fileNameFromUrl(url));
          archive.addBinary(relPath, "attachment", bin.url, bin.bytes);
          result.attachmentsDownloaded++;
        }
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        // One attachment miss is recorded via the discovered>downloaded delta.
      }
    }

    archive.finalize({
      episodes: result.episodes,
      attachmentsDiscovered: result.attachmentsDiscovered,
      attachmentsDownloaded: result.attachmentsDownloaded,
      xlsCaptured: result.xlsCaptured,
      historyCaptured: true,
    });

    return result;
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err; // fatal — abort the run
    const errorCode = err instanceof Error ? err.name : "unexpected_error";
    return { ...result, status: "error", errorCode };
  }
}

/** Drive the whole gated/full run. Returns the completeness summary. */
export async function runExtraction(
  client: FisiozeroClient,
  config: ExtractorConfig,
  deps: LoopDeps = defaultDeps,
): Promise<RunSummary> {
  const checkpoint = loadCheckpoint(config.checkpointPath);

  const summary: RunSummary = {
    startId: config.startId,
    endId: config.endId,
    limit: config.limit,
    attempted: 0,
    done: 0,
    absent: 0,
    errored: 0,
    skipped: 0,
    totalEpisodes: 0,
    totalAttachmentsDiscovered: 0,
    totalAttachmentsDownloaded: 0,
    patients: [],
  };

  // "valid" = a present patient (done or error); absents don't count toward --limit.
  let validProcessed = 0;
  let firstInRun = true;

  for (const id of idRange(config.startId, config.endId)) {
    if (shouldSkip(checkpoint, id)) {
      summary.skipped++;
      continue;
    }

    // Polite rate limit BETWEEN processed patients (jittered), not before the first.
    if (!firstInRun) {
      await deps.sleep(randomBetween(config.rateMinMs, config.rateMaxMs, deps.rng));
    }
    firstInRun = false;

    const result = await extractPatient(client, config, id);
    summary.attempted++;
    summary.patients.push(result);

    const record: CheckpointRecord = {
      id,
      status: result.status,
      episodes: result.episodes,
      attachmentsDiscovered: result.attachmentsDiscovered,
      attachmentsDownloaded: result.attachmentsDownloaded,
      xlsCaptured: result.xlsCaptured,
      ts: new Date().toISOString(),
    };
    if (result.errorCode) record.errorCode = result.errorCode;
    appendCheckpoint(config.checkpointPath, record);

    if (result.status === "done") summary.done++;
    else if (result.status === "absent") summary.absent++;
    else summary.errored++;

    summary.totalEpisodes += result.episodes;
    summary.totalAttachmentsDiscovered += result.attachmentsDiscovered;
    summary.totalAttachmentsDownloaded += result.attachmentsDownloaded;

    if (result.status !== "absent") {
      validProcessed++;
      if (config.limit !== undefined && validProcessed >= config.limit) break;
    }
  }

  return summary;
}
