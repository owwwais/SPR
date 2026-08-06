// manage-users — team account creation, scoped to ONE organization.
//
// Creating auth users requires the service role, which lives ONLY in Edge
// Functions (never in Next.js — D3/D7). Multi-tenancy changes two things
// about the v1 version:
//   * the caller's authority is per-organization ("are you an owner or admin
//     of THIS org?") instead of the global profiles.role = 'admin', and
//   * the new user gets a membership row in that org, not a global role.
//
// Two actions, both requiring the caller's JWT to belong to an owner or admin
// of org_id, and both refusing to mint an owner unless the caller is one:
//
//   { action: "invite", org_id, email, role }
//     The normal path. Creates a one-time invitation and emails the link; the
//     colleague chooses their own password and accept_invitation() binds the
//     invitation to their address.
//
//   { action: "create", org_id, email, password, full_name, role }
//     Kept for the case where email delivery is not available — the admin
//     sets a temporary password and passes it on out of band.
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

// A one-time invitation token. Only its SHA-256 lands in the database, so a
// read of the invitations table yields nothing a thief could redeem.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  if (payload.action !== "create" && payload.action !== "invite") {
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
  if (payload.action === "create") {
    if (password.length < 8 || password.length > 72) {
      return json(400, { error: "invalid password" });
    }
    if (fullName.length < 2 || fullName.length > 120) {
      return json(400, { error: "invalid full_name" });
    }
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

  // ---- invite: the preferred path (S2) ----
  // No admin-chosen password: the colleague sets their own credentials, and
  // the invitation is bound to their email address by accept_invitation().
  if (payload.action === "invite") {
    const token = generateToken();
    const tokenHash = await sha256Hex(token);

    // A pending invitation for this address is replaced rather than
    // duplicated — the partial unique index (0009) would reject a second one,
    // and re-inviting should just resend a fresh link.
    await admin
      .from("invitations")
      .update({ status: "revoked" })
      .eq("org_id", orgId)
      .eq("email", email)
      .eq("status", "pending");

    const { data: invitation, error: inviteError } = await admin
      .from("invitations")
      .insert({
        org_id: orgId,
        email,
        role,
        token_hash: tokenHash,
      })
      .select("id")
      .single();
    if (inviteError || !invitation) {
      console.error("invitation insert failed:", inviteError?.message);
      return json(500, { error: "invite failed" });
    }

    // The token travels to the mailer once and is never stored in the clear.
    const mailRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          kind: "invitation",
          invitation_id: invitation.id,
          token,
        }),
      }
    );
    if (!mailRes.ok) {
      // The invitation exists and can be resent; do not fail the whole call.
      console.error(`invitation email returned HTTP ${mailRes.status}`);
      return json(200, { ok: true, invitation_id: invitation.id, emailed: false });
    }

    console.log(`invitation sent (role=${role})`);
    return json(200, { ok: true, invitation_id: invitation.id, emailed: true });
  }

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
