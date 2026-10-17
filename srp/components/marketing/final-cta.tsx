"use client";

import Link from "next/link";
import Magnet from "@/components/react-bits/Magnet";
import SplitText from "@/components/react-bits/SplitText";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

export function FinalCta() {
  const t = ar.landing;
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <SplitText
        tag="h2"
        text={t.finalCtaTitle}
        effect="rise"
        mask
        delay={90}
        textAlign="center"
        className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1.15] font-bold"
      />
      <p className="max-w-[40ch] text-lg text-muted-foreground sm:text-xl">{t.finalCtaBody}</p>
      <Magnet padding={80} magnetStrength={4}>
        <Button size="lg" className="h-14 px-9 text-lg" nativeButton={false} render={<Link href="/signup" />}>
          {t.ctaPrimary}
        </Button>
      </Magnet>
    </div>
  );
}
