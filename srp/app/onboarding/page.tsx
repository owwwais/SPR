import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";
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
  title: ar.onboarding.title,
};

// A Google sign-in arrives with the person's name; offering it saves typing.
// Display only — the name is submitted and validated like any other input,
// and nothing about tenancy is ever read from user_metadata (D12).
function googleName(metadata: Record<string, unknown> | undefined): string {
  const value = metadata?.full_name ?? metadata?.name;
  return typeof value === "string" ? value.slice(0, 120) : "";
}

// The one page that renders for a signed-in user with no membership yet.
export default async function OnboardingPage() {
  const user = await requireUser();
  // Already has a workspace: nothing to set up.
  if (await getSession()) redirect("/admin");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div>
        <BrandMark />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ar.onboarding.title}</CardTitle>
          <CardDescription>{ar.onboarding.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            rootDomain={process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null}
            defaultFullName={googleName(user.user_metadata)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
