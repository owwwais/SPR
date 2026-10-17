// seeker-account — a seeker deleting their own data (D26).
//
// One action, with the user's own bearer:
//
//   { action: "delete" }
//
// "Delete" means immediately and completely, for everything that belongs to
// the seeker hat: the talent profile, its CV versions and skills (one
// cascade in talent_delete_seeker_data), and every CV file in talent-cvs.
// It does NOT reach into the companies they applied to: each application
// holds the company's own copy of the CV (D27) under that company's
// retention (D8), and the account link on it is cleared so nothing points
// back to a person who has left. That boundary is the reason applications
// copy the file instead of referencing it.
//
// The auth account itself goes too — unless it also wears the company hat
// (a membership) or belongs to platform staff. Deleting it there would
// delete a colleague's workspace access as a side effect of leaving the
// seeker portal, which is not what the button says.
//
// Runs with the service role: the database function is service-only, and
// so are the bucket and the auth admin API. The caller's identity comes
// from their verified token, never from the body.
//
// Secrets: platform-injected SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { newTraceId, makeLogger } from "../_shared/trace.ts";

const Body = z.object({ action: z.literal("delete") });

function json(status: number, body: Record<string, unknown>, trace?: string): Response {
  return new Response(JSON.stringify(trace ? { ...body, request_id: trace } : body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 ? token : null;
}

Deno.serve(async (req) => {
  const trace = newTraceId();
  const log = makeLogger("seeker-account", trace);
  log.step("received");

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, trace);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---- 1. who is asking ---------------------------------------------------
  const token = bearerToken(req);
  if (!token) {
    log.fail("auth", "no bearer token");
    return json(401, { error: "auth_required" }, trace);
  }
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user ?? null;
  if (!user) {
    if (authError && (!authError.status || authError.status >= 500)) {
      log.fail("auth", authError.message, { status: authError.status });
      return json(500, { error: "server_error", step: "auth" }, trace);
    }
    log.fail("auth", "token did not resolve to a user");
    return json(401, { error: "auth_required" }, trace);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    log.fail("parse_body", err instanceof Error ? err.message : String(err));
    return json(400, { error: "invalid_input" }, trace);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    log.fail("parse_body", "unknown action");
    return json(400, { error: "invalid_input" }, trace);
  }

  // ---- 2. the seeker's data ---------------------------------------------
  // The function deletes the profile (cascading versions and skills) and
  // unlinks the user's applications in one transaction, and hands back the
  // storage paths it found so the files can follow. It unlinks applications
  // even when there was no profile, so a retry after a partial failure
  // still finishes the job.
  const { data: result, error: rpcError } = await admin.rpc(
    "talent_delete_seeker_data",
    { p_user: user.id }
  );
  if (rpcError) {
    log.fail("delete_data", rpcError.message, { pg_code: rpcError.code });
    return json(500, { error: "server_error", step: "delete_data" }, trace);
  }
  const outcome = (result ?? {}) as { ok?: boolean; error?: string; paths?: unknown };
  const paths = Array.isArray(outcome.paths)
    ? outcome.paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  log.step("data_deleted", { had_profile: outcome.ok === true, files: paths.length });

  // ---- 3. the files ---------------------------------------------------------
  // A failure here is logged, not returned: the rows are already gone, and
  // telling the person "deletion failed" would be false about everything
  // that matters to them. The count in the log is what an operator needs to
  // find and sweep what is left.
  if (paths.length > 0) {
    const { error: removeError } = await admin.storage.from("talent-cvs").remove(paths);
    if (removeError) {
      log.fail("remove_files", removeError.message, { count: paths.length });
    } else {
      log.step("files_removed", { count: paths.length });
    }
  }

  // ---- 4. the account, unless it wears another hat ---------------------
  // Any membership counts, including one in a soft-deleted organization:
  // when in doubt, keep the account. A failed lookup keeps it too, and says
  // so — deleting an account we could not prove was seeker-only is the one
  // mistake here that cannot be undone.
  const [{ count: memberships, error: memberError }, { data: staff, error: staffError }] =
    await Promise.all([
      admin
        .from("memberships")
        .select("org_id", { count: "exact", head: true })
        .eq("user_id", user.id),
      admin
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
  if (memberError || staffError) {
    const error = memberError ?? staffError!;
    log.fail("hat_lookup", error.message, { pg_code: error.code });
    return json(500, { error: "server_error", step: "hat_lookup" }, trace);
  }

  if ((memberships ?? 0) > 0 || staff) {
    log.step("done", { account_deleted: false });
    return json(200, { ok: true, account_deleted: false }, trace);
  }

  // A former staff member who once decided an application's status is named
  // in status_history — the record that a human made that decision (D24).
  // Erasing the account would erase that evidence from a company's file, so
  // the empty account is kept; the seeker data above is already gone.
  const { count: decisions, error: historyError } = await admin
    .from("status_history")
    .select("id", { count: "exact", head: true })
    .eq("changed_by", user.id);
  if (historyError) {
    log.fail("history_lookup", historyError.message, { pg_code: historyError.code });
    return json(500, { error: "server_error", step: "history_lookup" }, trace);
  }
  if ((decisions ?? 0) > 0) {
    log.step("done", { account_deleted: false, reason: "decision_history" });
    return json(200, { ok: true, account_deleted: false }, trace);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    // The seeker data above is already gone; only the empty account
    // remains. Reported as a failure so the person is not told their
    // account no longer exists while they can still sign in to it.
    log.fail("delete_user", deleteError.message, { status: deleteError.status });
    return json(500, { error: "server_error", step: "delete_user" }, trace);
  }

  log.step("done", { account_deleted: true });
  return json(200, { ok: true, account_deleted: true }, trace);
});
