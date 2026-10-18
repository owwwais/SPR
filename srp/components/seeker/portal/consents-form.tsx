"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CircleCheck, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { keepValuesSubmit } from "@/components/seeker/portal/keep-values-submit";
import { saveSeekerConsents, type SeekerFormState } from "@/lib/seeker-actions";
import { ar } from "@/lib/i18n/ar";

const initial: SeekerFormState = { ok: false, error: null, fieldErrors: {} };

// The two consents of onboarding step four, editable for as long as the
// account exists. They stay separate and optional: neither implies the
// other, an unchecked box is a withdrawal, and withdrawing is always
// possible (talent_set_my_consents keeps each consent's original timestamp
// while it stands and clears it when withdrawn).
//
// A public page shows the analysis, so the database refuses to GRANT it
// while the newest CV is still being read — and refuses a save that keeps
// it granted, too. Rather than let the person press save into that refusal,
// the form says so up front: the box cannot be newly checked until the
// analysis is done, and a save that would keep it checked waits as well.
// Unchecking (withdrawal) is never blocked.
export function ConsentsForm({
  consentPublic,
  consentOffers,
  noindex,
  analysisDone,
}: {
  consentPublic: boolean;
  consentOffers: boolean;
  noindex: boolean;
  analysisDone: boolean;
}) {
  const t = ar.seekerPortal.settings;
  const [state, dispatch, pending] = useActionState(saveSeekerConsents, initial);
  const [publicChecked, setPublicChecked] = useState(consentPublic);
  const publicBlocked = !analysisDone && publicChecked;
  const router = useRouter();

  // The shared action revalidates the onboarding and profile pages, not
  // this one; the public-link panel beside the form depends on the saved
  // consent, so ask for a fresh render once a save lands.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form onSubmit={keepValuesSubmit(dispatch)} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex cursor-pointer items-start gap-3 has-disabled:cursor-not-allowed">
          <input
            type="checkbox"
            name="consent_public"
            checked={publicChecked}
            disabled={!analysisDone && !publicChecked}
            onChange={(event) => setPublicChecked(event.target.checked)}
            className="mt-1 size-4 shrink-0 accent-primary disabled:opacity-50"
            aria-describedby="settings-consent-public-hint"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{t.consentPublic}</span>
            <span
              id="settings-consent-public-hint"
              className="text-sm text-muted-foreground"
            >
              {t.consentPublicHint}
            </span>
          </span>
        </label>

        {/* Hiding from search engines belongs to the public page, so it is
            offered only with it; unchecked public consent sends noindex off. */}
        {publicChecked && (
          <label className="ms-7 flex cursor-pointer items-start gap-3 border-t pt-3">
            <input
              type="checkbox"
              name="noindex"
              defaultChecked={noindex}
              className="mt-1 size-4 shrink-0 accent-primary"
              aria-describedby="settings-noindex-hint"
            />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t.noindex}</span>
              <span id="settings-noindex-hint" className="text-sm text-muted-foreground">
                {t.noindexHint}
              </span>
            </span>
          </label>
        )}

        {!analysisDone && (
          <p className="flex items-start gap-2 border-t pt-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {t.consentPublicLocked}
          </p>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
        <input
          type="checkbox"
          name="consent_offers"
          defaultChecked={consentOffers}
          className="mt-1 size-4 shrink-0 accent-primary"
          aria-describedby="settings-consent-offers-hint"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">{t.consentOffers}</span>
          <span id="settings-consent-offers-hint" className="text-sm text-muted-foreground">
            {t.consentOffersHint}
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || publicBlocked}>
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
