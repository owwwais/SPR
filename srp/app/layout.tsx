import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { ar } from "@/lib/i18n/ar";
import "./globals.css";

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Absolute URLs are required for og:image and friends. Without a configured
// site URL the social tags still render — they just carry relative paths,
// which is better than failing the build.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: {
    default: ar.meta.title,
    template: `%s | ${ar.meta.title}`,
  },
  description: ar.meta.description,
  applicationName: ar.meta.title,
  // Shared job links are the marketplace's distribution channel (D21); until
  // now they previewed as a blank card on WhatsApp, LinkedIn and X.
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: ar.meta.title,
    title: ar.meta.title,
    description: ar.meta.description,
    ...(siteUrl ? { url: siteUrl } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: ar.meta.title,
    description: ar.meta.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${ibmPlexSansArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
