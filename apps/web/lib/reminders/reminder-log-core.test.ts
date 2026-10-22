import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  FAILED_PROVIDER_STATUSES,
  FOLLOW_UP_DELAY_MS,
  KNOWN_SUPPRESSION_REASONS,
  isFailure,
  kindLabel,
  kindOf,
  phoneForDisplay,
  reasonLabel,
  scheduledFor,
  statusOf,
} from "./reminder-log-core";

/** Comments stripped, so a scan reads code and not the prose explaining it. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const dispatchSrc = code(readFileSync(new URL("./dispatch.ts", import.meta.url), "utf8"));
const functionsSrc = code(readFileSync(new URL("./inngest/functions.ts", import.meta.url), "utf8"));
const surveyStoreSrc = code(readFileSync(new URL("../surveys/survey-store.ts", import.meta.url), "utf8"));
/**
 * The notify gate's suppression reasons, read from the union that owns them
 * (packages/notify/src/types.ts), so a fifth one added there is a reason this
 * file's guard asks a label for.
 */
const GATE_REASONS: readonly string[] = (() => {
  const src = code(
    readFileSync(new URL("../../../../packages/notify/src/types.ts", import.meta.url), "utf8"),
  );
  const union = /export type SuppressionReason =([\s\S]*?);/.exec(src)?.[1] ?? "";
  return [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
})();

describe("kindOf - the kind is derived from template_id (0075 ruling 1)", () => {
  it.each([
    ["reminder.24h.sms", "reminder_24h"],
    ["reminder.48h.email", "reminder_48h"],
    ["reminder.24h.sms.fee_notice", "reminder_fee"],
    ["confirmation.sms", "confirmation"],
    ["follow_up.sms", "follow_up"],
    ["no_show.sms", "no_show"],
    // SAT-01: the satisfaction survey is a kind of its own.
    ["survey.email", "survey"],
    ["survey.sms", "survey"],
    ["survey.whatsapp", "unknown"],
    // BOOK-CONFIRM: the booking-approved pair is a confirmation.
    ["booking_approved.email", "confirmation"],
    ["booking_approved.sms", "confirmation"],
    ["booking_approved.whatsapp", "unknown"],
    ["reminder.12h.sms", "unknown"],
    ["something.new", "unknown"],
  ] as const)("%s -> %s", (id, kind) => {
    expect(kindOf(id)).toBe(kind);
  });

  it("an unknown kind shows its raw id, labelled as unrecognised", () => {
    expect(kindLabel("unknown", "something.new")).toBe("Mensagem não reconhecida (something.new)");
  });

  it("EVERY template id the dispatcher writes is a recognised kind", () => {
    const literal = [...dispatchSrc.matchAll(/templateId: "([a-z_0-9.]+)"/g)].map((m) => m[1]!);
    // The survey's two ids are constants in dispatch.ts, not `templateId: "..."`
    // literals, so they are read from where they are declared.
    const surveyIds = [...dispatchSrc.matchAll(/SURVEY_(?:EMAIL|SMS)_TEMPLATE_ID = "([a-z_.]+)"/g)].map((m) => m[1]!);
    expect(surveyIds.sort()).toEqual(["survey.email", "survey.sms"]);
    const ids = [
      ...new Set([...literal, ...surveyIds, "reminder.24h.sms", "reminder.48h.email", "reminder.24h.sms.fee_notice"]),
    ];
    // Positive control: the scan found the confirmation, follow-up and no-show ids.
    expect(literal.length).toBeGreaterThanOrEqual(6);
    expect(ids.filter((id) => kindOf(id) === "unknown")).toEqual([]);
  });
});

describe("scheduledFor - DERIVED from the appointment, per kind", () => {
  const startsAt = new Date("2026-10-01T10:00:00.000Z");
  const endsAt = new Date("2026-10-01T10:45:00.000Z");
  const H = 60 * 60 * 1000;

  it("24h and the fee-notice 24h: start minus 24 hours", () => {
    expect(scheduledFor("reminder_24h", { startsAt, endsAt })).toEqual({ kind: "at", at: new Date(startsAt.getTime() - 24 * H) });
    expect(scheduledFor("reminder_fee", { startsAt, endsAt })).toEqual({ kind: "at", at: new Date(startsAt.getTime() - 24 * H) });
  });

  it("48h: start minus 48 hours", () => {
    expect(scheduledFor("reminder_48h", { startsAt, endsAt })).toEqual({ kind: "at", at: new Date(startsAt.getTime() - 48 * H) });
  });

  it("follow-up: END plus 24 hours", () => {
    expect(scheduledFor("follow_up", { startsAt, endsAt })).toEqual({ kind: "at", at: new Date(endsAt.getTime() + 24 * H) });
  });

  it("the automatic survey: END plus 24 hours, as the follow-up it rides", () => {
    expect(scheduledFor("survey", { startsAt, endsAt })).toEqual({ kind: "at", at: new Date(endsAt.getTime() + 24 * H) });
    expect(kindLabel("survey", "survey.sms")).toBe("Avaliação de satisfação");
  });

  it("confirmation and no-show go at once; an unknown kind has no due time", () => {
    expect(scheduledFor("confirmation", { startsAt, endsAt })).toEqual({ kind: "immediate" });
    expect(scheduledFor("no_show", { startsAt, endsAt })).toEqual({ kind: "immediate" });
    expect(scheduledFor("unknown", { startsAt, endsAt })).toEqual({ kind: "unknown" });
  });

  it("the follow-up delay is the one sendFollowUpNotification sleeps for", () => {
    // A second copy of a rule, so it is pinned to the first.
    expect(FOLLOW_UP_DELAY_MS).toBe(24 * 60 * 60_000);
    expect(functionsSrc).toContain("24 * 60 * 60_000");
  });
});

describe("statusOf - Estado in pt-PT", () => {
  it.each([
    [{ outcome: "sent", providerStatus: null, suppressionReason: null }, "sent", "Enviado"],
    [{ outcome: "sent", providerStatus: "queued", suppressionReason: null }, "sent", "Enviado"],
    [{ outcome: "sent", providerStatus: "delivered", suppressionReason: null }, "delivered", "Entregue"],
    [{ outcome: "sent", providerStatus: "undelivered", suppressionReason: null }, "undelivered", "Não entregue"],
    [{ outcome: "sent", providerStatus: "failed", suppressionReason: null }, "undelivered", "Não entregue"],
    [{ outcome: "provider_error", providerStatus: null, suppressionReason: null }, "provider_error", "Falhou no fornecedor"],
    [{ outcome: "suppressed", providerStatus: null, suppressionReason: "landline" }, "suppressed", "Não enviado: telefone fixo, não recebe SMS"],
    [{ outcome: "suppressed", providerStatus: null, suppressionReason: "invalid_phone" }, "suppressed", "Não enviado: número inválido"],
    [{ outcome: "something_new", providerStatus: null, suppressionReason: null }, "unknown", "Estado não reconhecido (something_new)"],
  ] as const)("%o -> %s", (row, key, label) => {
    const st = statusOf(row);
    expect(st.key).toBe(key);
    expect(st.label).toBe(label);
  });

  it("an unrecognised reason keeps its code and says it is unrecognised", () => {
    expect(reasonLabel("new_gate")).toBe("motivo não reconhecido (new_gate)");
    expect(reasonLabel(null)).toBe("motivo não reconhecido (—)");
  });

  it("EVERY reason the dispatcher can write has its own sentence", () => {
    const outcomes = [...dispatchSrc.matchAll(/reason: "([a-z_]+)"/g)].map((m) => m[1]!);
    // Deduplicated: the `SmsSkip` type literal names a reason as well as its return.
    const skips = [...new Set([...dispatchSrc.matchAll(/skipped: "([a-z_]+)"/g)].map((m) => m[1]!))];
    // BOOK-CONFIRM ADDED TWO MORE SHAPES, and this guard did not see either: a
    // reason passed to a helper (`suppress("already_sent")`) and one written
    // straight into a row (`suppressionReason: "body_refused"`). Four new
    // reasons reached the ledger with no sentence and this test stayed green.
    // Both shapes are scanned now, so an unlabelled reason in either fails here.
    const suppressed = [...dispatchSrc.matchAll(/\bsuppress\(\s*"([a-z_]+)"/g)].map((m) => m[1]!);
    const rowReasons = [...dispatchSrc.matchAll(/suppressionReason: "([a-z_]+)"/g)].map((m) => m[1]!);
    // The notify gate's reasons arrive as a VALUE (`gateSuppressionReason`), not
    // as a literal in dispatch.ts, so they are read from the type that owns them.
    const gateReasons = [...GATE_REASONS];
    // SAT-01 ADDED TWO MORE. The survey's own two reasons are constants, and
    // the database's answers arrive as a VALUE (`survey_` plus the answer), so
    // they are read from the list that owns them (survey-store.ts).
    const surveyConstants = [...dispatchSrc.matchAll(/^export const SURVEY_[A-Z_]+ = "(survey_[a-z_]+)";/gm)].map((m) => m[1]!);
    const surveyAnswers = (
      /const SURVEY_ISSUE_RESULTS: readonly string\[\] = \[([^\]]+)\]/.exec(surveyStoreSrc)?.[1] ?? ""
    )
      .split(",")
      .map((a) => a.trim().replace(/"/g, ""))
      .filter((a) => a !== "" && a !== "issued")
      .map((a) => `survey_${a}`);
    const written = [
      ...new Set([
        ...outcomes,
        ...skips,
        ...suppressed,
        ...rowReasons,
        ...gateReasons,
        ...surveyConstants,
        ...surveyAnswers,
        "sandbox",
      ]),
    ];
    // Positive controls: every scan found something, so the check below is not
    // an empty list agreeing with itself.
    expect(outcomes.length).toBeGreaterThanOrEqual(8);
    expect(skips.sort()).toEqual(["invalid_phone", "landline"]);
    expect([...new Set(suppressed)].sort()).toEqual(
      ["already_sent", "body_refused", "location_contact_missing", "origin", "service_missing", "status", "unconfirmed"].sort(),
    );
    expect([...new Set(rowReasons)].sort()).toEqual(["body_refused", "reschedule_link_error"]);
    expect(gateReasons.sort()).toEqual(
      ["invalid_recipient", "live_send_disabled", "missing_provider_config", "template_unapproved"],
    );
    expect(surveyConstants.sort()).toEqual(["survey_canary_not_listed", "survey_issue_error"]);
    expect(surveyAnswers.sort()).toEqual(["survey_cooldown", "survey_not_allowed", "survey_not_eligible"]);
    expect(written.filter((r) => !KNOWN_SUPPRESSION_REASONS.includes(r))).toEqual([]);
  });

  it("the guard really fails on an unlabelled reason, in each shape it scans", () => {
    // The same scans, run over a line that names a reason nobody labelled.
    const unlabelled = (src: string, re: RegExp) =>
      [...src.matchAll(re)].map((m) => m[1]!).filter((r) => !KNOWN_SUPPRESSION_REASONS.includes(r));
    expect(unlabelled(`return suppress("brand_new_reason");`, /\bsuppress\(\s*"([a-z_]+)"/g)).toEqual([
      "brand_new_reason",
    ]);
    expect(unlabelled(`suppressionReason: "brand_new_reason",`, /suppressionReason: "([a-z_]+)"/g)).toEqual([
      "brand_new_reason",
    ]);
    expect(unlabelled(`{ dispatched: false, reason: "brand_new_reason" }`, /reason: "([a-z_]+)"/g)).toEqual([
      "brand_new_reason",
    ]);
  });

  it.each([
    ["location_contact_missing", "o local da consulta não tem morada ou telefone"],
    ["already_sent", "confirmação já enviada para esta data e hora"],
    ["service_missing", "marcação sem serviço"],
    ["reschedule_link_error", "ligação de remarcação não configurada"],
    ["live_send_disabled", "envio real desligado"],
    ["template_unapproved", "texto da mensagem não aprovado"],
    ["missing_provider_config", "fornecedor de envio não configurado"],
    ["invalid_recipient", "destinatário em falta"],
    // SAT-01: the satisfaction survey's reasons.
    ["survey_canary_not_listed", "avaliação em fase de teste, paciente fora da lista"],
    ["survey_cooldown", "já foi enviada uma avaliação a este paciente nos últimos 60 dias"],
    [
      "survey_not_eligible",
      "o paciente não quer receber avaliações, ou a consulta já tem resposta ou deixou de estar concluída",
    ],
    ["survey_not_allowed", "envio recusado pela base de dados"],
    ["survey_issue_error", "erro ao registar o envio"],
  ])("BOOK-CONFIRM or SAT-01 reason %s has its own sentence", (code, label) => {
    expect(reasonLabel(code)).toBe(label);
    expect(statusOf({ outcome: "suppressed", providerStatus: null, suppressionReason: code }).label).toContain(label);
  });

  it("claim_held has its own sentence, though the dispatcher writes no row for it", () => {
    // The dispatcher answers it and the wrapper leaves the ledger alone
    // (dispatch.ts). The sentence is here so the reason is never the one
    // unlabelled answer, and so a row that did carry it would still read.
    expect(dispatchSrc).toContain('reason: "claim_held"');
    expect(dispatchSrc).toContain('outcome.reason !== "claim_held"');
    expect(reasonLabel("claim_held")).toBe("lembrete já enviado para esta data e hora");
  });

  it("claim_held_by_duplicate has its own sentence, and no row either (Q-A, 2026-10-15)", () => {
    expect(dispatchSrc).toContain('reason: "claim_held_by_duplicate"');
    expect(dispatchSrc).toContain('outcome.reason !== "claim_held_by_duplicate"');
    expect(reasonLabel("claim_held_by_duplicate")).toBe("lembrete já tomado por outro envio no mesmo momento");
    expect(reasonLabel("claim_held_by_duplicate")).not.toBe(reasonLabel("claim_held"));
  });
});

describe("isFailure - the Só falhas filter", () => {
  it("provider errors and the failed provider statuses, nothing else", () => {
    expect(isFailure({ outcome: "provider_error", providerStatus: null })).toBe(true);
    for (const st of FAILED_PROVIDER_STATUSES) {
      expect(isFailure({ outcome: "sent", providerStatus: st })).toBe(true);
    }
    expect(isFailure({ outcome: "sent", providerStatus: "delivered" })).toBe(false);
    expect(isFailure({ outcome: "suppressed", providerStatus: null })).toBe(false);
  });
});

describe("phoneForDisplay - the patient's current number", () => {
  it("normalises what the reminder path can normalise and leaves the rest as stored", () => {
    expect(phoneForDisplay("912 345 678")).toBe("+351912345678");
    expect(phoneForDisplay("00351 214 191 988")).toBe("+351214191988");
    expect(phoneForDisplay("+44 20 7946 0000")).toBe("+44 20 7946 0000");
    expect(phoneForDisplay(null)).toBe("—");
    expect(phoneForDisplay("   ")).toBe("—");
  });
});
