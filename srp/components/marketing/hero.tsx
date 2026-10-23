"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import AnimatedContent from "@/components/react-bits/AnimatedContent";
import DotGrid from "@/components/react-bits/DotGrid";
import Magnet from "@/components/react-bits/Magnet";
import { Button } from "@/components/ui/button";
import { HeroHeadline } from "./hero-headline";
import { ProductCards } from "./product-cards";
import { ar } from "@/lib/i18n/ar";

function enterDelay(seconds: number) {
  return { "--enter-delay": `${seconds}s` } as React.CSSProperties;
}

// The first screen. A React Bits DotGrid sits behind everything and answers
// the pointer in the brand teal; the headline rises word by word (CSS — see
// hero-headline.tsx for why not a script); Magnet pulls the primary button
// toward the pointer; the product itself cycles in a CardSwap deck.
export function Hero() {
  const t = ar.landing;

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <DotGrid
          dotSize={3.5}
          gap={24}
          baseColor="#CBD3DC"
          activeColor="#0D7268"
          proximity={150}
          glow={0.4}
          swell={0.9}
          shockStrength={3}
          fade={0.5}
        />
        {/* Canvas wash behind the copy so the dots never fight the text. */}
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_70%_45%,var(--background)_30%,transparent_80%)]" />
      </div>

      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 xl:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:py-12">
        <div className="flex flex-col gap-8">
          <p className="enter flex items-center gap-2.5 text-sm font-medium text-primary sm:text-base">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            {t.heroEyebrow}
          </p>

          <HeroHeadline lines={t.heroLines} />

          {/* Visible in the first frame, deliberately: this paragraph is the
              page's largest paint, and any entrance (JS or CSS) reports late
              while a slow phone's main thread is busy hydrating. */}
          <p className="max-w-[40ch] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t.heroSubtitle}
          </p>

          <div className="enter flex flex-wrap items-center gap-3" style={enterDelay(0.5)}>
            <Magnet padding={70} magnetStrength={5}>
              <Button
                size="lg"
                className="h-13 px-7 text-base"
                nativeButton={false}
                render={<Link href="/signup" />}
              >
                {t.ctaCompany}
              </Button>
            </Magnet>
            <Button
              size="lg"
              variant="outline"
              className="h-13 px-7 text-base"
              nativeButton={false}
              render={<Link href="/talent" />}
            >
              {t.ctaSeeker}
            </Button>
          </div>

          <div className="enter" style={enterDelay(0.65)}>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground sm:text-base">
              {t.heroProof.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-success" strokeWidth={2.25} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <AnimatedContent
          trigger="mount"
          delay={0.35}
          direction="horizontal"
          reverse
          distance={60}
          duration={1.2}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-full max-w-[34rem]">
            <ProductCards />
          </div>
          <span className="text-xs text-muted-foreground">{t.example}</span>
        </AnimatedContent>
      </div>
    </section>
  );
}
