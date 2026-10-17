import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  EyeOff,
  FileCheck2,
  FileText,
  History,
  ListChecks,
  MessageSquareText,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

const m = ar.seekerOnboarding.marketing;

export const metadata: Metadata = {
  title: m.metaTitle,
  description: m.metaDescription,
  openGraph: {
    type: "website",
    locale: "ar_SA",
    title: m.metaTitle,
    description: m.metaDescription,
  },
};

// Signing in from this page means "take me to my seeker side": an existing
// seeker lands on /me (the onboarding forwards there when it is complete), and
// a company user who wants a seeker profile too starts its onboarding.
const SIGN_IN_HREF = `/login?next=${encodeURIComponent("/onboarding/seeker")}`;
const SIGN_UP_HREF = "/signup?as=seeker";

// The seekers' front door. It used to be the accountless upload form; seeker
// accounts superseded that flow (D26), so this page now explains the account
// and sends people to signup on the seeker tab. Old accountless profiles keep
// their own pages (/t/[token], /talent/review|manage/[token]).
//
// Static and light on purpose: no motion libraries, so nothing here costs a
// visitor more than the words. Every claim is a fact of the product as built
// (DESIGN.md §11).
export default function TalentLandingPage() {
  const benefitIcons = [FileCheck2, ListChecks, History];
  const promiseIcons = [UserCheck, EyeOff, MessageSquareText, Trash2];

  return (
    <main className="flex flex-col">
      {/* ---------------------------- hero ---------------------------- */}
      <section className="border-b bg-surface-soft/40">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <p className="text-sm font-medium text-primary sm:text-base">{m.eyebrow}</p>
            <h1 className="font-display text-4xl leading-[1.25] font-bold text-balance sm:text-5xl lg:text-6xl">
              {m.title}
            </h1>
            <p className="max-w-[52ch] text-lg leading-8 text-muted-foreground">
              {m.subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button
                size="lg"
                className="h-12 px-6 text-base"
                nativeButton={false}
                render={<Link href={SIGN_UP_HREF} />}
              >
                {m.cta}
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              <p className="text-sm text-muted-foreground">
                {m.haveAccount}{" "}
                <Link href={SIGN_IN_HREF} className="font-medium text-primary hover:underline">
                  {m.signIn}
                </Link>
              </p>
            </div>
          </div>

          <ApplyScene />
        </div>
      </section>

      {/* ---------------------------- steps ---------------------------- */}
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <p className="text-sm font-medium text-primary">{m.stepsEyebrow}</p>
          <h2 className="font-display text-3xl leading-[1.3] font-bold text-balance sm:text-4xl">
            {m.stepsTitle}
          </h2>
        </div>
        <ol className="flex flex-col divide-y border-y">
          {m.steps.map((step, index) => (
            <li key={step.title} className="flex gap-5 py-6">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft font-bold text-primary-soft-foreground tabular-nums">
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="leading-7 text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* -------------------------- benefits --------------------------
          Heading on the other side this time: marketing sections alternate
          rather than all starting at the same edge (DESIGN.md §5). */}
      <section className="border-y bg-surface-soft/40">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <h2 className="font-display text-3xl leading-[1.3] font-bold text-balance sm:text-4xl lg:order-last lg:sticky lg:top-24 lg:self-start">
            {m.benefitsTitle}
          </h2>
          <ul className="flex flex-col gap-8">
            {m.benefits.map((benefit, index) => {
              const Icon = benefitIcons[index] ?? Check;
              return (
                <li key={benefit.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card">
                    <Icon className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold">{benefit.title}</h3>
                    <p className="max-w-[60ch] leading-7 text-muted-foreground">{benefit.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* -------------------------- promises --------------------------
          Given deliberate prominence: these are why someone would trust the
          platform with their name, phone and CV. */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h2 className="mb-10 font-display text-3xl leading-[1.3] font-bold sm:text-4xl">
          {m.promisesTitle}
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {m.promises.map((promise, index) => {
            const Icon = promiseIcons[index] ?? Check;
            return (
              <div
                key={promise.title}
                className="flex gap-4 rounded-lg border-s-2 border-primary bg-surface-soft/60 p-5"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">{promise.title}</h3>
                  <p className="text-sm leading-7 text-muted-foreground">{promise.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------- closing --------------------------- */}
      <section className="border-t bg-surface-soft/40">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-20 sm:pb-24">
          <h2 className="font-display text-3xl leading-[1.3] font-bold sm:text-4xl">
            {m.closingTitle}
          </h2>
          <Button
            size="lg"
            className="h-12 px-6 text-base"
            nativeButton={false}
            render={<Link href={SIGN_UP_HREF} />}
          >
            {m.cta}
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
          {/* Employers arriving here by mistake get the right door rather
              than a dead end. */}
          <p className="text-sm text-muted-foreground">
            {m.forCompanies}{" "}
            <Link href="/signup?as=company" className="font-medium text-primary hover:underline">
              {m.forCompaniesCta}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

// A product scene rendered in code (DESIGN.md §8): the apply-with-your-
// profile panel, which is the account's whole point in one picture. It is an
// illustration, so it is hidden from assistive technology and nothing in it
// is interactive.
function ApplyScene() {
  const s = m.scene;
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md select-none lg:mx-0">
      <div className="absolute -inset-4 -z-10 rounded-2xl border border-dashed border-hairline-strong/0 bg-surface-sunken/50" />
      <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-raised">
        <p className="text-sm font-semibold">{s.jobLabel}</p>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{s.cvLabel}</span>
          <div className="flex items-center gap-3 rounded-md border border-input px-3 py-2.5">
            <FileText className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
            <span className="text-sm">{s.cvValue}</span>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-md bg-primary-soft p-3 text-primary-soft-foreground">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs bg-primary text-primary-foreground">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="text-sm leading-6">{s.consent}</span>
        </div>

        <div className="flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
          {s.submit}
        </div>
      </div>
    </div>
  );
}
