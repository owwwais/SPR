"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { JobFormState } from "@/app/(dashboard)/admin/jobs/actions";
import { JOB_TYPES } from "@/lib/validations/job";
import { ar } from "@/lib/i18n/ar";

export type JobFormValues = {
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  requirements: string;
  skills: string;
  min_years_experience: number;
  closes_at: string;
};

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function JobForm({
  action,
  defaultValues,
  submitLabel,
}: {
  action: (prev: JobFormState, formData: FormData) => Promise<JobFormState>;
  defaultValues?: JobFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
  });
  const t = ar.adminJobs.form;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="title">{t.jobTitle}</Label>
          <Input
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={defaultValues?.title}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="department">{t.department}</Label>
          <Input
            id="department"
            name="department"
            maxLength={120}
            defaultValue={defaultValues?.department}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="location">{t.location}</Label>
          <Input
            id="location"
            name="location"
            maxLength={120}
            defaultValue={defaultValues?.location}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">{t.type}</Label>
          <select
            id="type"
            name="type"
            required
            className={selectClass}
            defaultValue={defaultValues?.type ?? "full_time"}
          >
            {JOB_TYPES.map((value) => (
              <option key={value} value={value}>
                {ar.jobs.typeLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="min_years_experience">{t.minYears}</Label>
          <Input
            id="min_years_experience"
            name="min_years_experience"
            type="number"
            min={0}
            max={50}
            defaultValue={defaultValues?.min_years_experience ?? 0}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="closes_at">{t.closesAt}</Label>
          <Input
            id="closes_at"
            name="closes_at"
            type="date"
            defaultValue={defaultValues?.closes_at}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="skills">{t.skills}</Label>
          <Input
            id="skills"
            name="skills"
            placeholder={t.skillsPlaceholder}
            defaultValue={defaultValues?.skills}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description">{t.description}</Label>
          <Textarea
            id="description"
            name="description"
            required
            rows={8}
            defaultValue={defaultValues?.description}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="requirements">{t.requirements}</Label>
          <Textarea
            id="requirements"
            name="requirements"
            rows={8}
            defaultValue={defaultValues?.requirements}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : submitLabel}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/jobs" />}
        >
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}
