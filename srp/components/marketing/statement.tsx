"use client";

import ScrollReveal from "@/components/react-bits/ScrollReveal";
import { ar } from "@/lib/i18n/ar";

// The opening statement, revealed word by word as it scrolls through the
// viewport (React Bits ScrollReveal, scrubbed). Words only, never letters
// (DESIGN.md A1); readable as plain text when motion is reduced.
export function Statement() {
  return (
    <ScrollReveal
      baseOpacity={0.12}
      enableBlur
      blurStrength={6}
      containerClassName="my-0"
      textClassName="font-display text-[clamp(2rem,4.6vw,4rem)] leading-[1.35] font-semibold text-balance"
      wordAnimationEnd="center center"
    >
      {ar.landing.statement}
    </ScrollReveal>
  );
}
