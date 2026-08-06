import type { Metadata } from "next";
import { CircleAlert, Languages, Scale, TimerReset } from "lucide-react";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.fairness.title,
  description: ar.fairness.subtitle,
};

// D24: "no score without justification" and "the decision is always human"
// are product promises, not internal notes. Everything stated here is a rule
// enforced in supabase/functions/analyze-application/prompts.ts and in the
// schema — this page describes the system, it does not aspire on its behalf.
export default function FairnessPage() {
  const t = ar.fairness;

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-16">
      <header className="flex flex-col gap-4">
        <Scale className="size-8 text-primary" aria-hidden />
        <h1 className="text-3xl font-bold text-balance sm:text-4xl">
          {t.title}
        </h1>
        <p className="text-lg text-muted-foreground">{t.subtitle}</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">{t.promisesTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {t.promises.map((promise) => (
            <div
              key={promise.title}
              className="flex flex-col gap-2 rounded-lg border bg-card p-5"
            >
              <h3 className="font-semibold">{promise.title}</h3>
              <p className="text-sm text-muted-foreground">{promise.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">{t.ignoredTitle}</h2>
        <p className="text-muted-foreground">{t.ignoredBody}</p>
        <ul className="flex flex-wrap gap-2">
          {ar.landing.fairnessIgnored.map((item) => (
            <li
              key={item}
              className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground line-through decoration-destructive/60"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex gap-4 rounded-lg border-s-2 border-primary bg-muted/30 p-5">
          <TimerReset className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{t.gapsTitle}</h3>
            <p className="text-sm text-muted-foreground">{t.gapsBody}</p>
          </div>
        </div>

        <div className="flex gap-4 rounded-lg border-s-2 border-primary bg-muted/30 p-5">
          <Languages className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{t.languageTitle}</h3>
            <p className="text-sm text-muted-foreground">{t.languageBody}</p>
          </div>
        </div>

        <div className="flex gap-4 rounded-lg border-s-2 border-primary bg-muted/30 p-5">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{t.confidenceTitle}</h3>
            <p className="text-sm text-muted-foreground">
              {t.confidenceBody}
            </p>
          </div>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">{t.contactBody}</p>
    </article>
  );
}
