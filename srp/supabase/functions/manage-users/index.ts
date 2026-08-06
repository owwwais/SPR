// manage-users — team account creation, scoped to ONE organization.
//
// Creating auth users requires the service role, which lives ONLY in Edge
// Functions (never in Next.js — D3/D7). Multi-tenancy changes two things
// about the v1 version:
//   * the caller's authority is per-organization ("are you an owner or admin
//     of THIS org?") instead of the global profiles.role = 'admin', and
//   * the new user gets a membership row in that org, not a global role.
//
// Contract: POST { action: "create", org_id, email, password, full_name, role }
// The caller's JWT must belong to an owner or admin of org_id. Only an owner
// may create another owner.
//
// The invitation flow (email link, no admin-chosen password) lands in S2;
// until then this stays the way a tenant adds a colleague.
import { createClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLES = ["owner", "admin", "hr", "viewer"] as const;
type Role = (typeof ROLES)[number];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// The caller's role in the target org, or null if they are not a member of
// it. Runs with the caller's own JWT so the membership helpers — not this
// function — decide the answer.
async function callerRole(req: Request, orgId: string): Promise<Role | null> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const asCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: header } } }
    );
    const { data } = await asCaller.rpc("org_role", { p_org: orgId });
    return (ROLES as readonly string[]).includes(data) ? (data as Role) : null;
  } catch {
    return null;
  }
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  // listUsers is paginated; a tenant's colleague may be anywhere in it.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let payload: {
    action?: string;
    org_id?: string;
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

  const orgId = String(payload.org_id ?? "");
  const email = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const fullName = String(payload.full_name ?? "").trim();
  const role = (ROLES as readonly string[]).includes(payload.role ?? "")
    ? (payload.role as Role)
    : "hr";

  if (!UUID_RE.test(orgId)) return json(400, { error: "invalid org_id" });
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return json(400, { error: "invalid email" });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: "invalid password" });
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return json(400, { error: "invalid full_name" });
  }

  const actorRole = await callerRole(req, orgId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    return json(403, { error: "org admin only" });
  }
  // Mirrors the memberships RLS policy: an admin must not be able to mint an
  // owner and so promote themselves past their own ceiling.
  if (role === "owner" && actorRole !== "owner") {
    return json(403, { error: "owner only" });
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

  let userId = created?.user?.id ?? null;
  const isNewAccount = !createError;

  if (createError) {
    const duplicate = createError.message?.toLowerCase().includes("already");
    if (!duplicate) {
      console.error("createUser failed:", createError.message);
      return json(500, { error: "create failed" });
    }
    // D14: the person may already have an account because they belong to a
    // different organization (agencies, contractors). Attach a membership
    // rather than refusing — but never touch their password or profile name.
    userId = await findUserIdByEmail(admin, email);
    if (!userId) return json(409, { error: "email exists" });

    const { data: alreadyMember } = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (alreadyMember) return json(409, { error: "already a member" });
  }

  if (!userId) return json(500, { error: "create failed" });

  // profiles is identity-only now: one row per person, reused across orgs.
  // Only fill in the name for an account we just created.
  if (isNewAccount) {
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id: userId, full_name: fullName });
    if (profileError) {
      console.error("profile insert failed:", profileError.message);
      await admin.auth.admin.deleteUser(userId);
      return json(500, { error: "profile failed" });
    }
  }

  const { error: membershipError } = await admin
    .from("memberships")
    .insert({ org_id: orgId, user_id: userId, role });
  if (membershipError) {
    console.error("membership insert failed:", membershipError.message);
    // Roll back only an account we ourselves created; never delete one that
    // already existed for another organization.
    if (isNewAccount) await admin.auth.admin.deleteUser(userId);
    return json(500, { error: "membership failed" });
  }

  console.log(`team member added (role=${role})`);
  return json(200, { ok: true, user_id: userId });
});
