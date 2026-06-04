import { NextResponse } from "next/server";
import { s } from "@/lib/i18n";
import {
  HTTP_STATUS,
  MESSAGE_KEY,
  isAppointmentError,
  type AppointmentErrorCode,
} from "./errors";
import type { StringKey } from "@osteojp/i18n";

// Shared response mapping for the patient appointments routes. Keeps handlers
// thin and guarantees the patient never sees DB internals or another patient's
// data — only a stable code + a localized (PT-default) message.

/** 401 for any non-patient principal (no session / staff token / malformed). */
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized", message: s["patientAppointments.error.unauthorized"] },
    { status: 401 },
  );
}

function body(code: AppointmentErrorCode) {
  return { error: code, message: s[MESSAGE_KEY[code] as StringKey] };
}

/**
 * Map any thrown value to a response. A typed AppointmentError becomes its
 * mapped status + i18n message; anything else is a generic 500 with no detail
 * leaked (PII rule #7).
 */
export function errorResponse(e: unknown): NextResponse {
  if (isAppointmentError(e)) {
    return NextResponse.json(body(e.code), { status: HTTP_STATUS[e.code] });
  }
  return NextResponse.json(
    { error: "server_error", message: s["patientAppointments.error.serverError"] },
    { status: 500 },
  );
}
