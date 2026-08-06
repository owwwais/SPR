import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { getSession, requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.onboarding.title,
};

// The one page that renders for a signed-in user with no membership yet.
export default async function OnboardingPage() {
  await requireUser();
  // Already has a workspace: nothing to set up.
  if (await getSession()) redirect("/admin");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="flex items-center gap-2 font-semibold">
        <Briefcase className="size-5 text-primary" aria-hidden />
        <span>{ar.common.appName}</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ar.onboarding.title}</CardTitle>
          <CardDescription>{ar.onboarding.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
