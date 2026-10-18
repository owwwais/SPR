import type { Metadata } from "next";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmLegacyLink } from "@/components/seeker/onboarding/confirm-legacy-link";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.seekerOnboarding.legacy.confirmTitle,
};

// Where the emailed one-time link lands (0020, talent_issue_legacy_link).
// Opening it changes nothing: the link is completed only by the signed-in
// account pressing "confirm", so a mail scanner that fetches the URL — or a
// person who opens it in someone else's session — links nothing. The token
// is checked in the database, against the account that asked for it.
export default async function ConfirmLegacyLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Signed out (the email opened in a fresh browser): sign in, then come
  // straight back to this page rather than to the generic landing.
  if (!(await getUser())) {
    redirect(`/login?next=${encodeURIComponent(`/onboarding/seeker/link/${token}`)}`);
  }
  const t = ar.seekerOnboarding.legacy;
  const wellFormed = /^[0-9a-f]{32}$/.test(token);

  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16"
    >
      <BrandMark />
      <Card className="w-full max-w-md">
        <CardHeader>
          <span className="mb-2 flex size-10 items-center justify-center rounded-md bg-surface-soft">
            <Link2 className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
          </span>
          <CardTitle>{t.confirmTitle}</CardTitle>
          <CardDescription className="leading-7">
            {wellFormed ? t.confirmBody : ar.seekerOnboarding.errors.linkInvalid}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {wellFormed && <ConfirmLegacyLink token={token} />}
          <Link href="/onboarding/seeker" className="w-fit text-sm text-primary hover:underline">
            {t.back}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
