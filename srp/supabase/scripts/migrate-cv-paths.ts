// migrate-cv-paths.ts — one-off: relocate CV objects from the v1 flat layout
// `cvs/{application_id}.{ext}` into the tenant-scoped
// `cvs/{org_id}/{application_id}.{ext}` required by 0007_storage_isolation.sql.
//
// Run BETWEEN migrations 0006 and 0007:
//   1. apply 0006  — org_id is populated, the leaky policies are gone
//   2. run this    — copy, verify, rewrite cv_path, then delete the original
//   3. apply 0007  — the org-scoped read policy
//
// Usage (service role — it must bypass RLS and touch Storage):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno run --allow-env --allow-net supabase/scripts/migrate-cv-paths.ts
//
// Add --dry-run to report what would move without touching anything.
//
// Safe to re-run: rows already on the new layout are skipped, and the
// original object is removed only after the copy is confirmed present. A
// crash mid-run leaves duplicates, never a missing CV.
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = Deno.args.includes("--dry-run");
const BATCH = 200;

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  Deno.exit(1);
}

const admin = createClient(url, serviceKey);

type Row = { id: string; org_id: string; cv_path: string };

const stats = { scanned: 0, moved: 0, skipped: 0, missing: 0, failed: 0 };

async function processRow(row: Row): Promise<void> {
  stats.scanned++;

  // Already migrated (path contains a folder segment).
  if (row.cv_path.includes("/")) {
    stats.skipped++;
    return;
  }

  const target = `${row.org_id}/${row.cv_path}`;

  if (DRY_RUN) {
    console.log(`would move: ${row.cv_path} -> ${target}`);
    stats.moved++;
    return;
  }

  // copy + verify + delete rather than move(): if the process dies between
  // steps the original is still there and the run can simply be repeated.
  const { error: copyError } = await admin.storage
    .from("cvs")
    .copy(row.cv_path, target);

  if (copyError) {
    // An absent source is a data problem worth surfacing, not a crash: the
    // application row stays usable and HR sees a missing-CV state.
    const message = copyError.message.toLowerCase();
    if (message.includes("not found") || message.includes("does not exist")) {
      console.warn(`missing source object for application ${row.id}`);
      stats.missing++;
      return;
    }
    // "already exists" means a previous run copied it; fall through to the
    // path rewrite so the row catches up.
    if (!message.includes("already exists") && !message.includes("duplicate")) {
      console.error(`copy failed for ${row.id}: ${copyError.message}`);
      stats.failed++;
      return;
    }
  }

  // Confirm the destination really is there before dropping the original.
  const { data: check, error: checkError } = await admin.storage
    .from("cvs")
    .list(row.org_id, { search: row.cv_path, limit: 1 });
  if (checkError || !check || check.length === 0) {
    console.error(`verify failed for ${row.id}; original kept`);
    stats.failed++;
    return;
  }

  const { error: updateError } = await admin
    .from("applications")
    .update({ cv_path: target })
    .eq("id", row.id);
  if (updateError) {
    console.error(`cv_path update failed for ${row.id}: ${updateError.message}`);
    stats.failed++;
    return;
  }

  const { error: removeError } = await admin.storage
    .from("cvs")
    .remove([row.cv_path]);
  if (removeError) {
    // The row already points at the new copy, so this is only litter. The
    // housekeeping orphan sweep clears it on the next run.
    console.warn(`original not removed for ${row.id}: ${removeError.message}`);
  }

  stats.moved++;
}

let from = 0;
for (;;) {
  const { data, error } = await admin
    .from("applications")
    .select("id, org_id, cv_path")
    .order("created_at", { ascending: true })
    .range(from, from + BATCH - 1);

  if (error) {
    console.error("application lookup failed:", error.message);
    Deno.exit(1);
  }
  if (!data || data.length === 0) break;

  for (const row of data as Row[]) {
    await processRow(row);
  }

  if (data.length < BATCH) break;
  from += BATCH;
}

console.log(
  `${DRY_RUN ? "[dry run] " : ""}done: ${JSON.stringify(stats)}`
);

// A non-zero exit stops a deploy pipeline before 0007 locks in the new
// layout while some rows still point at the old one.
if (stats.failed > 0) Deno.exit(1);
