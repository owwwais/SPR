import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.pricing.title,
  description: ar.pricing.subtitle,
};

// D19: seats plus a monthly analysis quota. The plans are presented here but
// not yet ENFORCED — quota checking lives inside analyze-application and
// arrives with billing in S5 (D16). Until then these are the published terms,
// and the numbers live in lib/i18n/ar.ts so marketing copy and the future
// `plans` table cannot drift apart silently.
export default function PricingPage() {
  const t = ar.pricing;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-16">
      <header className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t.title}</h1>
        <p className="max-w-2xl text-muted-foreground">{t.subtitle}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-4 sm:grid-cols-2">
        {t.plans.map((plan) => {
          const highlighted = plan.code === "growth";
          return (
            <div
              key={plan.code}
              className={`flex flex-col gap-5 rounded-xl border p-6 ${
                highlighted
                  ? "border-primary bg-card shadow-sm"
                  : "bg-card"
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{plan.name}</h2>
                  {highlighted && (
                    <Badge className="shrink-0">{t.mostPopular}</Badge>
                  )}
                </div>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tabular-nums">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="text-sm text-muted-foreground">
                      {plan.code === "trial" ? plan.period : t.perMonth}
                    </span>
                  )}
                </p>
              </div>

              <ul className="flex flex-1 flex-col gap-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={highlighted ? "default" : "outline"}
                nativeButton={false}
                render={
                  <Link
                    href={plan.code === "enterprise" ? "/#contact" : "/signup"}
                  />
                }
              >
                {plan.code === "enterprise" ? t.ctaContact : t.cta}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">{t.note}</p>
    </section>
  );
}
