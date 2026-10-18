// Canonical JSON and its hash: object keys sorted recursively, arrays kept in
// order, no whitespace. The same value always hashes the same, whatever order
// its keys were built in — which is what lets a bank_hash or plan_hash be
// recomputed later and compared. Serialised by hand rather than through
// JSON.stringify(object), whose key order puts integer-like keys first.
import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // undefined has no JSON form; inside arrays JSON writes null for it.
    return value === undefined ? "null" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256HexSync(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function canonicalHash(value: unknown): string {
  return sha256HexSync(canonicalJson(value));
}
