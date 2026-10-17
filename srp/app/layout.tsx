import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";
import { ar } from "@/lib/i18n/ar";
import "./globals.css";

// 300 is gone: light weights weaken Arabic legibility, and nothing used it
// (DESIGN.md §3). Each dropped weight is one font file fewer per visitor.
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

// Display face for marketing headings only (`font-display`). A variable
// font, so one file covers every weight.
const readexPro = Readex_Pro({
  variable: "--font-readex",
  subsets: ["arabic", "latin"],
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
      className={`${ibmPlexSansArabic.variable} ${readexPro.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50"
        >
          {ar.common.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
