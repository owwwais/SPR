// Applies migrations/*.sql in name order, each in its own transaction, and
// records what ran. An advisory lock makes two booting instances take turns
// instead of racing on the same DDL.
import { readdir, readFile } from "node:fs/promises";
import type { Sql } from "./client.ts";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const LOCK_ID = 7_301_016; // arbitrary, constant, ours

export async function migrate(sql: Sql): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_ID})`;
    await tx`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )`;
    const applied = new Set(
      (await tx<{ version: string }[]>`select version from schema_migrations`).map(
        (row) => row.version
      )
    );

    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const text = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
      await tx.unsafe(text);
      await tx`insert into schema_migrations (version) values (${file})`;
      ran.push(file);
    }
    return ran;
  });
}
