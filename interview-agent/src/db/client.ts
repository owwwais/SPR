import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function createSql(url: string, max = 10): Sql {
  return postgres(url, {
    max,
    idle_timeout: 20,
    // Undefined in a parameter is almost always a bug; make it an explicit
    // NULL rather than a driver error deep inside a query.
    transform: { undefined: null },
    onnotice: () => {},
  });
}

// Values bound for a jsonb column have been validated by zod already; this
// only bridges to postgres.js's structural JSONValue type in one place.
export function jsonb(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}
