/**
 * OBS-09 - a failed query leaves with its SQL and its code, never its values.
 *
 * ==========================================================================
 * WHERE THE VALUES ARE, READ FROM node_modules AND NOT FROM MEMORY
 * ==========================================================================
 * drizzle-orm 0.45.2, `errors.js`: `DrizzleQueryError` is built with
 *
 *     super(`Failed query: ${query}\nparams: ${params}`)
 *
 * and keeps `query` and `params` as own, enumerable properties, and the
 * driver's error as `cause`. Its `name` is left at "Error". It is thrown from
 * `PgPreparedQuery.queryWithCache` (`pg-core/session.js`), which both of
 * `PostgresJsPreparedQuery`'s ways of running a query go through
 * (`postgres-js/session.js`). So every failed query of this app carries every
 * one of its parameters, comma-joined, at the end of its message, and again
 * as an array under `params`.
 *
 * postgres 3.4.9, `src/errors.js` and `src/connection.js`: a server error is a
 * `PostgresError`, an Error with every field of the server's ErrorResponse
 * assigned onto it, enumerable: `severity`, `code`, `message`, `detail`,
 * `hint`, `where`, `constraint_name` and the rest (`errorFields`). Two of
 * those carry values the query sent: `detail` ("Key (email)=(...) already
 * exists", "Failing row contains (...)") and, for a value Postgres could not
 * read, `message` itself ('invalid input syntax for type uuid: "..."'). The
 * driver also hangs `query`, `parameters`, `args` and `types` on any error of
 * a query (`queryError`), NOT enumerable unless the client was made with
 * `debug`, which this app's is not.
 *
 * NOT A PATH TODAY, AND WHY, so that nobody has to read it all again:
 *   - drizzle's own spans (`tracing.js`) set `drizzle.query.params`, but
 *     `otel` in that file is declared and never assigned: every
 *     `startActiveSpan` there runs the function and makes no span.
 *   - drizzle's query logger prints `-- params: [...]`, and no client here is
 *     made with a logger (`packages/db/src/client.ts`). The cut below reads
 *     that shape too, at no cost, in case one ever is.
 *   - Sentry's postgres.js integration (`@sentry/node`,
 *     `integrations/tracing/postgresjs.js`) records the query text with every
 *     literal replaced by `?`, and the error's message as the span status,
 *     which `mapStatus` (`@sentry/opentelemetry`) turns into "internal_error"
 *     because it is not one of the known statuses. No parameter.
 *   - The SDK reads no own property of an error into an event by default:
 *     that is `extraErrorDataIntegration`, which is not among the defaults
 *     (`@sentry/node-core`, `sdk/index.js`).
 *
 * SO THE VALUES TRAVEL BY FOUR WAYS, and each is cut here:
 *
 *   1. An exception's value. `linkedErrorsIntegration` (a default) follows
 *      `cause`, so one captured failure is two exceptions: the drizzle error,
 *      its message ending in `params: ...`, and the driver's, its message
 *      Postgres's own sentence.
 *   2. A breadcrumb. Next writes an uncaught error to `console.error`, and the
 *      console integration keeps that as a breadcrumb: `message` is the
 *      arguments as text (`String(error)`, which is the drizzle message) and
 *      `data.arguments` the error objects themselves, `params`, `cause` and
 *      `detail` included once the SDK has made data of them.
 *   3. `extra` and `contexts`, if anything ever puts an error object there.
 *   4. Any other string that has had a drizzle message pasted into it: an
 *      application error whose message quotes its cause, a captured message.
 *
 * ==========================================================================
 * WHAT IS KEPT, WHAT IS NOT
 * ==========================================================================
 * KEPT: the SQL text (drizzle writes `$1`, `$2`, not values), the SQLSTATE and
 * the constraint name. That is the ruling, and those three are what a person
 * debugging the failure needs. The SQLSTATE and the constraint are written
 * into the place the driver's message stood, since without the message
 * nothing else on the event would say them.
 *
 * NOT KEPT: the parameters, anywhere. And the driver's message, whole, for any
 * error that is a server error or sits under a failed query: Postgres echoes
 * a value it could not read into the sentence, and a function's
 * `RAISE EXCEPTION '... %', p_id` formats a parameter into it
 * (`packages/db/migrations/0005_patient_merge_multilocation.sql`), and no
 * pattern tells such a sentence from a clean one. A server error object keeps
 * only the fields that name a place in the schema or in the server's source
 * (`SERVER_ERROR_FIELDS`), never one that holds text built from a row.
 *
 * ==========================================================================
 * HOW A STRING IS CUT: FROM THE WORD `params:` TO THE END
 * ==========================================================================
 * Not to the end of the parameters, because the parameters have no end that
 * can be found: each is `String(value)`, and a value holds commas and new
 * lines as freely as anything else. So in any string where `Failed query: `
 * is followed by a new line and `params: `, everything after `params: ` goes
 * and the mark stands there. In an exception's value that is exactly the
 * parameters; in a stack or a log line it is the parameters and whatever was
 * printed after them, which is the price of not guessing.
 *
 * The new line is read plain and JSON-escaped (`\n`), the two ways a message
 * travels inside the SDK. It is not read url-encoded, nor escaped twice.
 *
 * ==========================================================================
 * HOW A MESSAGE IS FOUND: FROM THE ERROR ITSELF, NOT FROM ITS NAME
 * ==========================================================================
 * An exception's `type` is the error's `name`, and `PostgresError` sets its
 * own from `constructor.name`, which a minifier may rename (the server bundle
 * is minified: see next.config.ts). So the driver's message is recognised by
 * where it came from. The hook is handed the error that was captured
 * (`hint.originalException`; for a console breadcrumb, `hint.input`), its
 * `cause` chain is followed, and the message of every error that is a server
 * error by its fields, or that sits under a failed query, is replaced
 * wherever that exact text stands in the value. `type === "PostgresError"` is
 * honoured as well, for an event that arrives with no hint.
 *
 * ==========================================================================
 * LIMITS, KNOWN AND NOT CLOSED HERE
 * ==========================================================================
 *   - A string that holds the parameters with no `Failed query:` in front:
 *     an application that prints `error.params` itself. Nothing in this
 *     repository does (the console calls log `error.name`), and an OBJECT
 *     with `query` and `params` is cut whatever printed it.
 *   - A driver message chased by its exact text: text that is a part of it
 *     only, a value cut short by `maxValueLength` (not set here, so the SDK
 *     cuts nothing), is not found.
 *   - Messages shorter than MIN_CHASED_LENGTH are not chased through other
 *     strings; the exception that carries one is still replaced whole.
 *   - Supabase's own clients (auth) are not drizzle and are not read here.
 *
 * ==========================================================================
 * TOTAL, LIKE THE LINK-CODE SCRUB, AND IT COPIES
 * ==========================================================================
 * It never throws and never returns nothing: a hook that does either loses
 * the event. A getter is never called (it leaves as a fixed string), a value
 * too deep or too large leaves as a fixed string, and if anything else goes
 * wrong the value leaves REDUCED: its own top-level numbers, booleans and cut
 * strings. A value with nothing to cut comes back as the very same object.
 * It runs BEFORE `scrubLinkCodesIn` in every hook, so the link-code scrub
 * still has the last word over whatever this one wrote.
 *
 * No lookbehind and no unbounded repetition in any pattern: this file is in
 * the browser bundle too.
 */

/** What stands where the parameters of a failed query stood. */
export const QUERY_PARAMS_MARK = "[query parameters removed]";
/** What stands where a driver's or the server's message stood. Followed by the code, when there is one. */
export const DB_MESSAGE_MARK = "[database message removed]";

export const TOO_DEEP_MARK = "[too deep: removed by the query-parameter scrub]";
export const TOO_MANY_MARK = "[too many values: removed by the query-parameter scrub]";
export const ACCESSOR_MARK = "[accessor: removed by the query-parameter scrub]";
export const UNREADABLE_MARK = "[unreadable: removed by the query-parameter scrub]";

/** Bounds, the same as the link-code scrub's: deep enough for any event the SDK builds. */
export const MAX_DEPTH = 24;
export const MAX_NODES = 250_000;
/** How far a `cause` chain is followed. */
export const MAX_CAUSES = 16;
/** A driver message shorter than this is not looked for inside other strings. */
export const MIN_CHASED_LENGTH = 8;

/**
 * Where a failed query's text begins, and the ways its parameters are
 * announced after it. The drizzle error first, then drizzle's query logger.
 */
const CUTS: ReadonlyArray<{ opens: string; params: readonly string[] }> = [
  { opens: "Failed query: ", params: ["\nparams: ", "\\nparams: "] },
  { opens: "Query: ", params: [" -- params: "] },
];

/**
 * One string: everything after the first announcement of parameters that
 * follows the start of a failed query is replaced by QUERY_PARAMS_MARK. Pure
 * and idempotent: a string already cut comes back unchanged.
 */
export function scrubQueryParams(text: string): string {
  let out = text;
  for (const cut of CUTS) {
    const opens = out.indexOf(cut.opens);
    if (opens === -1) continue;
    let at = -1;
    let length = 0;
    for (const announce of cut.params) {
      const found = out.indexOf(announce, opens + cut.opens.length);
      if (found !== -1 && (at === -1 || found < at)) {
        at = found;
        length = announce.length;
      }
    }
    if (at === -1) continue;
    const kept = out.slice(0, at + length);
    if (out !== kept + QUERY_PARAMS_MARK) out = kept + QUERY_PARAMS_MARK;
  }
  return out;
}

/** A SQLSTATE, or a driver's own code (`CONNECTION_CLOSED`). Nothing else is written out. */
const CODE = /^[0-9A-Z_]{1,40}$/;
/** An unquoted Postgres identifier, as every constraint in the migrations is named. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

/** What stands where a driver's message stood: the mark, then the code and the constraint. */
export function databaseMessageMark(code: unknown, constraint: unknown): string {
  const parts: string[] = [];
  if (typeof code === "string" && CODE.test(code)) parts.push(`code ${code}`);
  if (typeof constraint === "string" && IDENTIFIER.test(constraint)) parts.push(`constraint ${constraint}`);
  return parts.length === 0 ? DB_MESSAGE_MARK : `${DB_MESSAGE_MARK} (${parts.join(", ")})`;
}

/**
 * The fields of a server error that never hold text built from a row: they
 * name the error, its place in the schema, or its place in the server's own
 * source. Everything else on such an object goes: `message`, `detail`,
 * `hint`, `where`, `internal_query`, and `stack`, whose first line is the
 * message. The names are postgres.js's (`errorFields` in `src/connection.js`),
 * `data type_name` with its space included.
 */
const SERVER_ERROR_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "severity",
  "severity_local",
  "code",
  "constraint_name",
  "schema_name",
  "table_name",
  "column_name",
  "data type_name",
  "position",
  "internal_position",
  "file",
  "line",
  "routine",
]);

/** The keys a driver hangs the values of a query on, beside its `query`. */
const VALUE_KEYS: readonly string[] = ["params", "parameters", "args"];

function own(value: object, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property !== undefined && "value" in property ? property.value : undefined;
}

/** A Postgres server error, as an Error or as the plain data the SDK makes of one. Decided by its fields. */
function isServerError(value: object): boolean {
  return (
    typeof own(value, "code") === "string" &&
    (typeof own(value, "severity") === "string" || typeof own(value, "severity_local") === "string")
  );
}

/** A failed query: drizzle's error, or a driver error made with `debug`. Decided by its fields. */
function isFailedQuery(value: object): boolean {
  return typeof own(value, "query") === "string" && VALUE_KEYS.some((key) => own(value, key) !== undefined);
}

/**
 * The messages to chase, each with what replaces it. Read from the errors the
 * hook was handed, down each `cause` chain: a server error's message, and the
 * message of every error under a failed query.
 */
function chasedMessages(hint: unknown): Map<string, string> {
  const found = new Map<string, string>();
  if (hint === null || typeof hint !== "object") return found;
  const roots: unknown[] = [own(hint, "originalException")];
  const input = own(hint, "input");
  if (Array.isArray(input)) roots.push(...input.slice(0, MAX_CAUSES));

  for (const root of roots) {
    const seen = new Set<unknown>();
    let under = false;
    let error: unknown = root;
    for (let step = 0; step < MAX_CAUSES && error !== null && typeof error === "object" && !seen.has(error); step += 1) {
      seen.add(error);
      const message = own(error, "message");
      if (typeof message === "string" && message.length > 0 && (under || isServerError(error))) {
        found.set(message, databaseMessageMark(own(error, "code"), own(error, "constraint_name")));
      }
      if (isFailedQuery(error)) under = true;
      error = own(error, "cause");
    }
  }
  return found;
}

type Walk = {
  done: WeakMap<object, unknown>;
  changes: number;
  nodes: number;
  chased: Map<string, string>;
};

function replaced(walk: Walk, mark: string): string {
  walk.changes += 1;
  return mark;
}

function scrubString(text: string, walk: Walk): string {
  let out = text;
  const exact = walk.chased.get(out);
  if (exact !== undefined) {
    out = exact;
  } else {
    for (const [message, mark] of walk.chased) {
      if (message.length >= MIN_CHASED_LENGTH && out.includes(message)) out = out.split(message).join(mark);
    }
  }
  out = scrubQueryParams(out);
  if (out !== text) walk.changes += 1;
  return out;
}

function isPlain(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    target[key] = value;
  }
}

/**
 * An Error as the SDK would make data of it (`convertToPlainObject` in
 * @sentry/core): `message`, `name`, `stack`, then its own enumerable fields.
 * Only ever returned when something in it had to be cut.
 */
function errorAsData(error: Error): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  setOwn(data, "message", String(error.message));
  setOwn(data, "name", String(error.name));
  if (typeof error.stack === "string") setOwn(data, "stack", error.stack);
  for (const key of Object.keys(error)) {
    const property = Object.getOwnPropertyDescriptor(error, key);
    if (property === undefined) continue;
    setOwn(data, key, "value" in property ? property.value : ACCESSOR_MARK);
  }
  return data;
}

/** The rules for one object, applied to its copy. Returns whether the copy changed. */
function applyRules(copy: Record<string, unknown>, walk: Walk): boolean {
  let changed = false;

  if (isServerError(copy)) {
    const mark = databaseMessageMark(copy.code, copy.constraint_name);
    for (const key of Object.keys(copy)) {
      if (SERVER_ERROR_FIELDS.has(key)) continue;
      if (key === "message") {
        if (copy.message !== mark) {
          copy.message = replaced(walk, mark);
          changed = true;
        }
        continue;
      }
      delete copy[key];
      walk.changes += 1;
      changed = true;
    }
  }

  if (isFailedQuery(copy)) {
    for (const key of VALUE_KEYS) {
      if (key in copy && copy[key] !== QUERY_PARAMS_MARK) {
        copy[key] = replaced(walk, QUERY_PARAMS_MARK);
        changed = true;
      }
    }
  }

  // An exception as the SDK writes it, for an event that arrives with no hint:
  // the driver's class is recognised by name when the name survived the build.
  if (copy.type === "PostgresError" && typeof copy.value === "string" && !copy.value.startsWith(DB_MESSAGE_MARK)) {
    copy.value = replaced(walk, DB_MESSAGE_MARK);
    changed = true;
  }

  return changed;
}

function rewrite(value: unknown, walk: Walk, depth: number): unknown {
  walk.nodes += 1;
  if (typeof value === "string") {
    return walk.nodes > MAX_NODES ? replaced(walk, TOO_MANY_MARK) : scrubString(value, walk);
  }
  if (value === null || typeof value !== "object") return value;
  if (walk.nodes > MAX_NODES) return replaced(walk, TOO_MANY_MARK);
  if (depth > MAX_DEPTH) return replaced(walk, TOO_DEEP_MARK);

  try {
    const known = walk.done.get(value);
    if (known !== undefined) return known;

    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      walk.done.set(value, copy);
      let changed = false;
      for (let i = 0; i < value.length; i += 1) {
        if (walk.nodes > MAX_NODES) {
          copy.push(replaced(walk, TOO_MANY_MARK));
          changed = true;
          break;
        }
        const item: unknown = value[i];
        const next = rewrite(item, walk, depth + 1);
        if (next !== item) changed = true;
        copy.push(next);
      }
      if (!changed) walk.done.set(value, value);
      return changed ? copy : value;
    }

    // An Error is read as the data the SDK would make of it, and handed back
    // as that data only if something in it was cut. Any other class instance
    // is passed through: the SDK makes plain data of it before `beforeSend`,
    // which is where it is read.
    const isError = value instanceof Error;
    if (!isError && !isPlain(value)) {
      walk.done.set(value, value);
      return value;
    }
    const source: Record<string, unknown> = isError ? errorAsData(value) : (value as Record<string, unknown>);

    const copy = Object.create(isError ? Object.prototype : (Object.getPrototypeOf(value) as object | null)) as Record<
      string,
      unknown
    >;
    walk.done.set(value, copy);
    let changed = false;
    for (const key of Object.keys(source)) {
      const property = Object.getOwnPropertyDescriptor(source, key);
      if (property === undefined) continue;
      if (!("value" in property)) {
        // Never called: it would run application code from inside an error
        // reporter, and the SDK would call it later all the same.
        setOwn(copy, key, replaced(walk, ACCESSOR_MARK));
        changed = true;
        continue;
      }
      const item: unknown = property.value;
      const next = rewrite(item, walk, depth + 1);
      if (next !== item) changed = true;
      setOwn(copy, key, next);
    }
    if (applyRules(copy, walk)) changed = true;
    if (!changed) walk.done.set(value, value);
    return changed ? copy : value;
  } catch {
    const mark = replaced(walk, UNREADABLE_MARK);
    try {
      walk.done.set(value, mark);
    } catch {
      // Not usable as a key. The mark is returned all the same.
    }
    return mark;
  }
}

let failures = 0;

/** How many times the walk failed and a value left reduced. Zero is the only good number. */
export function queryErrorScrubFailures(): number {
  return failures;
}

/** What leaves when the walk itself failed: top-level numbers, booleans and cut strings, nothing nested. */
function reduced(value: unknown): unknown {
  if (typeof value === "string") return UNREADABLE_MARK;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  try {
    for (const key of Object.keys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (property === undefined || !("value" in property)) continue;
      const item: unknown = property.value;
      if (typeof item === "string") {
        let text = UNREADABLE_MARK;
        try {
          text = scrubQueryParams(item);
        } catch {
          // The mark stands.
        }
        setOwn(out, key, text);
      } else if (typeof item === "number" || typeof item === "boolean") {
        setOwn(out, key, item);
      }
    }
  } catch {
    return {};
  }
  return out;
}

/**
 * The function every Sentry hook calls, BEFORE `scrubLinkCodesIn`: an event,
 * a transaction, a span or a breadcrumb goes in, and the same shape comes out
 * with no query parameter and no driver message in it. Pass the hook's hint
 * where the hook has one; it is how the driver's message is recognised.
 *
 * A value with nothing to cut comes back as the very same object.
 */
export function scrubQueryErrorsIn<T>(value: T, hint?: unknown): T {
  try {
    const walk: Walk = { done: new WeakMap(), changes: 0, nodes: 0, chased: chasedMessages(hint) };
    const out = rewrite(value, walk, 0);
    if (walk.changes === 0) return value;
    if (typeof out === "string" && typeof value !== "string") return {} as T;
    return out as T;
  } catch {
    failures += 1;
    if (failures === 1) {
      // Once, and with nothing of the value in it.
      console.warn("[query-errors] the scrub failed on a value and sent it reduced");
    }
    return reduced(value) as T;
  }
}
