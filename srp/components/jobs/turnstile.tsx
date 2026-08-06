"use client";

import Script from "next/script";

// Cloudflare Turnstile, rendered only when a site key is configured.
//
// The pairing matters: this widget produces the token and
// submit-application verifies it — but only when TURNSTILE_SECRET_KEY is set
// on the function. Either half missing means no captcha, never a silently
// rejected applicant. That is deliberate: a half-configured deploy should let
// people apply, not close the funnel.
export function Turnstile({ siteKey }: { siteKey: string | null }) {
  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        // The field name submit-application reads off the form.
        data-response-field-name="cf-turnstile-response"
        data-language="ar"
        // Only interrupts when Turnstile judges it necessary; an ordinary
        // applicant sees nothing at all.
        data-appearance="interaction-only"
      />
    </>
  );
}
