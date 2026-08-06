import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.landing.heroTitle,
  description: ar.meta.description,
};

// The root is the product's marketing page (S6). Applicant-facing browsing
// moved to /jobs, and a single company's careers page to /c/{slug}. Nothing
// here reads the database, so it prerenders as static.
export default function LandingPage() {
  const t = ar.landing;

  return (
    <>
      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pt-20 pb-14 text-center sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          {t.trustLine}
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {t.heroTitle}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          {t.heroSubtitle}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            {t.ctaPrimary}
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/jobs" />}
          >
            {t.ctaSecondary}
          </Button>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-16">
          <h2 className="text-center text-2xl font-bold">{t.problemTitle}</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {t.problems.map((problem) => (
              <div
                key={problem.title}
                className="flex flex-col gap-2 rounded-lg border bg-card p-6"
              >
                <h3 className="font-semibold">{problem.title}</h3>
                <p className="text-sm text-muted-foreground">{problem.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — a real sequence, so the numbering carries meaning */}
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-16">
        <h2 className="text-center text-2xl font-bold">{t.howTitle}</h2>
        <ol className="grid gap-8 sm:grid-cols-3">
          {t.how.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
                {index + 1}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Fairness — the section that actually differentiates the product */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Scale className="size-3.5" aria-hidden />
              {ar.common.advisory}
            </span>
            <h2 className="text-2xl font-bold text-balance">
              {t.fairnessTitle}
            </h2>
            <p className="text-muted-foreground">{t.fairnessBody}</p>
            <ul className="flex flex-wrap gap-2">
              {t.fairnessIgnored.map((item) => (
                <li
                  key={item}
                  className="rounded-md border bg-background px-2.5 py-1 text-sm text-muted-foreground line-through decoration-destructive/60"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t.fairnessNote}</p>
            <Link
              href="/fairness"
              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t.fairnessLink}
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </div>

          {/* A concrete specimen of what "a score with its justification"
              looks like, rather than a claim that one exists. */}
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {ar.evaluation.fitScore}
              </span>
              <span className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums text-emerald-600">
                  82
                </span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                {ar.evaluation.strengths}
              </p>
              <p className="flex gap-2 text-sm">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
                خبرة أربع سنوات في React و TypeScript موثّقة بثلاثة مشاريع
                إنتاجية مذكورة في السيرة.
              </p>
              <p className="flex gap-2 text-sm">
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
                قاد فريقاً من ثلاثة مطوّرين، وهو ما تطلبه الوظيفة صراحةً.
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                {ar.evaluation.gaps}
              </p>
              <p className="text-sm text-muted-foreground">
                لا تذكر السيرة خبرة في Next.js، وهي من المهارات المفضَّلة في
                الوصف الوظيفي.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-16">
        <h2 className="text-center text-2xl font-bold">{t.featuresTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-2 rounded-lg border p-5"
            >
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Marketplace — the two-sided loop a global competitor cannot offer */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
          <Building2 className="size-8 text-primary" aria-hidden />
          <h2 className="text-2xl font-bold">{t.marketplaceTitle}</h2>
          <p className="text-muted-foreground">{t.marketplaceBody}</p>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/companies" />}
          >
            {t.marketplaceCta}
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16">
        <h2 className="text-center text-2xl font-bold">{t.faqTitle}</h2>
        <div className="flex flex-col gap-3">
          {t.faq.map((item) => (
            <details
              key={item.q}
              className="rounded-lg border bg-card px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-medium marker:content-none">
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="border-t">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-20 text-center">
          <ShieldCheck className="size-8 text-primary" aria-hidden />
          <h2 className="text-2xl font-bold text-balance">{t.finalCtaTitle}</h2>
          <p className="text-muted-foreground">{t.finalCtaBody}</p>
          <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
            {t.ctaPrimary}
          </Button>
        </div>
      </section>
    </>
  );
}
