"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/seeker/onboarding/field-error";
import { submitKeepingValues } from "@/components/seeker/onboarding/submit-keeping-values";
import { saveSeekerContact, type SeekerFormState } from "@/lib/seeker-actions";
import { JOB_TYPES } from "@/lib/validations/job";
import { ar } from "@/lib/i18n/ar";
import type { JobType } from "@/types/database";

const initialState: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

export type ContactDefaults = {
  fullName: string;
  phone: string;
  city: string;
  workTypes: JobType[];
  relocate: boolean | null;
};

// Step two, filled in while the CV is read in the background (plan §2.3).
// It asks only what a CV does not say: how to reach the person, and what
// kind of work they want. The phone is required because applying needs it
// (submit-application checks it against the same rule as the guest form).
export function ContactStep({ defaults }: { defaults: ContactDefaults }) {
  const t = ar.seekerOnboarding.contact;
  const [state, formAction, pending] = useActionState(saveSeekerContact, initialState);
  const errors = state.fieldErrors;
  const relocateDefault =
    defaults.relocate === true ? "yes" : defaults.relocate === false ? "no" : "";

  return (
    <form
      action={formAction}
      onSubmit={submitKeepingValues(formAction)}
      className="flex flex-col gap-6"
    >
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="full_name">{t.fullName}</Label>
          <Input
            id="full_name"
            name="full_name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            defaultValue={defaults.fullName}
            aria-invalid={errors.full_name ? true : undefined}
            aria-describedby={errors.full_name ? "full_name-error" : undefined}
          />
          <FieldError id="full_name-error" message={errors.full_name} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">{t.phone}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            maxLength={20}
            autoComplete="tel"
            dir="ltr"
            className="text-start"
            defaultValue={defaults.phone}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? "phone-error phone-hint" : "phone-hint"}
          />
          <p id="phone-hint" className="text-xs text-muted-foreground">
            {t.phoneHint}
          </p>
          <FieldError id="phone-error" message={errors.phone} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city">{t.city}</Label>
          <Input
            id="city"
            name="city"
            maxLength={120}
            autoComplete="address-level2"
            defaultValue={defaults.city}
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? "city-error" : undefined}
          />
          <FieldError id="city-error" message={errors.city} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby="work_types-hint">
        <legend className="mb-1 text-sm font-medium">{t.workTypes}</legend>
        <p id="work_types-hint" className="-mt-2 text-xs text-muted-foreground">
          {t.workTypesHint}
        </p>
        <div className="flex flex-wrap gap-2">
          {JOB_TYPES.map((type) => (
            <label
              key={type}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors duration-150 hover:bg-surface-soft has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-soft-foreground has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/35"
            >
              <input
                type="checkbox"
                name="work_types"
                value={type}
                defaultChecked={defaults.workTypes.includes(type)}
                className="size-4 accent-primary"
              />
              {ar.jobs.typeLabels[type]}
            </label>
          ))}
        </div>
        <FieldError id="work_types-error" message={errors.work_types} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t.relocate}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(
            [
              ["yes", t.relocateYes],
              ["no", t.relocateNo],
              ["", t.relocateUnset],
            ] as const
          ).map(([value, label]) => (
            <label key={value || "unset"} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="relocate"
                value={value}
                defaultChecked={relocateDefault === value}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" size="lg" disabled={pending} className="sm:w-fit sm:self-end">
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
