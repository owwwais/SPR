"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitKeepingValues } from "@/components/seeker/onboarding/submit-keeping-values";
import { saveSeekerConsents, type SeekerFormState } from "@/lib/seeker-actions";
import { ar } from "@/lib/i18n/ar";

const initialState: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

export type ConsentDefaults = {
  consentPublic: boolean;
  consentOffers: boolean;
  noindex: boolean;
};

// Step four: two separate, optional consents. A new profile has given
// neither, so both start unchecked; a linked legacy profile starts from the
// choices its owner already made, so finishing onboarding never silently
// unpublishes a page they had shared. Neither implies the other — plenty of
// people want a page to share and no attention from companies, or the
// reverse — and leaving both empty is a complete, valid answer. The "hide
// from search engines" option belongs to the public page, so it appears only
// with it.
export function ConsentsStep({
  redirectTo,
  defaults,
}: {
  redirectTo: string;
  defaults: ConsentDefaults;
}) {
  const t = ar.seekerOnboarding.consents;
  const [state, formAction, pending] = useActionState(saveSeekerConsents, initialState);
  const [consentPublic, setConsentPublic] = useState(defaults.consentPublic);

  return (
    <form
      action={formAction}
      onSubmit={submitKeepingValues(formAction)}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="redirect_to" value={redirectTo} />

      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="consent_public"
              checked={consentPublic}
              onChange={(event) => setConsentPublic(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-primary"
              aria-describedby="consent_public-hint"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">{t.publicLabel}</span>
              <span id="consent_public-hint" className="text-sm text-muted-foreground">
                {t.publicHint}
              </span>
            </span>
          </label>

          {consentPublic && (
            <label className="ms-7 flex cursor-pointer items-center gap-3 border-t pt-3 text-sm">
              <input
                type="checkbox"
                name="noindex"
                defaultChecked={defaults.noindex}
                className="size-4 shrink-0 accent-primary"
              />
              {t.noindex}
            </label>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4">
          <input
            type="checkbox"
            name="consent_offers"
            defaultChecked={defaults.consentOffers}
            className="mt-1 size-4 shrink-0 accent-primary"
            aria-describedby="consent_offers-hint"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{t.offersLabel}</span>
            <span id="consent_offers-hint" className="text-sm text-muted-foreground">
              {t.offersHint}
            </span>
          </span>
        </label>
      </div>

      <Button type="submit" size="lg" disabled={pending} className="sm:w-fit sm:self-end">
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
