"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Requesting a plan changes nothing yet: it records intent and the amount
// quoted. The plan applies when a platform admin confirms the transfer
// (0025, D20). Owners and admins only — the RPC checks the same thing.

const PLAN_RE = /^[a-z_]{2,20}$/;

export async function requestPlanChange(planCode: string): Promise<void> {
  const session = await requireOrgAdmin();
  if (!PLAN_RE.test(planCode)) redirect("/admin/billing?error=requestFailed");

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_plan_change", {
    p_org: session.org.id,
    p_plan: planCode,
  });
  if (error) {
    console.error("request_plan_change failed:", error.code, error.message);
    redirect("/admin/billing?error=requestFailed");
  }

  revalidatePath("/admin/billing");
  redirect("/admin/billing?requested=1");
}

export async function cancelPlanRequest(requestId: string): Promise<void> {
  await requireOrgAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_plan_request", {
    p_request: requestId,
  });
  if (error) {
    console.error("cancel_plan_request failed:", error.code, error.message);
    redirect("/admin/billing?error=cancelFailed");
  }
  revalidatePath("/admin/billing");
  redirect("/admin/billing");
}
