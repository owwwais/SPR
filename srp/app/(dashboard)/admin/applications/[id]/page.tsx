import type { Metadata } from "next";
import { ApplicationDossier } from "@/components/admin/application-dossier";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.application.title,
};

// The full page. The same dossier opens as a side panel over the applicants
// list (the @panel slot); a shared link or a refresh lands here.
export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  return <ApplicationDossier id={id} variant="page" retryFailed={error === "retryFailed"} />;
}
