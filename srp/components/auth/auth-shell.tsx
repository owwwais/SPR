import Link from "next/link";
import {
  CalendarDays,
  Check,
  CircleHelp,
  FileSearch,
  Globe,
  ListOrdered,
  Lock,
  MessageSquareText,
  Mic,
  Route,
  Scale,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  analysis: FileSearch,
  rank: ListOrdered,
  questions: MessageSquareText,
  interview: Mic,
  careers: Globe,
  calendar: CalendarDays,
  fairness: Scale,
  team: Users,
  upload: Upload,
  match: Sparkles,
  track: Route,
  privacy: Lock,
};

export type AuthAudience = "company" | "seeker" | "both";

// The sign-in and sign-up frame: the form on the start side, and on the
// other what the account opens — one real screen of the product (a labelled
// illustration, DESIGN.md §8/§11) and the full list of what it does. Phones
// get the form first and the list under it.
export function AuthShell({
  audience,
  children,
}: {
  audience: AuthAudience;
  children: React.ReactNode;
}) {
  const t = ar.authShowcase;

  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col bg-card px-5 py-5 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
          >
            <BrandMark />
          </Link>
          <Link href="/jobs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {t.browseJobs}
          </Link>
        </header>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <section aria-label={t.label} className="border-t py-6 lg:hidden">
          <FeatureList audience={audience} compact />
        </section>

        <footer className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">{t.legal.privacy}</Link>
          <Link href="/terms" className="hover:text-foreground">{t.legal.terms}</Link>
          <Link href="/fairness" className="hover:text-foreground">{t.legal.fairness}</Link>
        </footer>
      </div>

      <aside
        aria-label={t.label}
        className="hidden border-s bg-background lg:flex lg:flex-col lg:justify-center lg:gap-8 lg:px-12 lg:py-10 xl:px-16"
      >
        <div className="flex max-w-xl flex-col gap-3">
          <span className="text-sm font-medium text-primary">{t.eyebrow[audience]}</span>
          <h2 className="font-display text-3xl leading-tight font-bold text-balance xl:text-4xl">
            {audience === "seeker" ? t.titleSeeker : t.titleCompany}
          </h2>
          <p className="max-w-[60ch] text-body">
            {audience === "seeker" ? t.bodySeeker : t.bodyCompany}
          </p>
        </div>

        {audience === "seeker" ? <RecommendedJobs /> : <ScoredApplicant />}

        <FeatureList audience={audience} />
      </aside>
    </div>
  );
}

function FeatureList({ audience, compact = false }: { audience: AuthAudience; compact?: boolean }) {
  const t = ar.authShowcase;
  const groups =
    audience === "company"
      ? [{ heading: t.companyHeading, items: t.company }]
      : audience === "seeker"
        ? [{ heading: t.seekerHeading, items: t.seeker }]
        : [
            { heading: t.companyHeading, items: t.company },
            { heading: t.seekerHeading, items: t.seeker },
          ];

  return (
    <div className={cn("flex flex-col", compact ? "gap-5" : "gap-7")}>
      {groups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-3">
          {groups.length > 1 && (
            <h3 className="text-xs font-medium text-muted-foreground">{group.heading}</h3>
          )}
          <ul className={cn("grid gap-x-6 gap-y-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
            {group.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Check;
              return (
                <li key={item.text} className="flex items-start gap-2.5 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
                    <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="pt-1 text-body">
                    {item.text}
                    {item.soon && (
                      <span className="ms-1.5 rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">
                        {ar.landing.soon}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// What a seeker sees: jobs suggested with the reason for each, never a
// number (D28).
function RecommendedJobs() {
  const card = ar.landing.cards.jobs;
  return (
    <figure className="flex max-w-xl flex-col gap-2">
      <div className="flex flex-col rounded-xl border bg-card px-5 py-3">
        <span className="py-2 text-sm font-semibold">{card.title}</span>
        <ul className="flex flex-col divide-y">
          {card.items.map((job) => (
            <li key={job.title} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{job.title}</span>
                <span className="text-xs text-muted-foreground">{job.meta}</span>
              </span>
              <span className="flex items-center gap-1 rounded-sm bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary-soft-foreground">
                <Sparkles className="size-3" aria-hidden />
                {job.reason}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="text-xs text-muted-foreground">{ar.landing.example}</figcaption>
    </figure>
  );
}

// One applicant as HR sees them: the advisory score with its breakdown, the
// reasons in words, and the decision left to a person (D24). Static markup —
// nothing here animates on load.
function ScoredApplicant() {
  const card = ar.landing.cards.score;
  const s = ar.authShowcase.scene;

  return (
    <figure className="flex max-w-xl flex-col gap-2">
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{s.name}</span>
            <span className="text-xs text-muted-foreground">{card.job}</span>
          </div>
          <span className="flex items-baseline gap-1.5 rounded-sm bg-success-soft px-2.5 py-1 text-success">
            <span className="text-2xl font-bold tabular-nums">{card.score}</span>
            <span className="text-xs font-medium">{ar.common.advisory}</span>
          </span>
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
          {card.breakdown.slice(0, 3).map((row) => (
            <li key={row.label} className="flex flex-col gap-1">
              <span className="flex justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{row.label}</span>
                <bdi className="tabular-nums">
                  {row.value} {ar.billing.meter.of} {row.max}
                </bdi>
              </span>
              <span className="h-1.5 overflow-hidden rounded-sm bg-surface-sunken">
                <span
                  className="block h-full rounded-sm bg-primary"
                  style={{ width: `${(row.value / row.max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t pt-4 text-sm">
          <span className="text-xs font-medium text-muted-foreground">{s.why}</span>
          {s.strengths.map((line) => (
            <span key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {line}
            </span>
          ))}
          <span className="flex items-start gap-2">
            <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {s.probe}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs font-medium text-muted-foreground">{s.decide}</span>
          <span aria-hidden className="flex gap-2">
            <span className="flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              {s.interview}
            </span>
            <span className="flex h-8 items-center rounded-md border border-input bg-card px-3 text-sm">
              {s.decline}
            </span>
          </span>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">{ar.landing.example}</figcaption>
    </figure>
  );
}
