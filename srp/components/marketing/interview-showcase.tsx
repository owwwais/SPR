"use client";

import { Check, Mic, Timer } from "lucide-react";
import AnimatedContent from "@/components/react-bits/AnimatedContent";
import { ar } from "@/lib/i18n/ar";

// The virtual interview (D30) — marked as coming, because it is. The mock
// room shows a question being answered while the seven evaluation steps
// tick in sequence (React Bits AnimatedContent, staggered), which is the
// "clear and transparent steps" promise made visible.
export function InterviewShowcase() {
  const t = ar.landing.interview;

  return (
    <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
      <div className="flex flex-col gap-7">
        <span className="w-fit rounded-sm bg-warning-soft px-2 py-1 text-sm font-medium text-warning">
          {ar.landing.soon}
        </span>
        <h2 className="font-display text-4xl leading-[1.2] font-bold text-balance sm:text-5xl">
          {t.title}
        </h2>
        <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">{t.body}</p>
        <ul className="flex flex-col gap-3.5">
          {t.points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-base sm:text-lg">
              <Check className="mt-1.5 size-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-raised sm:p-8">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t.progress}</span>
            <span className="flex items-center gap-1.5 tabular-nums" dir="ltr">
              <Timer className="size-4 text-primary" aria-hidden />
              {t.timer}
            </span>
          </div>
          <p className="font-display text-xl leading-relaxed font-semibold sm:text-2xl">{t.question}</p>
          <div className="flex items-start gap-3 rounded-lg border bg-surface-soft/60 p-4 text-base leading-relaxed text-body">
            <Mic className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <span>{t.answer}</span>
          </div>
          <AnimatedContent
            stagger={0.16}
            distance={14}
            duration={0.6}
            threshold={0.2}
            className="grid grid-cols-1 gap-2 border-t pt-5 sm:grid-cols-2"
          >
            {t.steps.map((step, index) => (
              <div key={step} className="flex items-center gap-2.5 text-sm sm:text-base">
                <span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                {step}
              </div>
            ))}
          </AnimatedContent>
        </div>
        <span className="text-center text-xs text-muted-foreground">{ar.landing.example}</span>
      </div>
    </div>
  );
}
