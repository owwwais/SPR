"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CircleCheck, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/seeker/portal/field-error";
import { keepValuesSubmit } from "@/components/seeker/portal/keep-values-submit";
import { saveSeekerReview, type SeekerFormState } from "@/lib/seeker-actions";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

const initial: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

// The editability line of the talent design (§2), kept here as in
// onboarding:
//
//   Facts the person owns  -> editable. We guessed them; they know them.
//   Our analysis           -> hideable, never editable, never extendable.
//
// talent_save_my_review takes the name and city as well; they are edited in
// the contact form above, so this form carries their saved values unchanged
// rather than showing the same two fields twice.
export function FactsForm({
  locked,
  fullName,
  city,
  headline,
  years,
  about,
  skills,
  hiddenSkills,
}: {
  locked: boolean;
  fullName: string | null;
  city: string | null;
  headline: string | null;
  years: number | null;
  about: string | null;
  skills: { id: string; label: string }[];
  hiddenSkills: string[];
}) {
  const t = ar.seekerPortal.profile;
  const [state, dispatch, pending] = useActionState(saveSeekerReview, initial);
  const [hidden, setHidden] = useState<string[]>(hiddenSkills);

  const toggle = (id: string) =>
    setHidden((prev) =>
      prev.includes(id) ? prev.filter((skill) => skill !== id) : [...prev, id]
    );

  // Name and city errors belong to the contact form's fields; say them here
  // too, since this is the form that was just submitted.
  const carriedError = state.fieldErrors.full_name ?? state.fieldErrors.city;

  return (
    <form onSubmit={keepValuesSubmit(dispatch)} className="flex flex-col gap-5">
      <input type="hidden" name="full_name" value={fullName ?? ""} />
      <input type="hidden" name="city" value={city ?? ""} />
      {hidden.map((id) => (
        <input key={id} type="hidden" name="hidden_skills" value={id} />
      ))}

      {locked && (
        <Alert variant="info">
          <AlertCircle aria-hidden />
          <AlertDescription>{t.factsLocked}</AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>
            {state.error}
            {carriedError && ` — ${carriedError}`}
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={locked} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="flex flex-col gap-2">
            <Label htmlFor="facts_headline">{t.headline}</Label>
            <Input
              id="facts_headline"
              name="headline"
              maxLength={160}
              defaultValue={headline ?? ""}
              aria-invalid={state.fieldErrors.headline ? true : undefined}
            />
            <FieldError message={state.fieldErrors.headline} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="facts_years">{t.years}</Label>
            <Input
              id="facts_years"
              name="years_experience"
              type="number"
              inputMode="decimal"
              min={0}
              max={60}
              step="0.5"
              dir="ltr"
              className="text-start tabular-nums"
              defaultValue={years ?? ""}
              aria-invalid={state.fieldErrors.years_experience ? true : undefined}
            />
            <FieldError message={state.fieldErrors.years_experience} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="facts_about">{t.about}</Label>
          <Textarea
            id="facts_about"
            name="about"
            rows={3}
            maxLength={300}
            defaultValue={about ?? ""}
            aria-describedby="facts_about_hint"
            aria-invalid={state.fieldErrors.about ? true : undefined}
          />
          <p id="facts_about_hint" className="text-xs text-muted-foreground">
            {t.aboutHint}
          </p>
          <FieldError message={state.fieldErrors.about} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t.skillsTitle}</span>
          {skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noSkills}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t.skillsHint}</p>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => {
                  const isHidden = hidden.includes(skill.id);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggle(skill.id)}
                      aria-pressed={!isHidden}
                      title={isHidden ? t.show : t.hide}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs transition-colors duration-150 disabled:pointer-events-none disabled:opacity-60",
                        isHidden
                          ? "border-dashed text-muted-foreground line-through"
                          : "bg-card text-foreground hover:bg-surface-soft"
                      )}
                    >
                      {isHidden ? (
                        <EyeOff className="size-3.5" aria-hidden />
                      ) : (
                        <Eye className="size-3.5 text-muted-foreground" aria-hidden />
                      )}
                      {skill.label}
                      <span className="sr-only">
                        {isHidden ? t.show : t.hide}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || locked}>
            {pending ? t.saving : t.save}
          </Button>
          {state.ok && !pending && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-success">
              <CircleCheck className="size-4" aria-hidden />
              {t.saved}
            </span>
          )}
        </div>
      </fieldset>
    </form>
  );
}
