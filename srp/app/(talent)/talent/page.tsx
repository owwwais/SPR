import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  EyeOff,
  FileUp,
  Link2,
  MailCheck,
  RefreshCw,
  ScanLine,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadForm } from "@/components/talent/upload-form";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.talent.heroTitle,
  description: ar.talent.heroSubtitle,
  openGraph: {
    type: "website",
    locale: "ar_SA",
    title: ar.talent.heroTitle,
    description: ar.talent.heroSubtitle,
  },
};

// The entry point for the companion product.
//
// It explains the service before asking for a file — someone arriving cold
// has no idea what "upload your CV" buys them — but the form lives on this
// same page rather than behind a click. Scrolling is not a step, so the
// three-step journey the design document insists on stays three steps.
export default function TalentLandingPage() {
  const t = ar.talent;

  const whyIcons = [Link2, ScanLine, RefreshCw];
  const howIcons = [FileUp, MailCheck, Share2];
  const privacyIcons = [
    EyeOff,
    Sparkles,
    ShieldCheck,
    Trash2,
    SlidersHorizontal,
    Link2,
  ];

  return (
    <main className="flex flex-col">
      {/* ---------------------------- hero ---------------------------- */}
      <section className="border-b bg-muted/20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-16 text-center sm:py-24">
          <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
            {t.heroTitle}
          </h1>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">
            {t.heroSubtitle}
          </p>
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="#upload" />}
          >
            {t.heroCta}
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          <p className="text-xs text-muted-foreground">{t.heroNote}</p>
        </div>
      </section>

      {/* ---------------------------- why ---------------------------- */}
      <section className="mx-auto w-full max-w-4xl px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold">{t.whyTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {t.why.map((item, i) => {
            const Icon = whyIcons[i]!;
            return (
              <Card key={item.title}>
                <CardContent className="flex flex-col gap-2">
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {item.body}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ---------------------------- how ---------------------------- */}
      <section className="border-y bg-muted/20">
        <div className="mx-auto w-full max-w-4xl px-4 py-16">
          <h2 className="mb-8 text-center text-2xl font-bold">{t.howTitle}</h2>
          <ol className="grid gap-6 sm:grid-cols-3">
            {t.howSteps.map((step, i) => {
              const Icon = howIcons[i]!;
              return (
                <li key={step.title} className="flex flex-col items-center gap-3 text-center">
                  <span className="relative flex size-12 items-center justify-center rounded-full border bg-background">
                    <Icon className="size-5" aria-hidden />
                    <span className="absolute -top-1 -end-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* -------------------------- privacy --------------------------
          Given deliberate prominence: the promises here are what separate
          this from a CV dump, and they are the reason a talented person
          would trust it with their name. */}
      <section className="mx-auto w-full max-w-4xl px-4 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold">
          {t.privacyTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {t.privacy.map((item, i) => {
            const Icon = privacyIcons[i]!;
            return (
              <div key={item.title} className="flex gap-3 rounded-lg border p-4">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------------------- form ----------------------------
          On this page, not behind a click. */}
      <section id="upload" className="border-t bg-muted/20 scroll-mt-16">
        <div className="mx-auto w-full max-w-xl px-4 py-16">
          <h2 className="text-2xl font-bold">{t.uploadTitle}</h2>
          <p className="mb-8 mt-2 text-sm text-muted-foreground">
            {t.uploadSubtitle}
          </p>
          <UploadForm />
        </div>
      </section>

      {/* Employers arriving here by mistake get a way back rather than a
          dead end. */}
      <section className="mx-auto w-full max-w-4xl px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">{t.forCompanies}</p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          className="mt-3"
          render={<Link href="/jobs" />}
        >
          {t.forCompaniesCta}
        </Button>
      </section>
    </main>
  );
}
