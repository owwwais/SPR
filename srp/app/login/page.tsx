import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.loginTitle,
};

export default async function LoginPage() {
  const profile = await getProfile();
  if (profile) redirect("/admin");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Briefcase className="size-5 text-primary" aria-hidden />
        <span>{ar.common.appName}</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>{ar.auth.loginTitle}</CardTitle>
          <CardDescription>{ar.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
