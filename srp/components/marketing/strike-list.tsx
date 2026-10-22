"use client";

import { useRef } from "react";
import { gsap, MOTION_OK, useGSAP } from "@/lib/gsap";
import { fromStart } from "@/lib/motion";
import { ar } from "@/lib/i18n/ar";

// What the evaluation ignores, struck through one by one as the list
// scrolls in. The line draws from the reading start edge (DESIGN.md A4);
// with reduced motion the strikes are simply there.
export function StrikeList() {
  const root = useRef<HTMLUListElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from("[data-strike]", {
          scaleX: 0,
          transformOrigin: fromStart(1) > 0 ? "right center" : "left center",
          duration: 0.5,
          ease: "power2.out",
          stagger: 0.12,
          scrollTrigger: { trigger: root.current, start: "top 75%", once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <ul ref={root} className="flex flex-wrap gap-3">
      {ar.landing.fairnessIgnored.map((item) => (
        <li
          key={item}
          className="relative rounded-md border bg-card px-4 py-2.5 text-base text-muted-foreground sm:text-lg"
        >
          {item}
          <span
            data-strike
            className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-destructive/70"
            aria-hidden
          />
        </li>
      ))}
    </ul>
  );
}
