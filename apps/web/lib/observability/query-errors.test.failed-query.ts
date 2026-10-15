import { DrizzleQueryError } from "drizzle-orm";

/**
 * OBS-09 - a failed query, built from the same parts the app's own query layer
 * builds it from.
 *
 * Test support only: query-errors.test.ts, query-errors.hooks.test.ts and
 * query-errors.envelope.test.ts import it, and nothing the application ships
 * does. No database is opened: every value here is synthetic.
 *
 * THE OUTER ERROR IS THE REAL CLASS. `DrizzleQueryError` comes from the
 * installed drizzle-orm, so its message is whatever drizzle writes today
 * (`errors.js`: "Failed query: <sql>\nparams: <params>"), not a copy of it.
 *
 * THE CAUSE IS BUILT THE WAY postgres.js BUILDS ONE. That package is not a
 * dependency of apps/web, so its class cannot be imported here. The lines
 * below are its constructor (postgres 3.4.9, `src/errors.js`): the name from
 * `constructor.name`, every field of the server's ErrorResponse assigned onto
 * the error. And then what `queryError` in `src/connection.js` adds to an
 * error of a query: `query`, `parameters`, `args` and `types`, not enumerable,
 * since the app's client is not made with `debug`.
 */

/** Made up. Names nobody. Stands for a patient's name sent as a parameter. */
export const FAKE_NAME = "Quintelinda Sintetica Varzeamorta";
/** Made up. Stands for a second parameter. */
export const FAKE_PHONE = "+351900000017";

/** The SQL as drizzle writes it: placeholders, no values. */
export const SQL_TEXT = 'insert into "patients" ("tenant_id", "full_name", "phone") values ($1, $2, $3)';
export const TENANT = "00000000-0000-4000-8000-000000000001";
export const PARAMS: unknown[] = [TENANT, FAKE_NAME, FAKE_PHONE];

/** Made up, in the shape every constraint in the migrations has. */
export const CONSTRAINT = "patients_tenant_full_name_key";

export class PostgresError extends Error {
  constructor(x: Record<string, string>) {
    super(x.message);
    this.name = this.constructor.name;
    Object.assign(this, x);
  }
}

/** The same constructor under the name a minifier may leave it: `a`. */
export class a extends Error {
  constructor(x: Record<string, string>) {
    super(x.message);
    this.name = this.constructor.name;
    Object.assign(this, x);
  }
}

function withQuery<E extends Error>(error: E, params: unknown[]): E {
  Object.defineProperties(error, {
    query: { value: SQL_TEXT, enumerable: false },
    parameters: { value: params, enumerable: false },
    args: { value: params, enumerable: false },
    types: { value: [2950, 25, 25], enumerable: false },
  });
  return error;
}

/** A unique violation: the value is in `detail`, not in the message. */
export function uniqueViolation(Class: new (x: Record<string, string>) => Error = PostgresError): Error {
  return withQuery(
    new Class({
      severity_local: "ERROR",
      severity: "ERROR",
      code: "23505",
      message: `duplicate key value violates unique constraint "${CONSTRAINT}"`,
      detail: `Key (tenant_id, full_name)=(${TENANT}, ${FAKE_NAME}) already exists.`,
      schema_name: "public",
      table_name: "patients",
      constraint_name: CONSTRAINT,
      file: "nbtinsert.c",
      line: "666",
      routine: "_bt_check_unique",
    }),
    PARAMS,
  );
}

/** A value Postgres could not read: the value is IN the message. */
export function invalidInput(Class: new (x: Record<string, string>) => Error = PostgresError): Error {
  return withQuery(
    new Class({
      severity_local: "ERROR",
      severity: "ERROR",
      code: "22P02",
      message: `invalid input syntax for type uuid: "${FAKE_NAME}"`,
      where: `unnamed portal parameter $1 = '${FAKE_NAME}'`,
      file: "uuid.c",
      line: "133",
      routine: "string_to_uuid",
    }),
    [FAKE_NAME],
  );
}

/** What drizzle throws around the driver's error. */
export function failedQuery(cause: Error = uniqueViolation(), params: unknown[] = PARAMS): DrizzleQueryError {
  return new DrizzleQueryError(SQL_TEXT, params, cause);
}
