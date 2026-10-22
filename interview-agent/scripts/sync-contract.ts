// Copies the shared files into the platform's Edge Functions folder. They
// must stay byte-identical; tests/parity.test.ts fails when they drift.
import { copyFile } from "node:fs/promises";
import { SHARED_FILES } from "./shared-files.ts";

const root = new URL("../", import.meta.url);
for (const [from, to] of SHARED_FILES) {
  await copyFile(new URL(from, root), new URL(to, root));
  console.log(`${from} -> ${to}`);
}
