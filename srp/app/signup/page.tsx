import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { getUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Briefcase className="size-5 text-primary" aria-hidden />
        <span>{ar.common.appName}</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{ar.auth.signupTitle}</CardTitle>
          <CardDescription>{ar.auth.signupSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </div>
  );
}
