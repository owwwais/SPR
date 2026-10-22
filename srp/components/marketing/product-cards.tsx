"use client";

import { Clock, Sparkles } from "lucide-react";
import CardSwap, { Card } from "@/components/react-bits/CardSwap";
import { ar } from "@/lib/i18n/ar";

// Three real screens of the product, cycling in a React Bits CardSwap deck:
// the scored applicant, the interview task a candidate receives, and the
// explained recommendations a seeker sees. Illustrations — the caption under
// the deck says so (DESIGN.md §11: no numbers presented as fact).
function SoonBadge() {
  return (
    <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-[0.7rem] font-medium text-warning">
      {ar.landing.soon}
    </span>
  );
}

function ScoreCard() {
  const c = ar.landing.cards.score;
  return (
    <Card className="bg-card">
      <div className="flex h-full flex-col gap-4 p-6 text-start">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{c.title}</span>
            <span className="text-xs text-muted-foreground">{c.job}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl font-bold text-success tabular-nums">
              {c.score}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
        <ul className="flex flex-col gap-2.5">
          {c.breakdown.map((row) => (
            <li key={row.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs">
                <span>{row.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.value}/{row.max}
                </span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(row.value / row.max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        <span className="mt-auto w-fit rounded-sm bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-foreground">
          {ar.common.advisory}
        </span>
      </div>
    </Card>
  );
}

function InterviewCard() {
  const c = ar.landing.cards.interview;
  return (
    <Card className="bg-card">
      <div className="flex h-full flex-col gap-4 p-6 text-start">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{c.title}</span>
          <SoonBadge />
        </div>
        <span className="font-display text-2xl font-bold">{c.job}</span>
        <ul className="flex flex-wrap gap-2">
          {c.meta.map((item) => (
            <li
              key={item}
              className="rounded-sm border bg-surface-soft px-2 py-1 text-xs text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4 text-primary" aria-hidden />
          {c.remaining}
        </span>
        <span className="mt-auto flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
          {c.cta}
        </span>
      </div>
    </Card>
  );
}

function JobsCard() {
  const c = ar.landing.cards.jobs;
  return (
    <Card className="bg-card">
      <div className="flex h-full flex-col gap-3 p-6 text-start">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{c.title}</span>
          <SoonBadge />
        </div>
        <ul className="flex flex-col divide-y">
          {c.items.map((job) => (
            <li key={job.title} className="flex flex-col gap-1 py-2.5">
              <span className="text-sm font-semibold">{job.title}</span>
              <span className="text-xs text-muted-foreground">{job.meta}</span>
              <span className="flex w-fit items-center gap-1 rounded-sm bg-primary-soft px-1.5 py-0.5 text-[0.7rem] font-medium text-primary-soft-foreground">
                <Sparkles className="size-3" aria-hidden />
                {job.reason}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function ProductCards() {
  return (
    <CardSwap
      ariaLabel={ar.landing.cardsLabel}
      width={400}
      height={330}
      cardDistance={-46}
      verticalDistance={52}
      depth={80}
      skewAmount={-4}
      visibleCards={3}
      delay={4800}
      theme="light"
      cardRadius={14}
    >
      <ScoreCard />
      <InterviewCard />
      <JobsCard />
    </CardSwap>
  );
}
