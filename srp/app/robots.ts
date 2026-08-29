import type { MetadataRoute } from "next";

// The workspace and the auth flow have nothing to offer a crawler, and
// /invite carries one-time tokens that must never end up in an index.
//
// The talent flow's own paths are excluded for the same reason: /talent/verify
// and /talent/manage carry capability tokens. Published profiles under /t/ are
// crawlable — that is what their owner consented to — except where they asked
// otherwise, which the page's own noindex tag handles per profile.
export default function robots(): MetadataRoute.Robots {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NEXT_PUBLIC_ROOT_DOMAIN
      ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
      : "")
  ).replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/login",
          "/signup",
          "/onboarding",
          "/invite",
          "/track",
          "/talent/verify",
          "/talent/manage",
          "/talent/review",
        ],
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
