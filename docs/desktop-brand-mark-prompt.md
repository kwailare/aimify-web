# Kickoff prompt: recreate the "Aimify" wordmark in Flutter

Paste the contents below (everything after the `---`) into the
`aimify-desktop` Claude Code session to recreate the brand wordmark used in
the `aimify-web` navbar — a two-font, two-tone treatment, not the plain PNG
logo image.

---

I want to recreate a specific brand wordmark treatment from the sibling
`aimify-web` (Next.js/CSS) project as a Flutter widget. This is not the PNG
logo image — it's a pure-text logotype used in the web app's navbar, built
from two spans of the word "Aimify" in different fonts, sizes and colors.
Here is the exact spec, pulled directly from that project's CSS so it's
precise, not approximate:

## Structure

Two adjacent text runs, no space between them, reading as one word:
"**Aimi**" + "*fy*"

## "Aimi" (`brand-primary`)

- Font: **Space Grotesk**, weight 700 (bold)
- Size: ~22px (`1.4rem` in the web version — treat as a baseline to scale
  from, not a hard pixel-perfect requirement)
- Letter spacing: slightly tight (`-0.01em` — a hair tighter than default)
- Color: `#242424` in light mode, `#f8f7f3` in dark mode (this is the same
  adaptive "ink" token used for body text throughout the web app — it should
  read as normal high-contrast text, not an accent color)

## "fy" (`brand-accent`)

- Font: **Instrument Serif**, italic, weight 400 (regular — the italic and
  the font choice itself carry the contrast, not boldness)
- Size: ~28px (`1.75rem` in the web version) — noticeably larger than
  "Aimi", roughly 1.25× its size, so it reads as a flourish rather than
  matching text
- Color: `#ff9d0a` (fixed — same value in both light and dark mode, this one
  doesn't adapt)
- Sits with a small negative/tight gap right after "Aimi" (`margin-left:
  0.03em` in CSS terms — barely any gap, they should feel connected)
- A small decorative dot sits just above and to the right of the "fy": a
  tiny circle (~4px diameter), gradient from `#ffc94d` to `#ff9d0a`, with a
  soft glow around it (a subtle drop shadow in that same orange, not a hard
  edge). This echoes a dot that appears in the actual Aimify logo mark — it's
  a deliberate callback, not decoration for its own sake.

## Interaction (optional polish, if this mark is ever tappable — e.g. it
links home in the web navbar)

- On hover/press: "Aimi" shifts color to `#d88b00` (light) / `#f2b233`
  (dark); "fy" shifts to `#ffc94d` and lifts slightly with a small
  rotation (a few degrees, playful not dramatic).

## Implementation notes for Flutter

- `RichText` with two `TextSpan` children (different `TextStyle` per span:
  different `fontFamily`, `fontStyle`, `fontSize`, `color`) is the natural
  fit for the two-font-in-one-line requirement.
- Space Grotesk and Instrument Serif are both on Google Fonts — use the
  `google_fonts` package rather than bundling font files by hand, unless
  there's already a reason not to.
- The decorative dot can be a small `Positioned` `Container` (or
  `BoxDecoration` with a gradient + `boxShadow`) layered via `Stack` above
  the text, roughly at the top-right of the "fy".
- If this project already has a design-tokens/theme file, wire these colors
  in as named tokens (e.g. `AimifyColors.goldVivid`) rather than inlining
  hex values directly in the widget, so they're reusable elsewhere.
