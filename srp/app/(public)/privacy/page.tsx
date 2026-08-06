import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.legal.privacyTitle,
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title={ar.legal.privacyTitle}
      sections={ar.legal.privacy}
    />
  );
}
