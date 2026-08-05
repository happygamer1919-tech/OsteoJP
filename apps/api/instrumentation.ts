// W13-02 (Wave 13 LOOP 2) — wire the notification centre's persisting consumer
// at server start.
//
// WHY A BOOT HOOK AND NOT AN IMPORT IN EACH ROUTE. patient-change.ts holds the
// consumer in a module-level variable with `setPatientChangeConsumer` as the
// documented swap seam ("used by tests, and by the centre loop when it lands").
// Doing the swap from each emitting route would mean every FUTURE emit site has
// to remember an import it does not otherwise need, and forgetting it would
// degrade silently back to the stub: notifications would simply stop arriving,
// with a log line saying so that nobody reads. A boot hook cannot be forgotten
// by a new caller.
//
// WHY NOT MAKE IT THE DEFAULT IN patient-change.ts. That module deliberately
// touches no database and no secret — its header records that booking.ts imports
// it and three unit suites exercise it under vitest's node environment without
// mocking anything. Importing the DB there would force every one of those suites
// to mock a database to test an event emitter.
//
// `register()` is Next.js's standard once-per-server-start hook and apps/web
// already uses one (apps/web/instrumentation.ts), so this is the house pattern
// rather than new machinery.
//
// NODE RUNTIME ONLY. The consumer opens a Postgres connection through
// getDbAdmin; there is nothing to register on the edge runtime, and importing it
// there would fail at module load rather than at first use.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ setPatientChangeConsumer }, { persistingConsumer }] = await Promise.all([
    import("./lib/notifications/patient-change"),
    import("./lib/notifications/centre"),
  ]);

  setPatientChangeConsumer(persistingConsumer);
  console.info(
    "[notifications] patient-change consumer registered: staff notification centre (in-app only)",
  );
}
