"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Every platform RPC checks is_platform_admin() itself (0025); the gate here
// is the first of the two layers, the same shape as requireMembership() plus
// RLS on the tenant side. Each action writes an audit_log row in SQL.

const PLAN_RE = /^[a-z_]{2,20}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function text(formData: FormData, key: string, max = 300): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === "" ? null : trimmed;
}

// Blank = uncapped (NULL), which is a real setting here, not "unchanged".
function limit(formData: FormData, key: string): number | null | "invalid" {
  const raw = text(formData, key, 12);
  if (raw === null) return null;
  if (!/^\d{1,9}$/.test(raw)) return "invalid";
  return Number(raw);
}

function done(kind: string): never {
  revalidatePath("/platform");
  redirect(`/platform?done=${kind}`);
}

function fail(action: string, error: { code?: string; message: string }): never {
  console.error(`${action} failed:`, error.code, error.message);
  redirect("/platform?error=failed");
}

export async function platformApplyPlan(orgId: string, formData: FormData) {
  await requirePlatformAdmin();
  const plan = text(formData, "plan", 20);
  if (!UUID_RE.test(orgId) || !plan || !PLAN_RE.test(plan)) {
    redirect("/platform?error=invalid");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_apply_plan", {
    p_org: orgId,
    p_plan: plan,
    p_note: text(formData, "note") ?? undefined,
  });
  if (error) fail("platform_apply_plan", error);
  done("apply");
}

export async function platformConfirmRequest(requestId: string, formData: FormData) {
  await requirePlatformAdmin();
  if (!UUID_RE.test(requestId)) redirect("/platform?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_confirm_request", {
    p_request: requestId,
    p_payment_ref: text(formData, "payment_ref", 120) ?? undefined,
  });
  if (error) fail("platform_confirm_request", error);
  done("confirm");
}

export async function platformRejectRequest(requestId: string, formData: FormData) {
  await requirePlatformAdmin();
  if (!UUID_RE.test(requestId)) redirect("/platform?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_reject_request", {
    p_request: requestId,
    p_note: text(formData, "note") ?? undefined,
  });
  if (error) fail("platform_reject_request", error);
  done("reject");
}

export async function platformSetLimits(orgId: string, formData: FormData) {
  await requirePlatformAdmin();
  const analyses = limit(formData, "analyses");
  const interviews = limit(formData, "interviews");
  const activeJobs = limit(formData, "active_jobs");
  const seats = limit(formData, "seats");
  if (
    !UUID_RE.test(orgId) ||
    [analyses, interviews, activeJobs, seats].includes("invalid")
  ) {
    redirect("/platform?error=invalid");
  }
  const supabase = await createClient();
  // Narrowed by the check above; the casts only tell TypeScript so.
  const { error } = await supabase.rpc("platform_set_limits", {
    p_org: orgId,
    p_analyses: analyses as number | null,
    p_interviews: interviews as number | null,
    p_active_jobs: activeJobs as number | null,
    p_seats: seats as number | null,
  });
  if (error) fail("platform_set_limits", error);
  done("limits");
}
