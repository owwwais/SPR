---
version: 1.0
name: Hakeem — "Ink & Paper"
description: >
  The design system of حكيم, an Arabic-first (RTL) recruitment platform whose
  name means "the wise one": it advises, it does not rule. The interface is a
  warm editorial canvas — bone-white paper, warm near-black ink, hairline
  rules — with a single deep-teal accent reserved for action and focus.
  Calm, evidence-first and quietly premium; the company dashboard borrows
  Linear's density discipline inside the same tokens. Structure follows the
  DESIGN.md format popularised by VoltAgent/awesome-design-md; direction A of
  docs/PLATFORM-V3-PLAN.md §4.4 (Claude + Notion references), approved
  2026-10-16. Binding per CLAUDE.md D29.

colors:
  canvas: "#F8F7F3"          # page background (paper)
  surface: "#FFFFFF"         # cards, inputs, popovers
  surface-soft: "#F2F0EA"    # hover rows, secondary buttons, subtle bands
  surface-sunken: "#EBE8E0"  # skeletons, wells, code blocks
  hairline: "#E5E1D8"        # borders and dividers
  hairline-strong: "#D3CEC2" # input borders, emphasised rules
  ink: "#1A1A17"             # headings, primary text
  body: "#34332F"            # long-form text
  muted: "#6B6960"           # secondary text (5.1:1 on canvas)
  muted-soft: "#8F8C82"      # NON-TEXT only: resting icons, disabled controls, decorative rules (3.1:1)
  primary: "#0E5E57"         # the one accent: actions, links, focus, brand mark (7.1:1)
  primary-hover: "#0A4A44"
  on-primary: "#FFFFFF"
  primary-soft: "#E2EEEB"    # tinted backgrounds for selected / info
  primary-soft-ink: "#0B4B45"
  success: "#2F7A4C"         # score band ≥ 75, positive states
  success-soft: "#E6F1E9"
  warning: "#8F6200"         # score band 50–74, cautions
  warning-soft: "#FAF0D7"
  danger: "#B0372F"          # score band < 50, destructive, errors
  danger-soft: "#FAE8E6"
  # dark (defined, not yet switchable — dark mode ships later)
  dark-canvas: "#141412"
  dark-surface: "#1C1C19"
  dark-surface-soft: "#24241F"
  dark-hairline: "#33322C"
  dark-ink: "#F2F0EA"
  dark-muted: "#A29F95"
  dark-primary: "#5FB8AC"

typography:
  # Arabic is the primary script. Line heights are deliberately taller than
  # Latin systems: Arabic carries ascenders, descenders and diacritics.
  # letterSpacing is 0 for every Arabic style — see Rule A2.
  # Root font size is 17px, 18px from 1280px wide (2026-10-16: "make the
  # content bigger"); sizes below are at a 16px rem and scale with the root.
  display-xl: { fontFamily: "Readex Pro", fontSize: clamp(48px, 7.4vw, 100px), fontWeight: 700, lineHeight: 1.12 }  # hero
  display-lg: { fontFamily: "Readex Pro", fontSize: 60px, fontWeight: 700, lineHeight: 1.15 }    # mobile 40px
  display-md: { fontFamily: "Readex Pro", fontSize: 48px, fontWeight: 700, lineHeight: 1.2 }     # mobile 36px
  headline:   { fontFamily: "IBM Plex Sans Arabic", fontSize: 24px, fontWeight: 700, lineHeight: 1.4 }
  title:      { fontFamily: "IBM Plex Sans Arabic", fontSize: 18px, fontWeight: 600, lineHeight: 1.5 }
  body-lg:    { fontFamily: "IBM Plex Sans Arabic", fontSize: 18px, fontWeight: 400, lineHeight: 1.8 }
  body:       { fontFamily: "IBM Plex Sans Arabic", fontSize: 16px, fontWeight: 400, lineHeight: 1.75 }
  ui:         { fontFamily: "IBM Plex Sans Arabic", fontSize: 14px, fontWeight: 500, lineHeight: 1.5 }
  caption:    { fontFamily: "IBM Plex Sans Arabic", fontSize: 12px, fontWeight: 500, lineHeight: 1.5 }
  mono:       { fontFamily: "ui-monospace", fontSize: 13px, fontWeight: 400, lineHeight: 1.6 }      # always dir="ltr"

rounded:
  xs: 4px      # badges, kbd
  sm: 5px
  md: 6px      # buttons, inputs
  lg: 8px      # base radius (--radius)
  xl: 11px     # cards, panels
  2xl: 14px    # marketing feature panels
  full: 9999px # avatars and the status dot only — never buttons or cards

spacing:
  unit: 4px            # Tailwind's default scale
  page-gutter: 16px    # mobile; 24px from sm
  container-public: 1152px   # max-w-6xl
  container-reading: 68ch
  section-marketing: 96px–128px  # py-24 / py-32
  dashboard-page: 24px           # p-6

elevation:
  flat: "none"                      # default for everything on the canvas
  raised: "0 1px 2px rgb(26 26 23 / 0.04), 0 8px 24px rgb(26 26 23 / 0.06)"  # popovers, dialogs, menus only

motion:
  micro: 150ms                     # hover, press
  ui: 240ms                        # panels, tabs, accordions
  reveal: 600ms                    # marketing scroll entry
  ease-out: "cubic-bezier(0.16, 1, 0.3, 1)"
  press: "scale(0.98)"
---

# Hakeem Design System — "Ink & Paper"

## 1. Overview

حكيم advises; a human decides. The interface has to carry that stance before a
word is read: calm instead of loud, evidence instead of decoration, one accent
instead of a rainbow. The canvas is warm paper (`canvas`), text is warm ink
(`ink`, `body`), structure comes from hairline rules (`hairline`) and
whitespace rather than shadows, and the deep teal `primary` appears only where
the user can act or where focus is.

Three surfaces share these tokens:

| Surface | Character |
|---|---|
| **Marketing** (`/`, `/pricing`, `/fairness`, `/talent`) | Editorial: generous whitespace, Readex Pro display headings, scroll-driven storytelling (GSAP + Lenis, D29). |
| **Seeker portal** (`/me`) | Calm and guided: one primary action per screen, progress always visible. |
| **Company dashboard** (`/admin`) | Dense and precise (Linear's discipline): compact tables, hairline dividers, tabular numbers, no decoration. |

## 2. Colors

- **One accent.** `primary` (deep teal) is the only chromatic brand color. Do
  not introduce a second accent, gradients, or neon.
- **Semantic colors are not accents.** `success` / `warning` / `danger` exist
  for meaning — chiefly the fit-score bands (FR-04/05: ≥ 75 green, 50–74
  amber, < 50 red) and states. Always pair a `*-soft` background with its
  matching foreground; never put semantic text on another semantic background.
- **Never raw palette classes** (`text-emerald-600`, `bg-red-100`, …) in
  components. Use the tokens: `text-success`, `bg-warning-soft`,
  `text-danger`, `bg-primary-soft`, and so on. Tokens are what make dark mode
  a token swap instead of a rewrite.
- **Text contrast ≥ 4.5:1** (AA). `muted-soft` fails that and is for non-text
  only: resting icons, disabled controls, decorative rules. Input placeholders
  are text and use `muted`.
- No pure black (`#000`) and no pure white canvas: paper is `canvas`, white is
  for surfaces that sit on it.
- Dark tokens are defined so components stay token-only, but the theme is not
  switchable yet.

## 3. Typography

- **IBM Plex Sans Arabic** for everything in the UI (weights 400/500/600/700;
  300 was removed — light weights weaken Arabic legibility).
- **Readex Pro** for marketing display headings only (`font-display`). Never in
  the dashboard, never for body text.
- Tabular figures (`tabular-nums`) for every number that can be compared:
  scores, counts, dates in tables, timers.
- Long-form text: `body` at 1.75 line height, `max-w-[68ch]`.
- **Root size is 17px, and 18px from 1280px** (`html { font-size }` in
  `globals.css`). Everything rem-based scales with it; do not compensate by
  shrinking components back.
- Marketing body copy is `text-lg`–`text-xl`; section titles `text-4xl`–
  `text-6xl`; the hero headline `clamp(3rem, 7.4vw, 6.25rem)`.
- Hierarchy comes from size and weight, not from color. Headings are `ink`;
  secondary text is `muted`.

## 4. Arabic & RTL — binding rules (D29)

These outrank any generic design guidance, including the taste-skill skills in
`.claude/skills/`.

| # | Rule | Why |
|---|---|---|
| **A1** | **Never split Arabic text into characters.** GSAP `SplitText` and React Bits text components run with `type: "words"` or `"lines"` only on Arabic. | One element per letter breaks cursive joining; the word renders as disconnected letters. |
| **A2** | **No letter-spacing on Arabic.** `tracking-*` utilities and negative `letterSpacing` from reference DESIGN.md files are for Latin display type; on Arabic they break joins and legibility. | Every reference in awesome-design-md tightens Latin headings; we do not inherit that. |
| **A3** | **Logical properties only** (`ms-/me-/ps-/pe-/start-/end-`, `text-start`). No `ml-/mr-/pl-/pr-/left-/right-`. | Existing rule (§8, §10.7). |
| **A4** | **Motion direction is mirrored by `dir`.** "Enter from the start edge" is +x in RTL and −x in LTR; derive the sign from the document direction (a `fromStart()` helper in `lib/motion.ts` arrives with the landing page, P3), never a literal `x`. | A slide that feels natural in English feels backwards in Arabic. |
| **A5** | **Directional icons point the reading way.** "Next/forward" is `ArrowLeft` / `ChevronLeft` in RTL. | Already the convention in the codebase. |
| **A6** | **Latin islands are explicit.** Emails, URLs, code, phone numbers: `dir="ltr"` with `text-start` inside the RTL flow. | Prevents punctuation jumping to the wrong end. |
| **A7** | **No italics on Arabic.** Emphasise with weight or color. | Arabic has no true italic; synthetic slant looks broken. |
| **A8** | **No uppercase / small-caps eyebrows.** Eyebrow labels use `caption` weight 500 in `muted` or `primary`. | Case does not exist in Arabic. |
| **A9** | **Line height floors:** body ≥ 1.6, display ≥ 1.25. The hero headline alone runs at 1.12, and any reveal mask on Arabic must be open above and reach ≥ 0.4em below the baseline (`.word-mask` in `globals.css`). | Diacritics sit above the letters and descenders (ح ع م) run deep; a Latin-sized box clips both. |
| **A10** | **`prefers-reduced-motion` is honoured everywhere.** GSAP via `gsap.matchMedia()`, Lenis disabled entirely, CSS reveals gated. | Accessibility. |
| **A11** | **Lenis and GSAP live on marketing routes only.** The dashboard and seeker portal scroll natively. | Nested scroll containers and tables need native scroll (D29). |

## 5. Layout

- Public pages: `max-w-6xl` container, `px-4 sm:px-6`. Reading blocks
  `max-w-[68ch]`. Marketing sections breathe (`py-24`–`py-32`) and are not all
  centred — alternate alignment and asymmetric grids; avoid the "three equal
  cards" row.
- Dashboard: sidebar 248px with labels on desktop (an icon rail only as an
  explicit opt-in later), content `p-6`, lists paginated (§8).
- Use `min-h-dvh`, never `h-screen`, for full-height sections.
- Spacing is optical, not symmetrical: bottom padding of a section may exceed
  its top.

## 6. Elevation & Depth

Flat by default. Depth comes from the canvas/surface step (`canvas` → white
`surface`) and hairlines. `elevation.raised` is only for floating layers:
popovers, menus, dialogs, toasts. No `shadow-md/lg/xl` on cards.

## 7. Shapes

Base radius 8px (`--radius`). Buttons and inputs `rounded-md` (6px), cards
`rounded-xl` (11px), badges `rounded-sm`. Pills (`rounded-full`) only for
avatars and status dots — never for buttons, cards or badges. Inner radii are
tighter than their containers.

## 8. Iconography & Imagery

- **Lucide stays** (`lucide-react` is the D10-approved set; the taste skills'
  "avoid Lucide" does not apply). Standardise: 16px in UI and tables, 20px in
  navigation, `strokeWidth` 1.75, color `muted` at rest and `ink` or `primary`
  when active. Decorative icons are `aria-hidden`.
- **No stock photography and no placeholder images** (no picsum). Marketing
  visuals are real product UI scenes rendered in code (the score card, the
  interview room) and quiet abstract shapes in the palette.
- No emoji anywhere in the product.

## 9. Components

| Component | Spec |
|---|---|
| **Button — primary** | `bg-primary text-primary-foreground`, `rounded-md`, height 36 (default) / 40 (lg) / 32 (sm), weight 500, no shadow. Hover `primary-hover`; active `scale(0.98)`; focus ring `primary` 3px at 35%. |
| **Button — secondary** | `bg-secondary` (= `surface-soft`) with `ink` text. Use instead of a second filled button. |
| **Button — outline / ghost / link** | Outline: `hairline-strong` border on `surface`. Ghost: transparent, `surface-soft` on hover. Link: `primary`, underline on hover. |
| **Card** | `surface` on `canvas`, `border-hairline`, `rounded-xl`, no shadow. Only when grouping carries meaning — otherwise use spacing and a rule. |
| **Input / Textarea / Select** | `surface`, `border-hairline-strong`, `rounded-md`, height 36. Focus: border `primary` + ring. Errors: border `danger` + message in `text-danger` below. |
| **Badge** | `rounded-sm`, `caption` size, tinted background (`*-soft`) with matching ink. No pills. |
| **Table** | Header row: `caption`/500 in `muted`, no fill. Rows: `hairline` dividers, `surface-soft` on hover, `tabular-nums` for numbers. Numeric columns align to the end. |
| **Score badge** | Band color per FR-04/05 using semantic tokens, number in `tabular-nums` weight 700, and always the "استشاري" advisory tooltip (§10.4). |
| **Tabs** | Underline style: active tab `ink` with a 2px `primary` bar; inactive `muted`. |
| **Alert** | `*-soft` background, matching ink, icon at the start edge, no heavy border. |
| **Empty state** | Icon in a `surface-soft` 40px tile, a one-line title, one line of help, one action. Never a bare "no data". |
| **Skeleton** | `surface-sunken`, shaped like the content it replaces. |
| **Focus** | Every interactive element shows a visible focus ring; never `outline: none` without a replacement. |
| **Navigation** | Active item: `primary-soft` background with `primary-soft-ink` text. |
| **Workspace shell** | Sidebar `w-62` on `sidebar` with a hairline at the end edge: org switcher, then the work (Today, jobs with up to five published jobs nested beneath and a count badge, candidates, calendar, statistics), then the organisation (careers page, plan, settings), then usage, switches and the account at the bottom. Top bar 48px on `canvas`: breadcrumb (derived from the URL, `ChevronLeft` separators) and the one primary action. Below `md`: the sidebar moves into a drawer from the start edge (Base UI `Dialog`, 240ms transform, mirrored by `dir`, no blur) and a 56px tab bar holds four places, every target ≥ 44px. |
| **Usage meter** | Base UI `Meter`: label and `<bdi>used من limit</bdi>` above a 6px `surface-sunken` track; `primary` fill, `warning` from 80%, `danger` at 100%. No limit → "بلا حد" and no bar; limit 0 → "غير مشمولة في الباقة". |
| **File field** | The native input stays in the form, visually hidden; a dashed `hairline-strong` box shows an Arabic prompt or the chosen file name (`dir="ltr"`), accepts a drop, and shows focus through `has-[:focus-visible]`. Never the browser's own control (it speaks the browser's language). |
| **Date field** | Day, month and year selects with Arabic labels writing one hidden `YYYY-MM-DD` value; never `<input type="date">`, which shows the browser's format. |
| **Side panel** | A record opened from a list slides in from the end edge (Base UI `Dialog`, `w-[min(42rem,92vw)]`, the full screen on a phone), on `canvas` with a hairline at its start edge and a sticky 48px bar holding close. Closing goes back, so the list keeps its scroll and filters; the same URL as a full page renders the same content. Content uses container queries (`@container`, `@4xl:`), never viewport breakpoints, so it lays out by the panel's width. |
| **Command palette** | Ctrl/⌘ K or the top-bar field. Base UI `Dialog` at 12vh, `w-[min(36rem,92vw)]`, `shadow-raised`; a combobox input over a listbox grouped by kind (records first, then commands), the active row on `surface-soft`, Latin codes as `<bdi dir="ltr">` islands, key hints in the footer. |
| **Row menu** | One contextual action stays on the row; the rest go behind an `Ellipsis` trigger (Base UI `Menu`, aligned to the end edge). Destructive items sit last, after a hairline, in `danger`, and always confirm. |
| **Decision** | Changing an application's status sits beside its evidence, never on another tab. Accepting or declining confirms in an alert dialog that says an email will be sent. |
| **Product scene** | Real product UI rendered in code on marketing and sign-in surfaces (the scored applicant with its reasons and the human decision; recommended jobs with their reasons), always captioned "مثال توضيحي". Static: nothing in it animates on load. |

## 10. Motion

- Micro (150ms) for hover/press, UI (240ms) for panels, reveal (600ms) for
  marketing entry, all on `ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`).
- Animate only `transform` and `opacity`.
- Staggered entry on marketing lists (≈ 80ms apart); nothing in the dashboard
  animates on load except skeleton-to-content.
- Reduced motion: content appears at rest, no smooth scroll (A10).

## 11. Writing (UI copy)

- Plain, specific Arabic (MSA). No hype words, no exclamation marks in success
  messages, no "عذراً!" error theatrics: say what happened and what to do.
- Every AI output is labelled "استشاري" where it is shown (§10.4, D24).
- No invented numbers on marketing pages — only true product facts.
- All strings live in `lib/i18n/ar.ts`; the product name only via
  `PRODUCT_NAME` (D25).

## 12. Do / Don't

**Do:** one primary action per view · hairlines over shadows · tokens over
palette classes · tabular numbers · real product scenes as visuals ·
`fromStart()` for directional motion · test RTL and 375px width on every page.

**Don't:** per-character Arabic animation · `tracking-*` on Arabic · a second
accent color · gradients or glassmorphism in the dashboard · pills for buttons
or cards · centred-everything marketing layouts · smooth scroll in the
dashboard · stock photos.

## 13. Iteration Guide

1. Change tokens in `app/globals.css` first; components follow automatically.
2. When adding a component, express it in tokens and add a row to §9.
3. A rule here changes only with engineer approval, like the spec it serves.
4. Where `.claude/skills/*` (taste-skill) and this file disagree, this file
   wins.
