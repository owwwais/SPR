import type { Metadata } from "next";
import { FileUp, MailCheck, Share2 } from "lucide-react";
import { UploadForm } from "@/components/talent/upload-form";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.talent.uploadTitle,
  description: ar.talent.uploadSubtitle,
};

// Step one. Three steps and no account: asking for a password before the
// person has seen any value is the step that loses them.
export default function TalentUploadPage() {
  const t = ar.talent;
  const steps = [
    { icon: FileUp, label: t.steps.one },
    { icon: MailCheck, label: t.steps.two },
    { icon: Share2, label: t.steps.three },
  ];

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t.uploadTitle}</h1>
        <p className="text-muted-foreground">{t.uploadSubtitle}</p>
      </header>

      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, i) => (
          <li key={step.label} className="flex flex-1 flex-col items-center gap-2 text-center">
            <span className="flex size-9 items-center justify-center rounded-full border bg-muted/40">
              <step.icon className="size-4" aria-hidden />
            </span>
            <span className="text-xs text-muted-foreground">
              {i + 1}. {step.label}
            </span>
          </li>
        ))}
      </ol>

      <UploadForm />
    </main>
  );
}
