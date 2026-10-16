// The hero headline, revealed word by word with CSS rather than a script.
//
// It used to be React Bits SplitText, which keeps the text hidden until
// hydration. On a mid-range phone hydration lands around 2.7 s, so the
// biggest words on the page stayed blank that long and LCP missed its
// 2.5 s budget (PLATFORM-V3-PLAN §4.5). Splitting on the server and
// animating with CSS starts the reveal at first paint instead. Words only —
// never letters, which would break Arabic joining (DESIGN.md A1). Under
// reduced motion the global rule collapses the animation to its end state.
import { cn } from "@/lib/utils";

const STAGGER = 0.11; // seconds between words

export function HeroHeadline({ lines }: { lines: readonly string[] }) {
  let index = 0;
  return (
    <h1 className="font-display text-[clamp(3rem,7.4vw,6.25rem)] leading-[1.12] font-bold">
      {lines.map((line, lineIndex) => (
        <span key={line} className={cn("block", lineIndex === 1 && "text-primary")}>
          {line.split(" ").map((word, wordIndex) => {
            const delay = 0.1 + STAGGER * index++;
            return (
              <span key={`${word}-${wordIndex}`}>
                {wordIndex > 0 && " "}
                <span className="word-mask">
                  <span
                    className="word-rise"
                    style={{ "--enter-delay": `${delay.toFixed(2)}s` } as React.CSSProperties}
                  >
                    {word}
                  </span>
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
