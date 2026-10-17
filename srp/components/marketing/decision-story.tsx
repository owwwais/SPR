"use client";

import { useRef } from "react";
import { CheckCircle2, FileText, Scale } from "lucide-react";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { fromStart } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

// "From a CV to a decision" — the page's signature moment (PLATFORM-V3-PLAN
// §4.3). On wide screens with motion allowed, the scene pins and a scrubbed
// GSAP timeline walks through four panels: the CV arrives, facts are
// extracted, the rubric fills and adds up, and the decision is handed to a
// person. Everywhere else the same four steps render as a static stack, so
// nothing depends on the animation to be understood (DESIGN.md A10).

const s = ar.landing.story;
const score = ar.landing.cards.score;

function Panel({ index, animated }: { index: number; animated: boolean }) {
  if (index === 0) {
    return (
      <div className="flex h-full flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-md bg-destructive-soft text-destructive">
            <FileText className="size-5" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{s.cvLabel}</span>
            <span className="text-xs text-muted-foreground" dir="ltr">
              {s.cvFile}
            </span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 rounded-lg border bg-surface-soft/60 p-5" aria-hidden>
          <span className="h-3 w-2/5 rounded-sm bg-foreground/15 blur-[3px]" />
          <span className="h-2 w-1/3 rounded-sm bg-foreground/10" />
          <span className="mt-3 h-2 w-full rounded-sm bg-foreground/8" />
          <span className="h-2 w-11/12 rounded-sm bg-foreground/8" />
          <span className="h-2 w-4/5 rounded-sm bg-foreground/8" />
          <span className="mt-3 h-2 w-full rounded-sm bg-foreground/8" />
          <span className="h-2 w-3/4 rounded-sm bg-foreground/8" />
          <span className="h-2 w-5/6 rounded-sm bg-foreground/8" />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <ul className="flex h-full flex-wrap content-center gap-3">
        {s.facts.map((fact) => (
          <li
            key={fact}
            data-fact
            className="flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-base font-medium"
          >
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            {fact}
          </li>
        ))}
      </ul>
    );
  }

  if (index === 2) {
    return (
      <div className="flex h-full flex-col justify-center gap-5">
        <ul className="flex flex-col gap-3.5">
          {score.breakdown.map((row) => (
            <li key={row.label} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm">
                <span>{row.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.value}/{row.max}
                </span>
              </div>
              <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  data-bar
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${(row.value / row.max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t pt-4">
          <span className="text-sm text-muted-foreground">{s.total}</span>
          <span className="flex items-baseline gap-1.5">
            <span data-total className="font-display text-5xl font-bold text-success tabular-nums">
              {animated ? 0 : score.score}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <ul className="flex flex-col gap-3">
        {s.strengths.map((line) => (
          <li key={line} className="flex gap-2.5 text-base leading-relaxed">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-success" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      <div className="flex gap-3" aria-hidden>
        <span className="flex h-11 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
          {s.invite}
        </span>
        <span className="flex h-11 flex-1 items-center justify-center rounded-md border bg-card text-sm font-medium">
          {s.decline}
        </span>
      </div>
      <p className="flex items-center gap-2 text-sm font-medium text-primary">
        <Scale className="size-4" aria-hidden />
        {s.decisionNote}
      </p>
    </div>
  );
}

function StepText({ index, className }: { index: number; className?: string }) {
  const step = s.steps[index]!;
  return (
    <div className={cn("flex gap-5", className)}>
      <span className="font-display text-sm font-semibold text-primary tabular-nums">
        0{index + 1}
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-2xl font-semibold lg:text-3xl">{step.title}</h3>
        <p className="max-w-[42ch] text-base leading-relaxed text-muted-foreground lg:text-lg">
          {step.body}
        </p>
      </div>
    </div>
  );
}

export function DecisionStory() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(`(min-width: 1024px) and ${MOTION_OK}`, () => {
        const panels = gsap.utils.toArray<HTMLElement>("[data-panel]");
        const steps = gsap.utils.toArray<HTMLElement>("[data-step]");
        const facts = gsap.utils.toArray<HTMLElement>("[data-pinned] [data-fact]");
        const bars = gsap.utils.toArray<HTMLElement>("[data-pinned] [data-bar]");
        const total = root.current?.querySelector<HTMLElement>("[data-pinned] [data-total]");
        const rail = root.current?.querySelector<HTMLElement>("[data-rail]");
        // Bars grow from the reading start edge (A4).
        const origin = fromStart(1) > 0 ? "right center" : "left center";
        const counter = { value: 0 };

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut", duration: 1 },
          scrollTrigger: {
            trigger: "[data-pinned]",
            start: "top top",
            end: "+=320%",
            pin: true,
            scrub: 0.7,
            anticipatePin: 1,
          },
        });

        const advance = (from: number, to: number) => {
          tl.to(panels[from]!, { autoAlpha: 0, y: -32 })
            .fromTo(panels[to]!, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0 }, "<")
            .to(steps[from]!, { opacity: 0.28 }, "<")
            .to(steps[to]!, { opacity: 1 }, "<");
        };

        advance(0, 1);
        tl.from(facts, { opacity: 0, y: 18, stagger: 0.12, duration: 0.6 }, "<0.3");
        advance(1, 2);
        tl.from(bars, { scaleX: 0, transformOrigin: origin, stagger: 0.1, duration: 0.8 }, "<0.2");
        if (total) {
          tl.to(
            counter,
            {
              value: score.score,
              duration: 1,
              ease: "none",
              onUpdate: () => {
                total.textContent = String(Math.round(counter.value));
              },
            },
            "<"
          );
        }
        advance(2, 3);
        tl.to({}, { duration: 0.6 }); // hold on the decision before releasing
        if (rail) tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, ease: "none", duration: tl.duration() }, 0);
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <section ref={root} aria-labelledby="story-title" className="border-y bg-surface-soft/40">
      {/* Pinned scene: wide screens, motion allowed. */}
      <div data-pinned className="hidden lg:motion-safe:block">
        {/* pt-16 clears the sticky header, so the scene centres in what is visible. */}
        <div className="mx-auto grid h-dvh max-w-7xl grid-cols-[1fr_1.05fr] items-center gap-20 px-6 pt-16 xl:px-10">
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <p className="text-base font-medium text-primary">{s.eyebrow}</p>
              <h2 id="story-title" className="font-display text-5xl font-bold xl:text-6xl">
                {s.title}
              </h2>
            </div>
            <div className="relative flex flex-col gap-8 ps-6">
              <span className="absolute inset-y-0 start-0 w-px bg-border" aria-hidden />
              <span
                data-rail
                className="absolute inset-y-0 start-0 w-px origin-top bg-primary"
                aria-hidden
              />
              {s.steps.map((step, index) => (
                <div key={step.title} data-step className={index === 0 ? "" : "opacity-30"}>
                  <StepText index={index} />
                </div>
              ))}
            </div>
          </div>
          <div className="relative aspect-[5/4] rounded-2xl border bg-card p-9 shadow-raised">
            {s.steps.map((step, index) => (
              <div
                key={step.title}
                data-panel
                className={cn("absolute inset-9", index === 0 ? "" : "invisible opacity-0")}
              >
                <Panel index={index} animated />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Static story: phones, tablets, and reduced motion. */}
      <div className="mx-auto flex max-w-3xl flex-col gap-14 px-4 py-24 sm:px-6 lg:motion-safe:hidden">
        <div className="flex flex-col gap-4">
          <p className="text-base font-medium text-primary">{s.eyebrow}</p>
          <h2 className="font-display text-4xl font-bold sm:text-5xl">{s.title}</h2>
        </div>
        {s.steps.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-6">
            <StepText index={index} />
            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <Panel index={index} animated={false} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
