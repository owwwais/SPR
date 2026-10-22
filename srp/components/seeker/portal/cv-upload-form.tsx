"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, CircleCheck, FileText, FileUp, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { keepValuesSubmit } from "@/components/seeker/portal/keep-values-submit";
import { uploadSeekerCv, type UploadCvState } from "@/lib/seeker-actions";
import { CV_FORM_MAX_BYTES, CV_MIME_TYPES } from "@/lib/validations/application";
import { cn } from "@/lib/utils";
import { ar } from "@/lib/i18n/ar";

const initial: UploadCvState = { ok: false, error: null };

// Same leniency as the server action: some browsers label a DOCX as
// application/octet-stream or give no type at all, so the extension decides
// then. talent-upload still compares the type with the file's own bytes.
function fileProblem(file: File): string | null {
  const e = ar.apply.errors;
  const typed = file.type in CV_MIME_TYPES;
  const unlabelled = file.type === "" || file.type === "application/octet-stream";
  const name = file.name.toLowerCase();
  if (!typed && !(unlabelled && (name.endsWith(".pdf") || name.endsWith(".docx")))) {
    return e.cvType;
  }
  if (file.size > CV_FORM_MAX_BYTES) return e.cvSize;
  return null;
}

// A new CV version from the profile page. The upload is analysed again
// within the daily limit (3 per account); the same file a second time is
// recognised by its hash and costs nothing (talent-upload).
export function CvUploadForm() {
  const t = ar.seekerPortal.profile;
  const [state, dispatch, pending] = useActionState(uploadSeekerCv, initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the picked file once it has been accepted, so the form is ready
  // for a later version and cannot be resent by accident. The name shown is
  // React state, so it resets during render when a new result arrives; the
  // input itself is DOM, reset in an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setFileName(null);
  }
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      onSubmit={keepValuesSubmit(dispatch)}
      className="flex flex-col gap-3"
    >
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert variant={state.unchanged ? "info" : "success"}>
          <CircleCheck aria-hidden />
          <AlertDescription>
            {state.unchanged ? t.unchanged : t.uploaded}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="cv">{t.uploadTitle}</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* A styled label around a visually hidden input instead of the
              browser's own control, whose "Choose File / No file chosen"
              follows the browser's language rather than the page's. The
              input stays focusable and reachable by keyboard. */}
          <label
            className={cn(
              buttonVariants({ variant: "outline" }),
              "cursor-pointer has-[:focus-visible]:border-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/35"
            )}
          >
            <FileUp aria-hidden />
            {fileName ? t.changeFile : t.chooseFile}
            <input
              id="cv"
              name="cv"
              type="file"
              required
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              aria-invalid={problem ? true : undefined}
              aria-describedby="cv-hint"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setFileName(file?.name ?? null);
                setProblem(file ? fileProblem(file) : null);
              }}
              className="sr-only"
            />
          </label>
          {fileName && (
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span dir="ltr" className="min-w-0 truncate text-start">
                {fileName}
              </span>
            </span>
          )}
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || problem !== null || fileName === null}
          >
            <Upload aria-hidden />
            {pending ? t.uploading : t.upload}
          </Button>
        </div>
        <p id="cv-hint" className="text-xs text-muted-foreground">
          {t.uploadHint}
        </p>
        {problem && <p className="text-xs text-destructive">{problem}</p>}
      </div>
    </form>
  );
}
