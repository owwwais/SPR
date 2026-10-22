import { ApplicantPanel } from "@/components/admin/applicant-panel";
import { ApplicationDossier } from "@/components/admin/application-dossier";

// P4c: an applicant opened from inside the workspace (the applicants list,
// Today, candidates) slides in over the page instead of replacing it, so
// HR keeps its place in the list. The URL is the applicant's own: a refresh
// or a shared link opens the full page, which renders the same dossier.
export default async function ApplicantPanelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ApplicantPanel>
      <ApplicationDossier id={id} variant="panel" />
    </ApplicantPanel>
  );
}
