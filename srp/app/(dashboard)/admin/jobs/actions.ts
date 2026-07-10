"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
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
  };
}

// Public pages are ISR-cached (60s); refresh them immediately after HR edits.
function revalidateJobPages(id?: string) {
  revalidatePath("/");
  revalidatePath("/jobs");
  if (id) revalidatePath(`/jobs/${id}`);
  revalidatePath("/admin/jobs");
}

export async function createJob(
  _prev: JobFormState,
  formData: FormData
): Promise<JobFormState> {
  const profile = await requireProfile();
  const parsed = jobSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: ar.adminJobs.errors.invalidInput };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .insert({ ...parsed.data, created_by: profile.id });
  if (error) {
    console.error("createJob failed:", error.message);
    return { error: ar.adminJobs.errors.serverError };
  }

  revalidateJobPages();
  redirect("/admin/jobs");
}

export async function updateJob(
  id: string,
  _prev: JobFormState,
  formData: FormData
): Promise<JobFormState> {
  await requireProfile();
  const parsed = jobSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: ar.adminJobs.errors.invalidInput };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update(parsed.data)
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    console.error("updateJob failed:", error.message);
    return { error: ar.adminJobs.errors.serverError };
  }

  revalidateJobPages(id);
  redirect("/admin/jobs");
}

// FR-01: publishing requires non-empty requirements text (the AI matching
// source). Also used to republish a closed job.
export async function publishJob(id: string): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("requirements, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.deleted_at) redirect("/admin/jobs?error=notFound");
  if (job.requirements.trim().length === 0) {
    redirect("/admin/jobs?error=publishNoRequirements");
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "published" })
    .eq("id", id);
  if (error) {
    console.error("publishJob failed:", error.message);
    redirect("/admin/jobs?error=serverError");
  }

  revalidateJobPages(id);
  redirect("/admin/jobs");
}

// FR-01: closing hides the job publicly; new applications are blocked by
// the RLS insert policy (published jobs only).
export async function closeJob(id: string): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ status: "closed" })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    console.error("closeJob failed:", error.message);
    redirect("/admin/jobs?error=serverError");
  }
  revalidateJobPages(id);
  redirect("/admin/jobs");
}

// D9: soft delete only. Hard deletes happen solely in the retention job.
export async function deleteJob(id: string): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("deleteJob failed:", error.message);
    redirect("/admin/jobs?error=serverError");
  }
  revalidateJobPages(id);
  redirect("/admin/jobs");
}
