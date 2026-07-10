import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/admin/job-form";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ScreeningQuestions } from "@/lib/validations/screening";
import { ar } from "@/lib/i18n/ar";
import { updateJob } from "../../actions";

export const metadata: Metadata = {
  title: ar.adminJobs.editJob,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id,title,department,location,type,description,requirements,skills,min_years_experience,closes_at,screening_questions,deleted_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (!job || job.deleted_at) notFound();

  const screeningQuestions = ScreeningQuestions.safeParse(
    job.screening_questions
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">
        {ar.adminJobs.editJob}: {job.title}
      </h1>
      <JobForm
        action={updateJob.bind(null, job.id)}
        submitLabel={ar.adminJobs.form.save}
        defaultValues={{
          title: job.title,
          department: job.department ?? "",
          location: job.location ?? "",
          type: job.type,
          description: job.description,
          requirements: job.requirements,
          skills: job.skills.join(", "),
          min_years_experience: job.min_years_experience ?? 0,
          closes_at: job.closes_at ?? "",
          screening_questions: screeningQuestions.success
            ? screeningQuestions.data
            : [],
        }}
      />
    </div>
  );
}
