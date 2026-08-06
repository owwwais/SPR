"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { createOrganization, type OnboardingState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/lib/i18n/ar";

const initialState: OnboardingState = { error: null, fieldErrors: {} };

// Arabic company names cannot be a URL slug, so the field is not
// auto-derived from the name — it is asked for directly, with a live preview
// of the careers URL it produces.
function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function OnboardingForm({ rootDomain }: { rootDomain: string | null }) {
  const [state, formAction, pending] = useActionState(
    createOrganization,
    initialState
  );
  const [slug, setSlug] = useState("");
  const t = ar.onboarding;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="full_name">{t.fullName}</Label>
        <Input id="full_name" name="full_name" required maxLength={120} />
        {state.fieldErrors.full_name && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.full_name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t.companyName}</Label>
        <Input id="name" name="name" required maxLength={200} />
        {state.fieldErrors.name && (
          <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">{t.slug}</Label>
        <Input
          id="slug"
          name="slug"
          required
          dir="ltr"
          className="text-start"
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
          placeholder="my-company"
        />
        <p className="text-xs text-muted-foreground">
          {t.slugHint}{" "}
          <span dir="ltr" className="font-mono">
            {rootDomain ? `${rootDomain}/c/` : "/c/"}
            {slug || "…"}
          </span>
        </p>
        {state.fieldErrors.slug && (
          <p className="text-xs text-destructive">{state.fieldErrors.slug}</p>
        )}
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t.creating : t.submit}
      </Button>
    </form>
  );
}
