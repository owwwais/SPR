import { createSql } from "./client.ts";
import { migrate } from "./migrate.ts";
import { log } from "../lib/log.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  log.error("DATABASE_URL is not set");
  process.exit(2);
}
const sql = createSql(url, 1);
try {
  const ran = await migrate(sql);
  log.info("migrations applied", { count: ran.length, files: ran.join(",") });
} finally {
  await sql.end();
}
