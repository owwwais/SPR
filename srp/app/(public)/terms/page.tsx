import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { ar } from "@/lib/i18n/ar";

export const metadata: Metadata = {
  title: ar.legal.termsTitle,
};

export default function TermsPage() {
  return (
    <LegalDocument title={ar.legal.termsTitle} sections={ar.legal.terms} />
  );
}
