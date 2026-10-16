import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeNext } from "@/lib/redirects";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.auth.loginTitle,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const session = await getSession();
  // Same-site paths only (lib/redirects.ts).
  const target = next ? safeNext(next, "") || null : null;
  if (session) redirect(target ?? "/admin");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <Link href="/">
        <BrandMark />
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{ar.auth.loginTitle}</CardTitle>
          <CardDescription>{ar.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {error === "oauth" && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden />
              <AlertDescription>{ar.auth.errors.oauth}</AlertDescription>
            </Alert>
          )}
          <GoogleButton next={target ?? undefined} />
          <AuthDivider />
          <LoginForm next={target ?? undefined} />
        </CardContent>
      </Card>
    </div>
  );
}
