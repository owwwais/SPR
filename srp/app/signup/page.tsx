import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.signupTitle,
};

export default async function SignupPage() {
  // Already signed in: the next unfinished step is naming the company, and
  // requireMembership() forwards on from there if that is done too.
  if (await getUser()) redirect("/onboarding");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Link href="/">
        <BrandMark />
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{ar.auth.signupTitle}</CardTitle>
          <CardDescription>{ar.auth.signupSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* A Google account arrives with a verified email, so nothing paid
              ever runs for an unproven address (D26). */}
          <GoogleButton />
          <AuthDivider />
          <SignupForm />
        </CardContent>
      </Card>
    </div>
  );
}
