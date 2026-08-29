"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { publishProfile, type PublishState } from "@/app/(talent)/talent/actions";
import type { ReviewProfile } from "@/app/(talent)/talent/review/[token]/page";
import { ar } from "@/lib/i18n/ar";

const initial: PublishState = { error: null };

// The editability line, enforced in the UI as well as the schema:
//
//   Facts the person owns  -> fully editable. We guessed them; they know them.
//   Our analysis           -> hideable, never editable and never extendable.
//
// Removing something only reduces what we claim, which is always safe. Adding
// would turn the page into self-declaration and destroy the reason a company
// would trust it at all.
export function ReviewForm({
  token,
  profile,
}: {
  token: string;
  profile: ReviewProfile;
}) {
  const t = ar.talent;
  const [state, formAction, pending] = useActionState(publishProfile, initial);
  const [hidden, setHidden] = useState<string[]>(profile.hidden_skills ?? []);
  const [consentPublic, setConsentPublic] = useState(profile.consent_public);

  const toggle = (id: string) =>
    setHidden((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="token" value={token} />
      {hidden.map((id) => (
        <input key={id} type="hidden" name="hidden_skills" value={id} />
      ))}

      {/* ---------------- facts they own ---------------- */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold">{t.factsTitle}</h2>
          <p className="text-xs text-muted-foreground">{t.factsHint}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="full_name">{ar.apply.fullName}</Label>
            <Input id="full_name" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={120} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="headline">{t.experience}</Label>
            <Input id="headline" name="headline" defaultValue={profile.headline ?? ""} maxLength={120} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="city">{ar.jobs.filterLocation}</Label>
            <Input id="city" name="city" defaultValue={profile.city ?? ""} maxLength={80} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="years_experience">{t.yearsUnit}</Label>
            <Input
              id="years_experience"
              name="years_experience"
              type="number"
              min={0}
              max={60}
              step="0.5"
              defaultValue={profile.years_experience ?? ""}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="about">{t.strengths}</Label>
          <Textarea id="about" name="about" maxLength={300} rows={3} defaultValue={profile.about ?? ""} />
        </div>
      </section>

      {/* ---------------- our analysis ---------------- */}
      <section className="flex flex-col gap-4 border-t pt-6">
        <div>
          <h2 className="text-sm font-semibold">{t.analysisTitle}</h2>
          <p className="text-xs text-muted-foreground">{t.analysisHint}</p>
        </div>

        {profile.skills.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">{t.skills}</span>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => {
                const isHidden = hidden.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={
                      isHidden
                        ? "rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground line-through"
                        : "rounded-full border px-3 py-1 text-xs"
                    }
                    aria-pressed={!isHidden}
                  >
                    {s.label}
                    <span className="ms-1 text-muted-foreground">
                      {isHidden ? `· ${t.show}` : `· ${t.hide}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {profile.focus_areas.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">{t.focusAreas}</span>
            <div className="flex flex-wrap gap-2">
              {profile.focus_areas.map((f, i) => (
                <Badge key={i} variant="secondary">{f}</Badge>
              ))}
            </div>
          </div>
        )}

        {profile.strengths.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">{t.strengths}</span>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
              {profile.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* ---------------- consent ---------------- */}
      <section className="flex flex-col gap-4 border-t pt-6">
        <h2 className="text-sm font-semibold">{t.consentTitle}</h2>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="consent_public"
            className="mt-1 size-4"
            checked={consentPublic}
            onChange={(e) => setConsentPublic(e.target.checked)}
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t.consentPublic}</span>
            <span className="text-xs text-muted-foreground">{t.consentPublicHint}</span>
          </span>
        </label>

        {/* Separate, and neither implies the other: plenty of people want a
            page to share and no mail from companies. */}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="consent_offers"
            className="mt-1 size-4"
            defaultChecked={profile.consent_offers}
          />
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t.consentOffers}</span>
            <span className="text-xs text-muted-foreground">{t.consentOffersHint}</span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="noindex"
            className="mt-1 size-4"
            defaultChecked={profile.noindex}
          />
          <span className="text-sm">{t.noindex}</span>
        </label>
      </section>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending || !consentPublic}>
        {pending ? t.publishing : t.publish}
      </Button>
    </form>
  );
}
