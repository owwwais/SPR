import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DecisionStory } from "@/components/marketing/decision-story";
import { FeaturesBento } from "@/components/marketing/features-bento";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { InterviewShowcase } from "@/components/marketing/interview-showcase";
import { SmoothScroll } from "@/components/marketing/smooth-scroll";
import { Statement } from "@/components/marketing/statement";
import { StrikeList } from "@/components/marketing/strike-list";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.landing.heroTitle,
  description: ar.meta.description,
};

// The marketing page (P3, docs/PLATFORM-V3-PLAN.md §4.3). Static: nothing
// here reads the database. Motion lives in small client islands — GSAP
// ScrollTrigger and React Bits components — and Lenis smooths the scroll
// on this page only (D29). Every island renders its content without
// JavaScript and honours prefers-reduced-motion (DESIGN.md A10).
export default function LandingPage() {
  const t = ar.landing;

  return (
    <>
      <SmoothScroll />

      <Hero />

      {/* Statement + the three problems, editorial rather than three cards */}
      <section className="mx-auto flex max-w-6xl flex-col gap-20 px-4 py-28 sm:px-6 sm:py-36">
        <Statement />
        <div className="flex flex-col gap-10">
          <h2 className="text-base font-medium text-primary">{t.problemTitle}</h2>
          <ol className="grid gap-10 border-t pt-10 md:grid-cols-3 md:gap-12">
            {t.problems.map((problem, index) => (
              <li key={problem.title} className="flex flex-col gap-3">
                <span className="font-display text-sm font-semibold text-muted-foreground tabular-nums">
                  0{index + 1}
                </span>
                <h3 className="text-xl font-semibold sm:text-2xl">{problem.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {problem.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <DecisionStory />

      {/* Product */}
      <section className="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-28 sm:px-6 xl:px-10 sm:py-36">
        <div className="flex max-w-3xl flex-col gap-5">
          <p className="text-base font-medium text-primary">{t.featuresEyebrow}</p>
          <h2 className="font-display text-4xl leading-[1.2] font-bold text-balance sm:text-5xl lg:text-6xl">
            {t.featuresTitle}
          </h2>
          <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t.featuresSubtitle}
          </p>
        </div>
        <FeaturesBento />
      </section>

      {/* Virtual interview — coming */}
      <section className="border-y bg-surface-soft/40">
        <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 xl:px-10 sm:py-36">
          <InterviewShowcase />
        </div>
      </section>

      {/* Fairness — what actually differentiates the product */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-28 sm:px-6 xl:px-10 sm:py-36 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div className="flex flex-col gap-6">
          <p className="text-base font-medium text-primary">{t.fairnessEyebrow}</p>
          <h2 className="font-display text-5xl leading-[1.15] font-bold sm:text-6xl lg:text-7xl">
            {t.fairnessTitle}
          </h2>
        </div>
        <div className="flex flex-col gap-7">
          <p className="text-lg leading-relaxed text-muted-foreground sm:text-xl">{t.fairnessBody}</p>
          <StrikeList />
          <p className="text-base text-muted-foreground">{t.fairnessNote}</p>
          <Link
            href="/fairness"
            className="inline-flex w-fit items-center gap-1.5 text-base font-medium text-primary hover:underline"
          >
            {t.fairnessLink}
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Job seekers — cards stack with CSS sticky, which Lenis leaves native */}
      <section className="border-t bg-surface-soft/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-28 sm:px-6 xl:px-10 sm:py-36 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="flex flex-col gap-6 lg:sticky lg:top-32 lg:self-start">
            <p className="text-base font-medium text-primary">{t.seekers.eyebrow}</p>
            <h2 className="font-display text-4xl leading-[1.2] font-bold text-balance sm:text-5xl">
              {t.seekers.title}
            </h2>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-fit px-6 text-base"
              nativeButton={false}
              render={<Link href="/talent" />}
            >
              {t.seekers.cta}
            </Button>
          </div>
          <ol className="flex flex-col gap-6 lg:pb-[30vh]">
            {t.seekers.steps.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-col gap-4 rounded-2xl border bg-card p-8 shadow-raised lg:sticky"
                style={{ top: `${7 + index * 1.75}rem` }}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-display text-sm font-semibold text-primary tabular-nums">
                    0{index + 1}
                  </span>
                  {step.soon && (
                    <span className="rounded-sm bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                      {t.soon}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-2xl font-semibold sm:text-3xl">{step.title}</h3>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Marketplace */}
      <section className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-16 sm:px-6 xl:px-10 md:flex-row md:items-center">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="text-2xl font-semibold sm:text-3xl">{t.marketplaceTitle}</h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t.marketplaceBody}
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-6 text-base"
            nativeButton={false}
            render={<Link href="/companies" />}
          >
            {t.marketplaceCta}
          </Button>
        </div>
      </section>

      {/* FAQ — a readable two-column list instead of an accordion */}
      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-28 sm:px-6">
          <h2 className="font-display text-4xl font-bold sm:text-5xl">{t.faqTitle}</h2>
          <dl className="grid gap-x-16 gap-y-12 md:grid-cols-2">
            {t.faq.map((item) => (
              <div key={item.q} className="flex flex-col gap-3">
                <dt className="text-lg font-semibold sm:text-xl">{item.q}</dt>
                <dd className="text-base leading-relaxed text-muted-foreground sm:text-lg">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t bg-surface-soft/40">
        <div className="mx-auto max-w-5xl px-4 py-28 sm:px-6 sm:py-40">
          <FinalCta />
        </div>
      </section>
    </>
  );
}
