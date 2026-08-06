"use server";

import { revalidateJob } from "@/lib/revalidate";
import { redirect } from "next/navigation";
import { canWrite, requireMembership, type Session } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jobSchema } from "@/lib/validations/job";
import { ar } from "@/lib/i18n/ar";

export type JobFormState = { error: string | null };

function formValues(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    department: String(formData.get("department") ?? ""),
    location: String(formData.get("location") ?? ""),
    type: String(formData.get("type") ?? ""),
    description: String(formData.get("description") ?? ""),
    requirements: String(formData.get("requirements") ?? ""),
    skills: String(formData.get("skills") ?? ""),
    min_years_experience: String(formData.get("min_years_experience") ?? "0"),
    closes_at: String(formData.get("closes_at") ?? ""),
    screening_questions: String(formData.get("screening_questions") ?? "[]"),
  };
}

function formError(parseError: { issues: Array<{ path: PropertyKey[] }> }) {
  const questionsIssue = parseError.issues.some(
    (issue) => issue.path[0] === "screening_questions"
  );
  return questionsIssue
    ? ar.adminJobs.questions.errors.invalid
    : ar.adminJobs.errors.invalidInput;
}

// Every mutation here is guarded twice: this check, and the RLS policy that
// requires is_org_member(org_id, owner|admin|hr). The isolation invariant
// (§2.1) asks for both.
async function requireJobWriter(): Promise<Session> {
  const session = await requireMembership();
  if (!canWrite(session.role)) redirect("/admin/jobs?error=forbidden");
  return session;
}

// Public pages are ISR-cached (60s); refresh them immediately after edits.
// Scoped by slug so one tenant publishing a job does not invalidate another
// tenant's careers page (see lib/revalidate.ts).
function revalidateJobPages(slug: string, id?: string) {
  revalidateJob(slug, id);
}

export async function createJob(
  _prev: JobFormState,
  formData: FormData
): Promise<JobFormState> {
  const session = await requireJobWriter();
  const parsed = jobSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: formError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .insert({
      ...parsed.data,
      org_id: session.org.id,
      created_by: session.userId,
    });
  if (error) {
    console.error("createJob failed:", error.message);
    return { error: ar.adminJobs.errors.serverError };
  }

  revalidateJobPages(session.org.slug);
  redirect("/admin/jobs");
}

export async function updateJob(
  id: string,
  _prev: JobFormState,
  formData: FormData
): Promise<JobFormState> {
  const session = await requireJobWriter();
  const parsed = jobSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: formError(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", session.org.id)
    .is("deleted_at", null);
  if (error) {
    console.error("updateJob failed:", error.message);
    return { error: ar.adminJobs.errors.serverError };
  }

  revalidateJobPages(session.org.slug, id);
  redirect("/admin/jobs");
}

// FR-01: publishing requires non-empty requirements text (the AI matching
// source). Also used to republish a closed job.
export async function publishJob(id: string): Promise<void> {
  const session = await requireJobWriter();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("requirements, deleted_at")
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!job || job.deleted_at) redirect("/admin/jobs?error=notFound");
  if (job.requirements.trim().length === 0) {
    redirect("/admin/jobs?error=publishNoRequirements");
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "published" })
    .eq("id", id)
    .eq("org_id", session.org.id);
  if (error) {
    console.error("publishJob failed:", error.message);
    redirect("/admin/jobs?error=serverError");
  }

  revalidateJobPages(session.org.slug, id);
  redirect("/admin/jobs");
}

// FR-01: closing hides the job publicly; new applications are blocked by
// the RLS insert policy (published jobs only).
export async function closeJob(id: string): Promise<void> {
  const session = await requireJobWriter();
  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ status: "closed" })
    .eq("id", id)
    .eq("org_id", session.org.id)
    .is("deleted_at", null);
  if (error) {
    console.error("closeJob failed:", error.message);
    redirect("/admin/jobs?error=serverError");
  }
  revalidateJobPages(session.org.slug, id);
  redirect("/admin/jobs");
}

// D9: soft delete only. Hard deletes happen solely in the retention job.
export async function deleteJob(id: string): Promise<void> {
  const session = await requireJobWriter();
  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", session.org.id);
  if (error) {
    console.error("deleteJob failed:", error.message);
    redirect("/admin/jobs?error=serverError");
  }
  revalidateJobPages(session.org.slug, id);
  redirect("/admin/jobs");
}
