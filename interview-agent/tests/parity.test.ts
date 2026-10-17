import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SHARED_FILES } from "../scripts/shared-files.ts";

// The contract and the signing code exist in both codebases. If they drift,
// the two services disagree about the protocol in production — so a
// difference of one byte fails the build. Fix: npm run contract:sync.
const root = new URL("../", import.meta.url);
for (const [source, copy] of SHARED_FILES) {
  test(`${copy} is identical to ${source}`, async () => {
    const [a, b] = await Promise.all([
      readFile(new URL(source, root), "utf8"),
      readFile(new URL(copy, root), "utf8"),
    ]);
    assert.equal(b, a, "run `npm run contract:sync` in interview-agent/");
  });
}
