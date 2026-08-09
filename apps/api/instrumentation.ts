// INC-06, 2026-08-09 — this hook NO LONGER REGISTERS THE CONSUMER, because it
// could not, and believing it did cost two production pedidos.
//
// WHAT IT USED TO DO. `register()` imported ./lib/notifications/patient-change
// and called `setPatientChangeConsumer(persistingConsumer)`, on the reasoning
// that a boot hook cannot be forgotten by a new emit site. That reasoning was
// sound and the mechanism was not: a boot hook can only mutate the module copy
// it shares, and it did not share one with the booking path.
//
// THE EVIDENCE, from `.next/server` rather than from argument:
//   instrumentation.js  -> chunks/apps_api_00w-gs~._.js
//                       -> chunks/apps_api_lib_notifications_patient-change_ts_*.js
//                          (1 occurrence of setPatientChangeConsumer)
//   app/api/v1/appointments/route.js
//                       -> chunks/apps_api_lib_appointments_booking_ts_*.js
//                          (patient-change INLINED, 0 occurrences of
//                           setPatientChangeConsumer, and no reference to the
//                           chunk above)
// Two module records, two module-level variables. The booking copy contained no
// setter at all, so no route, warm or cold, first or thousandth, could ever have
// flipped it. Production said exactly this: a GET at 09:03:39 logged "consumer
// registered" while POSTs at 09:02:52 and 09:04:08 logged the stub.
//
// THE FIX IS IN patient-change.ts, not here: `emitPatientChange` resolves
// ./centre itself, per call, so every copy of the module reaches the real
// consumer without anyone having to reach across a bundle boundary.
//
// WHY THIS FILE STILL EXISTS AND IS EMPTY OF WIRING. Deleting it would leave the
// next person free to reinvent the boot-hook pattern; a comment where the defect
// lived is the cheapest possible way to stop that. If a future need for a
// genuine once-per-start side effect appears, it may live here — but it must not
// be something the request path depends on for correctness.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Names only, no values, no ids. This is a boot marker, not a mechanism: the
  // notification centre is reached lazily from emitPatientChange and needs
  // nothing registered here. Kept so a deployed boot is still visible in logs.
  console.info(
    "[notifications] patient-change consumer is resolved per emit (INC-06); no boot registration",
  );
}
