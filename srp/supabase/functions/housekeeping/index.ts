// housekeeping — daily maintenance (§4.2.4, D8), triggered by pg_cron:
//   1) retry failed analyses (analysis_attempts < 3, capped per run)
//   2) retention: per organization, delete applications older than that
//      org's own retention_months together with their CV files (Storage
//      API) — the ONLY hard-delete path in the system (D9)
//   3) sweep orphaned CV uploads older than the retention cutoff, walking
//      each tenant's cvs/{org_id}/ folder
//   4) expire the submission throttle log (0008)
// Idempotent and safe to invoke at any time; returns only counters.
import { createClient } from "@supabase/supabase-js";

const RETRY_CAP = 10; // Gemini cost guard (§8)
const DELETE_BATCH = 500;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const result = {
    retried: 0,
    deleted_applications: 0,
    deleted_files: 0,
    errors: 0,
  };
  const logError = (message: string) => {
    result.errors++;
    console.error("housekeeping:", message);
  };

  // ---- 1) retry failed analyses (D4: max 3 attempts), and sweep runs
  // whose invocation was lost: still 'pending' after 15 minutes (the
  // post-submit trigger never landed) or stuck 'processing' for over an
  // hour (crashed mid-run — analyze-application accepts force for these).
  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  const [failedRes, stalePendingRes, staleProcessingRes] = await Promise.all([
    admin
      .from("applications")
      .select("id")
      .eq("analysis_status", "failed")
      .lt("analysis_attempts", 3)
      .order("created_at", { ascending: true })
      .limit(RETRY_CAP),
    admin
      .from("applications")
      .select("id")
      .eq("analysis_status", "pending")
      .lt("created_at", fifteenMinAgo)
      .limit(RETRY_CAP),
    admin
      .from("applications")
      .select("id")
      .eq("analysis_status", "processing")
      .lt("created_at", oneHourAgo)
      .limit(RETRY_CAP),
  ]);
  for (const res of [failedRes, stalePendingRes, staleProcessingRes]) {
    if (res.error) logError(`retry lookup: ${res.error.message}`);
  }
  const toRetry = [
    ...(failedRes.data ?? []),
    ...(stalePendingRes.data ?? []),
    ...(staleProcessingRes.data ?? []),
  ].slice(0, RETRY_CAP);

  for (const application of toRetry) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-application`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ application_id: application.id, force: true }),
      });
      result.retried++;
      if (!res.ok) logError(`retry ${application.id}: HTTP ${res.status}`);
    } catch (err) {
      logError(
        `retry ${application.id}: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // ---- 2) retention, per organization ----
  // Retention is a per-tenant setting now (0006 replaced the single settings
  // row), so the cutoff has to be computed per organization rather than once
  // for the whole database. Soft-deleted orgs are included deliberately: a
  // cancelled customer's applicant data should age out, not linger.
  const { data: organizations, error: orgsError } = await admin
    .from("organizations")
    .select("id, retention_months");
  if (orgsError) logError(`organization lookup: ${orgsError.message}`);

  for (const organization of organizations ?? []) {
    const months = organization.retention_months ?? 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffIso = cutoff.toISOString();

    const { data: expired, error: expiredError } = await admin
      .from("applications")
      .select("id, cv_path")
      .eq("org_id", organization.id)
      .lt("created_at", cutoffIso)
      .limit(DELETE_BATCH);
    if (expiredError) {
      logError(`retention lookup: ${expiredError.message}`);
      continue;
    }

    if (expired && expired.length > 0) {
      const { error: removeError } = await admin.storage
        .from("cvs")
        .remove(expired.map((a) => a.cv_path));
      if (removeError) {
        logError(`cv removal: ${removeError.message}`);
      } else {
        result.deleted_files += expired.length;
      }

      // Cascades to ai_evaluations and status_history (FKs).
      const { error: deleteError, count } = await admin
        .from("applications")
        .delete({ count: "exact" })
        .in(
          "id",
          expired.map((a) => a.id)
        );
      if (deleteError) {
        logError(`application deletion: ${deleteError.message}`);
      } else {
        result.deleted_applications += count ?? 0;
      }
    }

    // ---- 3) orphaned CV files in this org's folder ----
    // Objects live at cvs/{org_id}/{application_id}.{ext} (0007), so the
    // sweep lists each org's folder instead of the bucket root.
    const { data: objects, error: listError } = await admin.storage
      .from("cvs")
      .list(organization.id, { limit: 1000 });
    if (listError) {
      logError(`storage list: ${listError.message}`);
      continue;
    }

    const oldPaths = (objects ?? [])
      .filter((o) => o.created_at && o.created_at < cutoffIso)
      .map((o) => `${organization.id}/${o.name}`);
    if (oldPaths.length === 0) continue;

    const { data: referenced } = await admin
      .from("applications")
      .select("cv_path")
      .eq("org_id", organization.id)
      .in("cv_path", oldPaths);
    const referencedSet = new Set((referenced ?? []).map((r) => r.cv_path));
    const orphans = oldPaths.filter((path) => !referencedSet.has(path));
    if (orphans.length > 0) {
      const { error: orphanError } = await admin.storage
        .from("cvs")
        .remove(orphans);
      if (orphanError) {
        logError(`orphan removal: ${orphanError.message}`);
      } else {
        result.deleted_files += orphans.length;
      }
    }
  }

  // ---- 4) throttle log ----
  // Submission attempt hashes are an abuse control, not a record worth
  // keeping (0008); a day is all the limits look back over.
  const { error: throttleError } = await admin
    .from("submission_attempts")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  if (throttleError) logError(`throttle cleanup: ${throttleError.message}`);

  console.log("housekeeping done:", JSON.stringify(result));
  return json(200, result);
});
