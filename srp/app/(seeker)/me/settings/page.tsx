import type { Metadata } from "next";
import { ConsentsForm } from "@/components/seeker/portal/consents-form";
import { DeleteSeekerData } from "@/components/seeker/portal/delete-seeker-data";
import { PublicLink } from "@/components/seeker/portal/public-link";
import Link from "next/link";
import { getHats, requireSeeker } from "@/lib/seeker";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.seekerPortal.settings.title,
};

// Consents and the seeker's right to leave. Both consents are the person's
// to give and to withdraw at any time (D26); deletion is immediate and
// total for the seeker's own data, and leaves applications already sent
// with the companies that received them (D27).
export default async function SeekerSettingsPage() {
  const { profile, email } = await requireSeeker({ next: "/me/settings" });
  const hats = await getHats();
  const t = ar.seekerPortal.settings;
  const published = profile.status === "published";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{t.title}</h1>
        <p className="max-w-[68ch] text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="flex max-w-3xl flex-col gap-6">
        {/* ------------------------------ account ------------------------------ */}
        <section
          aria-labelledby="account-title"
          className="flex flex-col gap-3 rounded-xl border bg-card p-5"
        >
          <h2 id="account-title" className="text-base font-semibold">
            {t.accountTitle}
          </h2>
          <dl className="flex flex-col gap-1 text-sm">
            <dt className="text-muted-foreground">{t.email}</dt>
            <dd dir="ltr" className="text-start font-medium">
              {email}
            </dd>
          </dl>
          {/* One account may also represent a company (D26). */}
          {!hats.company && (
            <p className="border-t pt-3 text-sm text-muted-foreground">
              {t.companyHint}{" "}
              <Link href="/onboarding?as=company" className="font-medium text-primary hover:underline">
                {t.companyCta}
              </Link>
            </p>
          )}
        </section>

        {/* ------------------------------ consents ------------------------------ */}
        <section
          aria-labelledby="consents-title"
          className="flex flex-col gap-4 rounded-xl border bg-card p-5"
        >
          <div className="flex flex-col gap-1">
            <h2 id="consents-title" className="text-base font-semibold">
              {t.consentsTitle}
            </h2>
            <p className="max-w-[68ch] text-sm text-muted-foreground">
              {t.consentsHint}
            </p>
          </div>
          <ConsentsForm
            consentPublic={profile.consent_public}
            consentOffers={profile.consent_offers}
            noindex={profile.noindex}
            analysisDone={
              profile.analysis_status === "done" ||
              profile.cv_versions.some((v) => v.analysis_status === "done")
            }
          />
          {published && (
            <div className="border-t pt-4">
              <PublicLink path={`/t/${profile.public_token}`} siteUrl={siteUrl} />
            </div>
          )}
        </section>

        {/* ---------------------------- danger zone ---------------------------- */}
        <section
          aria-labelledby="danger-title"
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-card p-5"
        >
          <h2 id="danger-title" className="text-base font-semibold text-destructive">
            {t.dangerTitle}
          </h2>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{t.deleteTitle}</h3>
            <p className="max-w-[68ch] text-sm text-muted-foreground">
              {t.deleteBody}
            </p>
          </div>
          <DeleteSeekerData />
        </section>
      </div>
    </>
  );
}
