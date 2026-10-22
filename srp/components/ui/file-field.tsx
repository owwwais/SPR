"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { ar } from "@/lib/i18n/ar";
import { cn } from "@/lib/utils";

// A file input that speaks Arabic (UI-H3). The native control renders its
// button and "No file chosen" in the browser's language, which for most
// visitors is English. The real <input> stays in the form — visually hidden,
// still focusable and still the thing that is submitted — and a drop on the
// box is handed to it, so validation and the server action see no change.
export function FileField({
  id,
  name,
  accept,
  required,
  invalid,
  describedBy,
  onFile,
}: {
  id: string;
  name: string;
  accept: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onFile?: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const t = ar.common.fileField;

  function chosen(file: File | undefined) {
    setFileName(file?.name ?? null);
    onFile?.(file);
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const input = inputRef.current;
        if (!input || event.dataTransfer.files.length === 0) return;
        input.files = event.dataTransfer.files;
        chosen(input.files[0]);
      }}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed bg-card px-3 py-2 text-sm transition-colors",
        "hover:bg-surface-soft has-[:focus-visible]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/35",
        over ? "border-primary bg-primary-soft/40" : invalid ? "border-destructive" : "border-input"
      )}
    >
      <FileUp className="size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
      {fileName ? (
        <bdi dir="ltr" className="min-w-0 flex-1 truncate text-start font-medium">
          {fileName}
        </bdi>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.prompt}</span>
      )}
      <span className="shrink-0 text-xs font-medium text-primary">
        {fileName ? t.change : t.browse}
      </span>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => chosen(event.target.files?.[0])}
        className="sr-only"
      />
    </label>
  );
}
