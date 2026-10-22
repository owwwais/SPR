"use client";

import { useActionState, useRef, useState, type DragEvent } from "react";
import { AlertCircle, FileText, FileUp, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { submitKeepingValues } from "@/components/seeker/onboarding/submit-keeping-values";
import { uploadSeekerCv, type UploadCvState } from "@/lib/seeker-actions";
import { CV_FORM_MAX_BYTES, CV_MIME_TYPES } from "@/lib/validations/application";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

const initialState: UploadCvState = { ok: false, error: null };

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The same rule the server action and talent-upload apply, run here first so
// a wrong file is turned away before it crosses the network. A browser that
// gives a DOCX no type is judged by the extension; the function still checks
// the file's own bytes.
function checkFile(file: File): string | null {
  const errors = ar.seekerOnboarding.errors;
  const name = file.name.toLowerCase();
  const typed = file.type in CV_MIME_TYPES;
  const untypedButNamed =
    (file.type === "" || file.type === "application/octet-stream") &&
    (name.endsWith(".pdf") || name.endsWith(".docx"));
  if (!typed && !untypedButNamed) return errors.cvType;
  if (file.size > CV_FORM_MAX_BYTES) return errors.cvSize;
  if (file.size === 0) return errors.cvRequired;
  return null;
}

function formatSize(bytes: number): string {
  const t = ar.seekerOnboarding.upload;
  return bytes >= 1024 * 1024
    ? t.sizeMb.replace("{size}", (bytes / (1024 * 1024)).toFixed(1))
    : t.sizeKb.replace("{size}", String(Math.max(1, Math.round(bytes / 1024))));
}

// Step one of the CV-first onboarding (plan §2.3): a drop zone over a real
// file input, so keyboard and screen-reader users get the native picker and
// everyone else can drag the file in. On success the server action
// revalidates this page, which then renders the next step on its own.
export function UploadStep({ again = false }: { again?: boolean }) {
  const t = ar.seekerOnboarding.upload;
  const [state, formAction, pending] = useActionState(uploadSeekerCv, initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = (next: File | undefined) => {
    if (!next) {
      setFile(null);
      setClientError(null);
      return;
    }
    const problem = checkFile(next);
    setClientError(problem);
    if (problem) {
      setFile(null);
      // Never submit a file that was just refused.
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(next);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (!dropped || !inputRef.current) return;
    // Hand the dropped file to the real input, so the form submits it like
    // a picked one and the server action sees no difference.
    const transfer = new DataTransfer();
    transfer.items.add(dropped);
    inputRef.current.files = transfer.files;
    choose(dropped);
  };

  const error = clientError ?? state.error;

  return (
    <form
      action={formAction}
      onSubmit={submitKeepingValues(formAction)}
      className="flex flex-col gap-4"
    >
      <label
        htmlFor="cv"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 has-[:focus-visible]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/35",
          dragging
            ? "border-primary bg-primary-soft"
            : "border-input bg-card hover:bg-surface-soft"
        )}
      >
        <span className="mb-1 flex size-10 items-center justify-center rounded-md bg-surface-soft">
          <FileUp className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="font-medium">{again ? t.again : t.dropTitle}</span>
        <span className="text-sm text-muted-foreground">{t.dropOr}</span>
        <span className="text-xs text-muted-foreground">{t.hint}</span>
        <input
          ref={inputRef}
          id="cv"
          name="cv"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-describedby="cv-limit"
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </label>

      {file && (
        <p className="flex items-center gap-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{t.selected}</span>
          <span dir="ltr" className="min-w-0 truncate text-start font-medium">
            {file.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatSize(file.size)}
          </span>
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {state.ok && state.unchanged && !error && (
        <Alert variant="info">
          <Info className="size-4" aria-hidden />
          <AlertDescription>{t.unchanged}</AlertDescription>
        </Alert>
      )}

      <p id="cv-limit" className="text-xs text-muted-foreground">
        {t.limit}
      </p>

      <Button type="submit" size="lg" disabled={pending || file === null}>
        {pending ? t.submitting : t.submit}
      </Button>
    </form>
  );
}
