import { Info } from "lucide-react";
import { ar } from "@/lib/i18n/ar";

// Shared shell for the privacy policy and the terms. Both are drafts written
// to be reviewed by a lawyer before launch, and the page says so rather than
// letting a reader assume otherwise.
export function LegalDocument({
  title,
  sections,
}: {
  title: string;
  sections: readonly { readonly heading: string; readonly body: string }[];
}) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">{title}</h1>
        <div className="flex gap-3 rounded-lg border-s-2 border-warning bg-warning-soft p-4 text-sm">
          <Info
            className="mt-0.5 size-4 shrink-0 text-warning"
            aria-hidden
          />
          <p className="text-muted-foreground">{ar.legal.reviewNotice}</p>
        </div>
      </header>

      <div className="flex flex-col gap-7">
        {sections.map((section, index) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">
              <span className="me-2 text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              {section.heading}
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
