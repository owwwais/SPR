"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Check, ExternalLink } from "lucide-react";
import {
  updateBranding,
  type BrandingState,
} from "@/app/(dashboard)/admin/settings/branding-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ar } from "@/lib/i18n/ar";

const initialState: BrandingState = {
  saved: false,
  error: null,
  fieldErrors: {},
};

export type BrandingValues = {
  name: string;
  slug: string;
  about: string;
  website: string;
  industry: string;
  city: string;
  brandColor: string;
  listedPublicly: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function BrandingForm({
  values,
  rootDomain,
}: {
  values: BrandingValues;
  rootDomain: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateBranding,
    initialState
  );
  const t = ar.branding;

  // Controlled and re-synced after revalidation: an uncontrolled defaultValue
  // must not change after mount, and the displayed value would go stale.
  const [slug, setSlug] = useState(values.slug);
  const [prevSlug, setPrevSlug] = useState(values.slug);
  if (prevSlug !== values.slug) {
    setPrevSlug(values.slug);
    setSlug(values.slug);
  }

  const careersPath = `/c/${slug || "…"}`;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t.name}</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={200}
            defaultValue={values.name}
          />
          <FieldError message={state.fieldErrors.name} />
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
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-")
                  .replace(/-+/g, "-")
                  .slice(0, 40)
              )
            }
          />
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span dir="ltr" className="font-mono">
              {rootDomain ?? ""}
              {careersPath}
            </span>
            <a
              href={careersPath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {t.preview}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
          <FieldError message={state.fieldErrors.slug} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="industry">{t.industry}</Label>
          <Input
            id="industry"
            name="industry"
            maxLength={100}
            defaultValue={values.industry}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city">{t.city}</Label>
          <Input
            id="city"
            name="city"
            maxLength={100}
            defaultValue={values.city}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="website">{t.website}</Label>
          <Input
            id="website"
            name="website"
            type="url"
            dir="ltr"
            className="text-start"
            placeholder="https://example.com"
            maxLength={200}
            defaultValue={values.website}
          />
          <FieldError message={state.fieldErrors.website} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="brand_color">{t.color}</Label>
          <div className="flex items-center gap-2">
            <input
              id="brand_color"
              name="brand_color"
              type="color"
              defaultValue={values.brandColor || "#2383e2"}
              className="h-9 w-16 cursor-pointer rounded-md border bg-background p-1"
            />
            <span className="text-xs text-muted-foreground">
              {t.colorHint}
            </span>
          </div>
          <FieldError message={state.fieldErrors.brand_color} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="about">{t.about}</Label>
        <Textarea
          id="about"
          name="about"
          rows={5}
          maxLength={4000}
          defaultValue={values.about}
        />
        <p className="text-xs text-muted-foreground">{t.aboutHint}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="logo">{t.logo}</Label>
          {values.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={values.logoUrl}
              alt=""
              className="size-16 rounded-md border object-contain"
            />
          )}
          <Input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
          />
          <p className="text-xs text-muted-foreground">{t.imageHint}</p>
          <FieldError message={state.fieldErrors.logo} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="cover">{t.cover}</Label>
          {values.coverUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={values.coverUrl}
              alt=""
              className="h-16 w-full rounded-md border object-cover"
            />
          )}
          <Input
            id="cover"
            name="cover"
            type="file"
            accept="image/png,image/jpeg,image/webp"
          />
          <p className="text-xs text-muted-foreground">{t.imageHint}</p>
          <FieldError message={state.fieldErrors.cover} />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border p-4">
        <input
          type="checkbox"
          name="listed_publicly"
          defaultChecked={values.listedPublicly}
          className="mt-1 size-4 accent-primary"
        />
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.listed}</span>
          <span className="text-xs text-muted-foreground">
            {t.listedHint}
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
        {!pending && state.saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="size-4" aria-hidden />
            {t.saved}
          </span>
        )}
      </div>
    </form>
  );
}
