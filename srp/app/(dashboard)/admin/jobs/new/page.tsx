import type { Metadata } from "next";
import { JobForm } from "@/components/admin/job-form";
import { requireProfile } from "@/lib/auth";
import { ar } from "@/lib/i18n/ar";
import { createJob } from "../actions";

export const metadata: Metadata = {
  title: ar.adminJobs.newJob,
};

export default async function NewJobPage() {
  await requireProfile();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{ar.adminJobs.newJob}</h1>
      <JobForm action={createJob} submitLabel={ar.adminJobs.form.create} />
    </div>
  );
}
