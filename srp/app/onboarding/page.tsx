import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, FileUp } from "lucide-react";
import Link from "next/link";
import { getSession, requireUser } from "@/lib/auth";
import { getHats } from "@/lib/seeker";
import { OnboardingForm } from "./onboarding-form";
import { googleName } from "./google-name";
import { AudienceTabs } from "@/components/seeker/onboarding/audience-tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.seekerOnboarding.chooser.metaTitle,
};

// Where every signed-in user without a more specific destination lands —
// after a password sign-in, a Google round trip, or an email confirmation —
// and where requireMembership() sends a member-less visitor to /admin. It
// routes by the rows the user has, never by what they clicked at signup
// (D26):
//
//   a workspace         -> /admin
//   a seeker profile    -> /me, or the next onboarding step
//   neither             -> a chooser: the organization form, or the CV-first
//                          seeker onboarding
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const user = await requireUser();
  const [session, hats] = await Promise.all([getSession(), getHats()]);

  // The company check is the same getSession() that requireMembership()
  // uses, rather than the my_hats() hint: the two can only disagree if a
  // membership exists without a profile row, and then /admin would send the
  // user straight back here.
  if (session) redirect("/admin");

  const { as } = await searchParams;
  // A seeker who explicitly asks for the organization form gets it: one
  // account may wear both hats (D26), and without this a seeker could only
  // ever join a company by invitation. Anything else routes them home.
  const seekerAddingCompany = hats.seeker && as === "company";
  if (hats.seeker && !seekerAddingCompany) {
    redirect(hats.seekerStep === "done" ? "/me" : "/onboarding/seeker");
  }

  const tab = as === "seeker" ? "seeker" : "company";
  const t = ar.seekerOnboarding.chooser;

  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16"
    >
      <BrandMark />
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* A seeker adding a company has nothing to choose: the page is
            the organization form, so it is titled as one. */}
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold">
            {seekerAddingCompany ? ar.onboarding.title : t.title}
          </h1>
          <p className="text-muted-foreground">
            {seekerAddingCompany ? ar.onboarding.subtitle : t.subtitle}
          </p>
        </div>

        {!seekerAddingCompany && <AudienceTabs
          label={ar.auth.tabs.label}
          tabs={[
            {
              href: "/onboarding?as=seeker",
              label: ar.auth.tabs.seeker,
              active: tab === "seeker",
            },
            {
              href: "/onboarding?as=company",
              label: ar.auth.tabs.company,
              active: tab === "company",
            },
          ]}
        />}

        {tab === "company" ? (
          <Card>
            {!seekerAddingCompany && (
              <CardHeader>
                <CardTitle>{ar.onboarding.title}</CardTitle>
                <CardDescription>{ar.onboarding.subtitle}</CardDescription>
              </CardHeader>
            )}
            <CardContent>
              <OnboardingForm
                rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null}
                defaultFullName={googleName(user.user_metadata)}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <span className="mb-2 flex size-10 items-center justify-center rounded-md bg-surface-soft">
                <FileUp className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
              </span>
              <CardTitle>{t.seekerTitle}</CardTitle>
              <CardDescription className="leading-7">{t.seekerBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="lg"
                className="w-full"
                nativeButton={false}
                render={<Link href="/onboarding/seeker" />}
              >
                {t.seekerCta}
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
