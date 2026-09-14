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

describe("kindOf - the kind is derived from template_id (0075 ruling 1)", () => {
  it.each([
    ["reminder.24h.sms", "reminder_24h"],
    ["reminder.48h.email", "reminder_48h"],
    ["reminder.24h.sms.fee_notice", "reminder_fee"],
    ["confirmation.sms", "confirmation"],
    ["follow_up.sms", "follow_up"],
    ["no_show.sms", "no_show"],
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
    const ids = [...new Set([...literal, "reminder.24h.sms", "reminder.48h.email", "reminder.24h.sms.fee_notice"])];
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
    const written = [...new Set([...outcomes, ...skips, "sandbox"])];
    // Positive controls: both scans found something, so the check below is not
    // an empty list agreeing with itself.
    expect(outcomes.length).toBeGreaterThanOrEqual(8);
    expect(skips.sort()).toEqual(["invalid_phone", "landline"]);
    expect(written.filter((r) => !KNOWN_SUPPRESSION_REASONS.includes(r))).toEqual([]);
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
