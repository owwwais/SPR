"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS } from "@/lib/org-cookie";
import { ar } from "@/lib/i18n/ar";

export type AcceptState = { error: string | null };

export async function acceptInvitation(
  token: string,
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  await requireUser();

  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 120);

  const supabase = await createClient();
  // accept_invitation validates the token hash, the expiry, and that the
  // invitation's email matches the signed-in account — an invitation is
  // addressed to a person, not to whoever holds the link.
  const { data: orgId, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
    p_full_name: fullName.length > 0 ? fullName : null,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("expired")) {
      return { error: ar.invite.errors.expired };
    }
    // "not valid" covers a wrong email, a revoked invitation and a bad token
    // alike; the RPC deliberately does not distinguish them, and neither
    // does this message.
    if (message.includes("not valid")) {
      return { error: ar.invite.errors.invalid };
    }
    console.error("accept_invitation failed:", error.message);
    return { error: ar.invite.errors.serverError };
  }

  if (typeof orgId === "string") {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, orgId, ACTIVE_ORG_COOKIE_OPTIONS);
  }

  redirect("/admin");
}
