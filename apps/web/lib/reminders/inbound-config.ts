// Inbound-SMS feature flags (W12-11). Everything net-new stays OFF by default.
//
// The inbound reply store + the "resposta por rever" review flag require a
// migration (an sms_inbound_events table with tenant_id + RLS + an isolation
// test) that is DEFERRED to the end of the migration relay. Until it lands, the
// review list reads an empty stubbed store, and this flag stays OFF so no
// half-built inbound surface is reachable in any environment.
//
// The live Twilio inbound webhook is likewise NOT registered — the route handler
// is a flag-gated stub (app/api/webhooks/twilio/inbound/route.ts). Outbound live
// sends remain gated by the separate REMINDERS_LIVE_SEND (clients.ts).

/**
 * REMINDERS_INBOUND gates the inbound-reply capability + the reception review
 * list. Exactly "true" enables it; anything else (unset / "false" / "1") keeps
 * it OFF. Read at call time so tests and env flips take effect without a
 * re-import. Defaults OFF until the inbound-store migration ships.
 */
export function remindersInboundEnabled(): boolean {
  return process.env.REMINDERS_INBOUND === "true";
}
