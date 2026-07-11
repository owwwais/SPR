// manage-users — admin-only team account creation (engineer request,
// 2026-07-11): the platform owner cannot use the Supabase dashboard, so
// admins create HR/admin accounts from the settings page. Creating auth
// users requires the service role, which lives ONLY in Edge Functions
// (never in Next.js — D3/D7).
//
// Contract: POST { action: "create", email, password, full_name, role }
// The caller's JWT must belong to a profile with role = 'admin'.
import { createClient } from "@supabase/supabase-js";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function callerIsAdmin(req: Request): Promise<boolean> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  try {
    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: header } } }
    );
    const { data } = await asCaller.rpc("current_user_role");
    return data === "admin";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let payload: {
    action?: string;
    email?: string;
    password?: string;
    full_name?: string;
    role?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  if (payload.action !== "create") {
    return json(400, { error: "unsupported action" });
  }
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const fullName = String(payload.full_name ?? "").trim();
  const role = payload.role === "admin" ? "admin" : "hr";
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return json(400, { error: "invalid email" });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: "invalid password" });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return json(400, { error: "invalid full_name" });
  }

  if (!(await callerIsAdmin(req))) {
    return json(403, { error: "admin only" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createError || !created.user) {
    console.error("createUser failed:", createError?.message);
    const duplicate = createError?.message
      ?.toLowerCase()
      .includes("already");
    return json(duplicate ? 409 : 500, {
      error: duplicate ? "email exists" : "create failed",
    });
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    role,
  });
  if (profileError) {
    // Roll back the orphaned auth user so the email can be retried.
    console.error("profile insert failed:", profileError.message);
    await admin.auth.admin.deleteUser(created.user.id);
    return json(500, { error: "profile failed" });
  }

  console.log(`team member created (role=${role})`);
  return json(200, { ok: true, user_id: created.user.id });
});
