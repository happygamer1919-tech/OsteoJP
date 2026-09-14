// PHONE-01 — what the patient form says under the phone box, and the sentence
// for the non-SMS marker. Pure (no React, no DB), client-safe, unit-tested.
//
// The preview is UX: the server re-parses on every write and its answer binds.
// It uses the SAME parser the server saves with, so "Será guardado como X" is the
// value the column will hold, byte for byte.
//
// IT UPDATES ON CHANGE, NOT ON BLUR, and the form reserves its height. A message
// that appears on blur pushes Guardar down between mousedown and click and the
// click lands on nothing (validate-on-blur eats the click).

import { parsePatientPhone, type NoSmsReason } from "@osteojp/notify";
import type { StringKey } from "@osteojp/i18n";

type Strings = Readonly<Record<StringKey, string>>;

export type PhonePreview = { tone: "ok" | "warning" | "error"; text: string } | null;

/** The marker sentence for each reason. Shared by the record and the drawer. */
export const NO_SMS_MESSAGE_KEY: Record<NoSmsReason, StringKey> = {
  landline: "patients.noSmsLandline",
  foreign: "patients.noSmsForeign",
  unparseable: "patients.noSmsUnparseable",
};

/**
 * @param current what is in the box now
 * @param stored  the patient's stored phone on EDIT; `undefined` on create. An
 *                unchanged value that is not already exact E.164 is a legacy
 *                value the server leaves as it is, and the line says so instead
 *                of refusing it.
 */
export function phonePreview(current: string, stored: string | null | undefined, s: Strings): PhonePreview {
  const typed = current.trim();
  if (typed === "") return null;

  const parsed = parsePatientPhone(typed);
  if (stored !== undefined && typed === (stored ?? "").trim()) {
    if (!parsed.ok || parsed.e164 !== typed) return { tone: "warning", text: s["patients.phonePreviewLegacy"] };
  }
  if (!parsed.ok) return { tone: "error", text: parsed.message };
  if (parsed.kind === "none") return null;

  const saved = s["patients.phonePreviewSaved"].replace("{e164}", parsed.e164);
  if (parsed.kind === "pt_landline") return { tone: "warning", text: `${saved}. ${s["patients.phonePreviewLandline"]}` };
  if (parsed.kind === "foreign") return { tone: "warning", text: `${saved}. ${s["patients.phonePreviewForeign"]}` };
  return { tone: "ok", text: saved };
}
