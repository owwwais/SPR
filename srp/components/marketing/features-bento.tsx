"use client";

import {
  BarChart3,
  EyeOff,
  FileCheck2,
  Globe2,
  ListOrdered,
  MessagesSquare,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import AnimatedContent from "@/components/react-bits/AnimatedContent";
import SpotlightCard from "@/components/react-bits/SpotlightCard";
import { scoreBandClass } from "@/components/admin/score-badge";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

// An asymmetric bento (taste-skill: no row of three equal cards) of React
// Bits SpotlightCards: a teal light follows the pointer across a quiet canvas
// card. The lead card shows the ranked list itself rather than describing it.
const ICONS: LucideIcon[] = [MessagesSquare, FileCheck2, EyeOff, Globe2, BarChart3, Users, Timer];
// Grid placement: two cards beside the lead, then 3 + 2 below.
const SPANS = [
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-2",
  "lg:col-span-3",
  "lg:col-span-3",
];

const SPOTLIGHT = {
  theme: "light" as const,
  spotlightColor: "#0D7268",
  intensity: 0.5,
  borderGlow: 0.9,
  spotlightSize: 320,
  style: {
    "--spotlight-card-surface": "var(--card)",
    "--spotlight-card-border": "var(--border)",
    "--spotlight-card-shadow": "none",
  } as React.CSSProperties,
};

function Icon({ icon: IconComponent }: { icon: LucideIcon }) {
  return (
    <span className="flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground">
      <IconComponent className="size-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

export function FeaturesBento() {
  const t = ar.landing;
  const lead = t.featureLead;

  return (
    <AnimatedContent
      stagger={0.07}
      distance={40}
      duration={0.9}
      className="grid gap-4 lg:grid-cols-6 lg:grid-rows-[auto_auto]"
    >
      <SpotlightCard {...SPOTLIGHT} className="rounded-2xl p-7 sm:p-9 lg:col-span-4 lg:row-span-2">
        <div className="flex h-full flex-col gap-6">
          <Icon icon={ListOrdered} />
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-2xl font-semibold sm:text-3xl">{lead.title}</h3>
            <p className="max-w-[48ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {lead.body}
            </p>
          </div>
          <ol className="mt-auto flex flex-col divide-y rounded-xl border bg-surface-soft/50">
            {lead.rows.map((row, index) => (
              <li key={row.name} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-sm text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="text-base font-medium">{row.name}</span>
                <span
                  className={cn(
                    "ms-auto rounded-sm px-2 py-0.5 text-sm font-bold tabular-nums",
                    scoreBandClass(row.score)
                  )}
                >
                  {row.score}
                </span>
              </li>
            ))}
          </ol>
          <span className="text-xs text-muted-foreground">{t.example}</span>
        </div>
      </SpotlightCard>

      {t.features.map((feature, index) => (
        <SpotlightCard
          key={feature.title}
          {...SPOTLIGHT}
          className={cn("rounded-2xl p-7", SPANS[index])}
        >
          <div className="flex h-full flex-col gap-4">
            <Icon icon={ICONS[index]!} />
            <h3 className="text-lg font-semibold sm:text-xl">{feature.title}</h3>
            <p className="text-base leading-relaxed text-muted-foreground">{feature.body}</p>
          </div>
        </SpotlightCard>
      ))}
    </AnimatedContent>
  );
}
