import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ar } from "@/lib/i18n/ar";

// Next.js ships an English default ("This page could not be found"), which is
// the wrong language for every visitor this product has.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <FileQuestion className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold">{ar.errors.notFoundTitle}</h1>
      <p className="text-sm text-muted-foreground">{ar.errors.notFoundBody}</p>
      <Button render={<Link href="/" />}>{ar.errors.home}</Button>
    </main>
  );
}
