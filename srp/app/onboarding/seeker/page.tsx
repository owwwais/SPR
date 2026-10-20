import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Loader2, MailCheck } from "lucide-react";
import { getUser } from "@/lib/auth";
import {
  analysisFailedOnOurSide,
  analysisReference,
  getSeekerProfile,
  type SeekerProfile,
} from "@/lib/seeker";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { googleName } from "../google-name";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisChip } from "@/components/seeker/onboarding/analysis-chip";
import { AnalysisWatcher } from "@/components/seeker/onboarding/analysis-watcher";
import { ConsentsStep } from "@/components/seeker/onboarding/consents-step";
import { ContactStep } from "@/components/seeker/onboarding/contact-step";
import { LegacyChoice } from "@/components/seeker/onboarding/legacy-choice";
import { ReviewStep } from "@/components/seeker/onboarding/review-step";
import {
  StepIndicator,
  type IndicatorStep,
} from "@/components/seeker/onboarding/step-indicator";
import { UploadStep } from "@/components/seeker/onboarding/upload-step";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.seekerOnboarding.metaTitle,
};

// The CV-first seeker onboarding (plan §2.3, D26). One page that renders
// whichever step the profile has reached — talent.profiles.onboarding_step,
// advanced only by the database functions and talent-upload — so a refresh,
// a second device or a week away all resume at the same place.
//
//   cv        upload the CV; the analysis starts in the background
//   contact   phone, city, preferences — filled in while the CV is read
//   review    what was extracted: facts editable, analysis hide-only
//   consents  two separate, optional consents
//   done      -> /me
export default async function SeekerOnboardingPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/onboarding/seeker");

  const t = ar.seekerOnboarding;

  // D26: email verification precedes any paid analysis. talent-upload
  // refuses an unconfirmed address on its own; this only explains why.
  if (!user.email_confirmed_at) {
    return (
      <Shell step="cv">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
            <MailCheck className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-lg font-semibold">{t.unverified.title}</h2>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            {t.unverified.body}
          </p>
        </div>
      </Shell>
    );
  }

  const profile = await getSeekerProfile();

  if (!profile) {
    // The offer to link an accountless profile with the same verified
    // address. Asked of the database, which repeats every condition when
    // the link is actually made.
    const supabase = await createClient();
    const { data: legacyAvailable, error } = await supabase.rpc(
      "talent_legacy_profile_available"
    );
    if (error) console.error("talent_legacy_profile_available failed:", error.message);

    return (
      <Shell step="cv">
        {legacyAvailable === true ? <LegacyChoice /> : <UploadIntro />}
      </Shell>
    );
  }

  if (profile.onboarding_step === "done") redirect("/me");

  switch (profile.onboarding_step) {
    case "contact":
      return (
        <Shell step="contact">
          <StepHeading title={t.contact.title} body={t.contact.body} />
          <AnalysisChip status={profile.analysis_status} />
          <ContactStep
            defaults={{
              fullName: profile.full_name ?? googleName(user.user_metadata),
              phone: profile.phone ?? "",
              city: profile.city ?? "",
              workTypes: profile.preferences.work_types,
              relocate: profile.preferences.relocate,
            }}
          />
        </Shell>
      );
    case "review":
      return (
        <Shell step="review">
          <ReviewContent profile={profile} />
        </Shell>
      );
    case "consents":
      return (
        <Shell step="consents">
          <StepHeading title={t.consents.title} body={t.consents.body} />
          <ConsentsStep
            redirectTo="/me"
            defaults={{
              consentPublic: profile.consent_public,
              consentOffers: profile.consent_offers,
              noindex: profile.noindex,
            }}
          />
        </Shell>
      );
    default:
      // "cv": a profile exists but its first upload never completed.
      return (
        <Shell step="cv">
          <UploadIntro />
        </Shell>
      );
  }
}

function UploadIntro() {
  const t = ar.seekerOnboarding.upload;
  return (
    <>
      <StepHeading title={t.title} body={t.body} />
      <UploadStep />
    </>
  );
}

// The review step waits for the analysis: a self-refreshing state while it
// runs, the stored error (which carries the function's trace id) and a
// re-upload when it failed, and the review form once it is done.
function ReviewContent({ profile }: { profile: SeekerProfile }) {
  const t = ar.seekerOnboarding.review;

  if (profile.analysis_status === "pending" || profile.analysis_status === "processing") {
    // An analysis lost on the way (talent_my_profile's analysis_stale) will
    // never finish on its own; talent-upload accepts the same file again
    // after that window, so the upload is offered instead of a spinner.
    if (profile.analysis_stale) {
      return (
        <>
          <div className="flex gap-3 rounded-lg bg-warning-soft p-4 text-warning">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">{t.failedTitle}</h2>
              <p className="text-sm leading-7">{t.failedBodyOurs}</p>
            </div>
          </div>
          <UploadStep again />
        </>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
        <span className="flex size-10 items-center justify-center rounded-md bg-surface-soft">
          <Loader2
            className="size-5 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
        </span>
        <h2 className="text-lg font-semibold">{t.waitingTitle}</h2>
        <p className="max-w-sm text-sm leading-7 text-muted-foreground">{t.waitingBody}</p>
        <AnalysisWatcher active />
      </div>
    );
  }

  if (profile.analysis_status === "failed") {
    const reference = analysisReference(profile.analysis_error);
    return (
      <>
        <div className="flex gap-3 rounded-lg bg-warning-soft p-4 text-warning">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">{t.failedTitle}</h2>
            <p className="text-sm leading-7">
              {analysisFailedOnOurSide(profile.analysis_error) ? t.failedBodyOurs : t.failedBody}
            </p>
            {reference && (
              <p className="text-xs">
                {t.referenceLabel}:{" "}
                <span dir="ltr" className="font-mono break-all">
                  {reference}
                </span>
              </p>
            )}
          </div>
        </div>
        <UploadStep again />
      </>
    );
  }

  return (
    <>
      <StepHeading title={t.title} body={t.body} />
      <ReviewStep profile={profile} />
    </>
  );
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}

function Shell({ step, children }: { step: IndicatorStep; children: React.ReactNode }) {
  const t = ar.seekerOnboarding;
  return (
    <main id="main" className="flex flex-1 flex-col items-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/35">
            <BrandMark />
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md text-sm text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/35"
            >
              {t.signOut}
            </button>
          </form>
        </header>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
          <p className="leading-7 text-muted-foreground">{t.subtitle}</p>
        </div>

        <StepIndicator current={step} />

        <Card>
          <CardContent className="flex flex-col gap-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
