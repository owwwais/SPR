import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AnalysisRefresher } from "@/components/seeker/portal/analysis-refresher";
import { AnalysisBadge, fileTypeLabel } from "@/components/seeker/portal/badges";
import { ContactForm } from "@/components/seeker/portal/contact-form";
import { CvUploadForm } from "@/components/seeker/portal/cv-upload-form";
import { ExtractedProfile } from "@/components/seeker/portal/extracted-profile";
import { FactsForm } from "@/components/seeker/portal/facts-form";
import { analysisReference, requireSeeker } from "@/lib/seeker";
import { formatDate } from "@/lib/format";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.seekerPortal.profile.title,
};

// The seeker's own record: what a company receives when they apply with it
// (contact details and the CV version they pick), what the analysis read
// from the current CV, and the versions kept (at most 3 — each application
// copies one specific version, D27).
//
// Everything here comes from talent_my_profile(), which resolves the caller
// from auth.uid() and never returns a storage path or a hash: the page can
// list versions but cannot hand anyone a file.
export default async function SeekerProfilePage() {
  const { profile } = await requireSeeker({ next: "/me/profile" });
  const t = ar.seekerPortal.profile;

  const analysisRunning =
    profile.analysis_status === "pending" ||
    profile.analysis_status === "processing";
  const analysisDone = profile.analysis_status === "done";
  // An earlier completed analysis is enough to edit facts and to show the
  // extraction: while a newer CV is being read the profile still holds the
  // previous one (talent_save_my_review applies the same rule).
  const analysisReady =
    analysisDone || profile.cv_versions.some((v) => v.analysis_status === "done");
  const published = profile.status === "published";
  const reference = analysisReference(profile.analysis_error);

  return (
    <>
      <AnalysisRefresher active={analysisRunning} />

      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      {analysisRunning && (
        <Alert variant="info">
          <Loader2 className="motion-safe:animate-spin" aria-hidden />
          <AlertDescription>{t.analysisRunning}</AlertDescription>
        </Alert>
      )}
      {profile.analysis_status === "failed" && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{t.analysisFailedTitle}</AlertTitle>
          <AlertDescription className="flex flex-col gap-1.5">
            {t.analysisFailedBody}
            {/* The trace reference only: it is what support searches the
                logs for, and carries no personal data. The message after it
                is the SDK's English text and stays in the logs. */}
            {reference && (
              <code
                dir="ltr"
                className="block select-all break-all rounded-sm bg-surface px-2 py-1 text-start font-mono text-xs text-foreground"
              >
                {reference}
              </code>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* ----------------------------- contact ----------------------------- */}
          <section
            aria-labelledby="contact-title"
            className="flex flex-col gap-4 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 id="contact-title" className="text-base font-semibold">
                {t.contactTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{t.contactHint}</p>
            </div>
            <ContactForm
              email={profile.email}
              fullName={profile.full_name}
              phone={profile.phone}
              city={profile.city}
              preferences={profile.preferences}
            />
          </section>

          {/* ------------------------ what we extracted ------------------------ */}
          <section
            aria-labelledby="facts-title"
            className="flex flex-col gap-4 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 id="facts-title" className="text-base font-semibold">
                {t.factsTitle}
              </h2>
              <p className="max-w-[68ch] text-sm text-muted-foreground">
                {t.factsHint}
              </p>
            </div>
            {/* Keyed by the analysis state so a finished analysis replaces
                the form's initial values (headline and years may have just
                been filled in from the CV) instead of keeping stale ones. */}
            <FactsForm
              key={`${profile.analysis_status}-${profile.cv_versions[0]?.id ?? "none"}`}
              locked={!analysisReady}
              fullName={profile.full_name}
              city={profile.city}
              headline={profile.headline}
              years={profile.years_experience}
              about={profile.about}
              skills={profile.skills}
              hiddenSkills={profile.hidden_skills}
            />
            {analysisReady && (
              <div className="border-t pt-5">
                <ExtractedProfile profile={profile} />
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* ---------------------------- CV versions ---------------------------- */}
          <section
            aria-labelledby="cv-title"
            className="flex flex-col gap-4 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 id="cv-title" className="text-base font-semibold">
                {t.cvTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{t.cvHint}</p>
            </div>

            {profile.cv_versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.noVersions}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {profile.cv_versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {fileTypeLabel(version.mime)}
                          {version.is_current && (
                            <Badge variant="default">{t.current}</Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t.uploadedAt.replace(
                            "{date}",
                            formatDate(version.created_at)
                          )}
                        </span>
                      </div>
                    </div>
                    <AnalysisBadge status={version.analysis_status} />
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t pt-4">
              <CvUploadForm />
            </div>
          </section>

          {/* ---------------------------- public page ---------------------------- */}
          <section
            aria-labelledby="public-title"
            className="flex flex-col gap-3 rounded-xl border bg-card p-5"
          >
            <h2 id="public-title" className="text-base font-semibold">
              {t.publicPageTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {published ? t.publicPageOn : t.publicPageOff}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {published && (
                <Link
                  href={`/t/${profile.public_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t.openPublicPage}
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              )}
              <Link
                href="/me/settings"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t.manageConsents}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
