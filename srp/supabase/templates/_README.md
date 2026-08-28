# Supabase Auth email templates

These are the emails Supabase Auth itself sends — signup confirmation,
password recovery, email change, magic link. They are **not** the Resend
templates in `supabase/functions/send-email/templates.ts`; those cover
applicant and team mail, and are unrelated to this directory.

Until these existed the project used Supabase's built-in defaults, which are
written in English and carry no product identity. For an Arabic-only product
(D23) that meant a new customer's very first email arrived in the wrong
language and under the wrong name.

## D25 exception, deliberately taken

D25 says the product name lives in `lib/i18n/ar.ts` and nowhere else. These
files break that rule because they cannot follow it: Supabase renders them
outside the Next.js runtime and only substitutes its own Go template
variables (`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Token }}`). There
is no import path from here to `ar.ts`.

**So if the product is ever renamed, these files must be edited by hand.**
That is the whole cost of the exception, written down so it is not
rediscovered the hard way.

## Deploying

`config.toml` wires these up for the **local** stack only. The hosted project
keeps its own copies: Dashboard → Authentication → Email Templates, where the
same HTML has to be pasted in. Until that is done, production still sends the
English defaults.
