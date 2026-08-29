"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Turnstile } from "@/components/jobs/turnstile";
import { ar } from "@/lib/i18n/ar";

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/talent-upload`;

export function UploadForm() {
  const t = ar.talent;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center">
        <h2 className="font-semibold">{t.checkEmailTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.checkEmailBody}</p>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        body: new FormData(event.currentTarget),
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; field?: string };
      if (res.ok && body.ok) {
        setSent(true);
        return;
      }
      // Machine-readable codes on the wire, Arabic here (same split as the
      // recruitment form).
      const map: Record<string, string> = {
        rate_limited: t.errors.rateLimited,
        cv: t.errors.cvRequired,
        cv_type: t.errors.cvType,
        cv_size: t.errors.cvSize,
        email: t.errors.invalidEmail,
      };
      setError(map[body.field ?? ""] ?? map[body.error ?? ""] ?? t.errors.server);
    } catch {
      setError(t.errors.server);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cv">{t.cv}</Label>
        <Input
          id="cv"
          name="cv"
          type="file"
          required
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        />
        <p className="text-xs text-muted-foreground">{t.cvHint}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t.email}</Label>
        <Input id="email" name="email" type="email" required maxLength={200} />
        <p className="text-xs text-muted-foreground">{t.emailHint}</p>
      </div>

      <Turnstile siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
