import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SearchCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.track.title,
};

// Progressive lookup form: works without JS via a server-action redirect.
async function lookup(formData: FormData): Promise<void> {
  "use server";
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (code.length > 0 && code.length <= 40) {
    redirect(`/track/${encodeURIComponent(code)}`);
  }
  redirect("/track");
}

export default function TrackLookupPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader className="text-center">
          <SearchCheck
            className="mx-auto size-10 text-primary"
            aria-hidden
          />
          <CardTitle>{ar.track.title}</CardTitle>
          <CardDescription>{ar.track.lookupHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={lookup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">{ar.track.codeLabel}</Label>
              <Input
                id="code"
                name="code"
                required
                maxLength={40}
                dir="ltr"
                placeholder="SRP-XXXXXXXX"
                className="text-center font-mono uppercase"
              />
            </div>
            <Button type="submit">{ar.track.lookupSubmit}</Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
