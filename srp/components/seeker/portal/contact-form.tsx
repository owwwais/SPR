"use client";

import { useActionState } from "react";
import { AlertCircle, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/seeker/portal/field-error";
import { keepValuesSubmit } from "@/components/seeker/portal/keep-values-submit";
import { saveSeekerContact, type SeekerFormState } from "@/lib/seeker-actions";
import type { SeekerPreferences } from "@/lib/seeker";
import { ar } from "@/lib/i18n/ar";
import type { JobType } from "@/types/database";

const initial: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

const JOB_TYPES: JobType[] = [
  "full_time",
  "part_time",
  "contract",
  "remote",
  "internship",
];

// Contact details and preferences. These reach a company only inside an
// application the seeker submits and consents to (D27); the database
// validates them with the apply form's own rules, so a profile saved here
// is one submit-application will accept.
export function ContactForm({
  email,
  fullName,
  phone,
  city,
  preferences,
}: {
  email: string;
  fullName: string | null;
  phone: string | null;
  city: string | null;
  preferences: SeekerPreferences;
}) {
  const t = ar.seekerPortal.profile;
  const [state, dispatch, pending] = useActionState(saveSeekerContact, initial);
  const relocate =
    preferences.relocate === true ? "yes" : preferences.relocate === false ? "no" : "";

  return (
    <form onSubmit={keepValuesSubmit(dispatch)} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_full_name">{t.fullName}</Label>
          <Input
            id="contact_full_name"
            name="full_name"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            defaultValue={fullName ?? ""}
            aria-invalid={state.fieldErrors.full_name ? true : undefined}
          />
          <FieldError message={state.fieldErrors.full_name} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_phone">{t.phone}</Label>
          <Input
            id="contact_phone"
            name="phone"
            type="tel"
            required
            maxLength={20}
            autoComplete="tel"
            dir="ltr"
            className="text-start"
            defaultValue={phone ?? ""}
            aria-invalid={state.fieldErrors.phone ? true : undefined}
          />
          <FieldError message={state.fieldErrors.phone} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_city">{t.city}</Label>
          <Input
            id="contact_city"
            name="city"
            maxLength={120}
            autoComplete="address-level2"
            defaultValue={city ?? ""}
            aria-invalid={state.fieldErrors.city ? true : undefined}
          />
          <FieldError message={state.fieldErrors.city} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t.email}</span>
          <span
            dir="ltr"
            className="flex h-9 items-center truncate rounded-md border border-dashed bg-surface-soft px-3 text-start text-sm text-muted-foreground"
          >
            {email}
          </span>
          <p className="text-xs text-muted-foreground">{t.emailHint}</p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.workTypes}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {JOB_TYPES.map((value) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="work_types"
                value={value}
                defaultChecked={preferences.work_types.includes(value)}
                className="size-4 accent-primary"
              />
              {ar.jobs.typeLabels[value]}
            </label>
          ))}
        </div>
        <FieldError message={state.fieldErrors.work_types} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.relocate}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
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
                defaultChecked={relocate === value}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        {state.ok && !pending && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-success">
            <CircleCheck className="size-4" aria-hidden />
            {t.saved}
          </span>
        )}
      </div>
    </form>
  );
}
