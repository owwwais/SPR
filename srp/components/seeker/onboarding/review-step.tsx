"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/seeker/onboarding/field-error";
import { submitKeepingValues } from "@/components/seeker/onboarding/submit-keeping-values";
import { saveSeekerReview, type SeekerFormState } from "@/lib/seeker-actions";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";
import type { SeekerProfile } from "@/lib/seeker";

const initialState: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

const ABOUT_MAX = 300;

export type ReviewProfile = Pick<
  SeekerProfile,
  | "full_name"
  | "headline"
  | "city"
  | "years_experience"
  | "about"
  | "skills"
  | "hidden_skills"
  | "strengths"
  | "focus_areas"
>;

// Step three: what the analysis extracted, with the editability line of the
// talent design (§2) drawn in the UI as well as in the database:
//
//   Facts the person owns  -> freely editable. We guessed them; they know.
//   Our reading of the CV  -> hideable, never editable, never extendable.
//
// Hiding only reduces what we claim, which is always safe; adding would turn
// the profile into self-declaration and remove the reason a company would
// trust it. talent_save_my_review enforces the same by keeping only skill
// ids the analysis found.
export function ReviewStep({ profile }: { profile: ReviewProfile }) {
  const t = ar.seekerOnboarding.review;
  const [state, formAction, pending] = useActionState(saveSeekerReview, initialState);
  const [hidden, setHidden] = useState<string[]>(profile.hidden_skills);
  const [aboutLength, setAboutLength] = useState((profile.about ?? "").length);
  const errors = state.fieldErrors;

  const toggle = (id: string) =>
    setHidden((prev) =>
      prev.includes(id) ? prev.filter((skill) => skill !== id) : [...prev, id]
    );

  return (
    <form
      action={formAction}
      onSubmit={submitKeepingValues(formAction)}
      className="flex flex-col gap-8"
    >
      {hidden.map((id) => (
        <input key={id} type="hidden" name="hidden_skills" value={id} />
      ))}

      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* ---------------- facts they own ---------------- */}
      <section className="flex flex-col gap-4" aria-labelledby="facts-title">
        <div className="flex flex-col gap-1">
          <h3 id="facts-title" className="font-semibold">
            {t.factsTitle}
          </h3>
          <p className="text-sm text-muted-foreground">{t.factsHint}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="full_name">{t.fullName}</Label>
            <Input
              id="full_name"
              name="full_name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={profile.full_name ?? ""}
              aria-invalid={errors.full_name ? true : undefined}
              aria-describedby={errors.full_name ? "full_name-error" : undefined}
            />
            <FieldError id="full_name-error" message={errors.full_name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="headline">{t.headline}</Label>
            <Input
              id="headline"
              name="headline"
              maxLength={160}
              defaultValue={profile.headline ?? ""}
              aria-invalid={errors.headline ? true : undefined}
              aria-describedby={errors.headline ? "headline-error" : undefined}
            />
            <FieldError id="headline-error" message={errors.headline} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="city">{t.city}</Label>
            <Input
              id="city"
              name="city"
              maxLength={120}
              defaultValue={profile.city ?? ""}
              aria-invalid={errors.city ? true : undefined}
              aria-describedby={errors.city ? "city-error" : undefined}
            />
            <FieldError id="city-error" message={errors.city} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="years_experience">{t.years}</Label>
            <Input
              id="years_experience"
              name="years_experience"
              type="number"
              inputMode="decimal"
              min={0}
              max={60}
              // One decimal, like the column (numeric(4,1)): the analysis
              // may store 3.7, and a coarser step would make the browser
              // refuse to submit the value it was given.
              step="0.1"
              dir="ltr"
              className="text-start tabular-nums"
              defaultValue={profile.years_experience ?? ""}
              aria-invalid={errors.years_experience ? true : undefined}
              aria-describedby={
                errors.years_experience ? "years_experience-error" : undefined
              }
            />
            <FieldError id="years_experience-error" message={errors.years_experience} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="about">{t.about}</Label>
          <Textarea
            id="about"
            name="about"
            rows={3}
            maxLength={ABOUT_MAX}
            defaultValue={profile.about ?? ""}
            onChange={(event) => setAboutLength(event.target.value.length)}
            aria-invalid={errors.about ? true : undefined}
            aria-describedby={errors.about ? "about-error about-hint" : "about-hint"}
          />
          <p id="about-hint" className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{t.aboutHint}</span>
            <span dir="ltr" className="tabular-nums">
              {aboutLength}/{ABOUT_MAX}
            </span>
          </p>
          <FieldError id="about-error" message={errors.about} />
        </div>
      </section>

      {/* ---------------- our reading of the CV ---------------- */}
      <section className="flex flex-col gap-5 border-t pt-6" aria-labelledby="analysis-title">
        <div className="flex flex-col gap-1">
          <h3 id="analysis-title" className="font-semibold">
            {t.analysisTitle}
          </h3>
          <p className="text-sm text-muted-foreground">{t.analysisHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t.skills}</span>
          {profile.skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noSkills}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => {
                const isHidden = hidden.includes(skill.id);
                return (
                  <li key={skill.id}>
                    <button
                      type="button"
                      onClick={() => toggle(skill.id)}
                      aria-pressed={!isHidden}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/35",
                        isHidden
                          ? "border-dashed border-input text-muted-foreground line-through"
                          : "border-input bg-card hover:bg-surface-soft"
                      )}
                    >
                      {skill.label}
                      <span className="sr-only">
                        {isHidden ? `(${t.show})` : `(${t.hide})`}
                      </span>
                      {/* The icon shows the state, as on /me/profile
                          (facts-form): open eye shown, crossed eye hidden. */}
                      {isHidden ? (
                        <EyeOff className="size-3.5 text-muted-foreground" aria-hidden />
                      ) : (
                        <Eye className="size-3.5 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {profile.focus_areas.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t.focusAreas}</span>
            <ul className="flex flex-wrap gap-2">
              {profile.focus_areas.map((area, index) => (
                <li key={index}>
                  <Badge variant="secondary">{area}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {profile.strengths.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t.strengths}</span>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm leading-7 text-body">
              {profile.strengths.map((strength, index) => (
                <li key={index}>{strength}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Button type="submit" size="lg" disabled={pending} className="sm:w-fit sm:self-end">
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
