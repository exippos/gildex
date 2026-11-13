# GILDEX — Visual Style

Status: Draft v0.3 · Last updated: 2026-11-13

The condensed visual style — tokens and treatments only. The full system,
interaction defaults, and fork rationale live in
`ui-design-prototype-v1.md`; the Stitch/DESIGN.md manifest lives in
`stitch-master-prompt.md`. This is the quick-reference sheet for any agent or
human building screens.

Active direction: **gilded ocean**, ported from
`design/gilded-ocean-bento-ui.html` (deep navy + gilt, Art-Deco sunburst,
gilded frames, serif accents, ocean-blue secondary). Layout is unchanged from
`05-ui-layout.md`.

## 1. North star

**The interface is a gilded frame around the work.**

Artwork remains the only saturated, opaque object on screen; chrome recedes into
deep ocean tones. **Gilt is the frame:** hairlines, diamonds, brackets, inner
rules and one gradient primary action. Ocean blue is a secondary depth accent,
never a surface fill.

## 2. Three layers

| Layer | Role | Expression |
|---|---|---|
| Scandinavian minimalism | Structure | 4px space, hairline borders, low contrast |
| Gilded ocean | Material | deep navy panels, gilded frames, gold diamonds, no blur |
| Art Deco | Framing | sunburst emblem, double rules, serif accents, stepped corners |

## 3. Tokens

### 3.1 Color — the ocean-gilt family

Dark ("abyssal ocean") is default; light ("daylight ocean") is secondary. Gilt
and ocean accents are shared; only neutrals shift.

| Token | Dark | Light | Role |
|---|---|---|---|
| `background` | `#060B13` | `#F3F6FA` | app canvas / deep water |
| `surface` | `#0B121E` | `#FFFFFF` | fixed chrome (header, rail, preview) |
| `surface-inset` | `#08101C` | `#EAF0F7` | wells, media beds, folder tree |
| `control` | `#111B2B` | `#E9EFF7` | inputs, pills, cards, popovers |
| `control-hover` | `#162338` | `#DFE8F3` | hover fill |
| `hairline` | `#19263A` | `#DBE4EF` | borders, gutters |
| `border-subtle` | `#24354F` | `#CBD7E6` | control borders |
| `border-strong` | `#354B6B` | `#B0C2D8` | hover borders |
| `gilt-border` | `rgba(212,175,114,.34)` | `rgba(158,120,54,.40)` | gilded frames |
| `gilt-dim` | `rgba(212,175,114,.14)` | `rgba(158,120,54,.12)` | inner rules, active fills |
| `text` | `#F3F6FA` | `#101B2A` | primary text |
| `text-muted` | `#8FA3BE` | `#5B6B80` | secondary labels |
| `text-faint` | `#4D627E` | `#8B9AAD` | metadata, placeholders |
| `gilt` | `#D4AF72` | `#9E7836` | frame accent, glyphs, favorite |
| `gilt-bright` | `#E5C58A` | `#7F5F25` | hover / active only |
| `on-gilt` | `#060B13` | `#101B2A` | text on the gilt gradient |
| `ocean` | `#38BDF8` | `#0284C7` | secondary accent, progress, timeline |
| `status-final` | `#2DD4BF` | `#0F766E` | teal active/final |
| `status-wip` | `#C99A6A` | `#A97648` | clay amber |
| `status-draft` | `#8FA3BE` | `#5B6B80` | neutral |
| `danger` | `#E06A6A` | `#B3403A` | destructive, missing, purge |

Status mapping (D22): favorite → `gilt`; final → `status-final`; wip →
`status-wip`; draft → `status-draft`. Guardrail: favorite, WIP, and the accent
must stay separable — favorite = gold diamond, WIP = clay, accent = frame edge
or the single gradient primary action.

### 3.2 Type

- **UI** — Inter (system-ui, sans-serif): body, dense UI, labels and data.
- **Display** — Cormorant Garamond (local stack; Georgia fallback): entity
  titles, empty states, ingest/drop headings, quote-like moments. Never in
  dense table/data rows.
- **Eyebrow** — 10px, weight 600, tracking 0.16em, uppercase, `gilt`.
- **Headings** — serif 400 at 24–34px, tight line-height; sans titles 500.
- Scale (px): caption 10 · body 13 · body-large 15 · subheading 17 · heading 22
  · display 34. Data figures use tabular numerals.

### 3.3 Space, radius, elevation, effects

- Spacing base **4px**; all gutters/paddings are multiples.
- Radius **6px** (controls, cells, cards) / **8px** (frames, popovers, panels)
  / **12px** (modals) / **9999px** (pills).
- Elevation **flat**; gilded double frames do the framing work (outer border +
  inset hairline at 3–5px). Only floating layers (modal, toolbar, popovers)
  cast a wide soft shadow.
- **No blur, no grain, no glass.** The optional gallery atmosphere is a deep
  ocean/gold wash and is off in the reduced-effects state.
- Glow is reserved for live/selected marks: gold diamonds and the teal status
  dot.

### 3.4 Token file

```css
:root {
  --bg: #060b13;
  --surface: #0b121e;
  --surface-inset: #08101c;
  --control: #111b2b;
  --control-hover: #162338;
  --hairline: #19263a;
  --border-subtle: #24354f;
  --border-strong: #354b6b;
  --gilt: #d4af72;
  --gilt-bright: #e5c58a;
  --gilt-border: rgba(212, 175, 114, 0.34);
  --gilt-dim: rgba(212, 175, 114, 0.14);
  --on-gilt: #060b13;
  --ocean: #38bdf8;
  --text: #f3f6fa;
  --text-muted: #8fa3be;
  --text-faint: #4d627e;
  --status-final: #2dd4bf;
  --status-wip: #c99a6a;
  --status-draft: #8fa3be;
  --danger: #e06a6a;
  --focus: #e5c58a;
  --space: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 9999px;
  --font-ui: "Inter", system-ui, sans-serif;
  --font-display: "Cormorant Garamond", Georgia, serif;
}
```

Light mode overrides the neutrals plus `--on-gilt`.

## 4. Component treatments

- **Grid cell** — the only saturated, opaque object on the wall; hairline
  gutter; no card chrome, borders or shadows; 6px radius.
- **Selection** — 2px `gilt` ring + corner tick.
- **Focus** — 1px `text-muted` full-cell outline; always visible; distinct from
  selection.
- **Hover** — cool deep-water lift (`rgba(243,246,250,0.05)`); never a gold wash.
- **Hover-play (D18)** — precomputed frame strip, cycled within the cell,
  ~120ms after settle.
- **Badges (D22)** — favorite top-right as a glowing `gilt` diamond;
  rating/status bottom-left on a dark chip.
- **Presence** — 6px rotated `gilt` diamonds mark section labels, active nav
  items and live marks. This is the primary Art-Deco glyph.
- **Kind** — video: hover-play; audio: rough spectrogram (D42). No other glyphs.
- **Gilded frame** — cards that frame media or a named thing get a
  `gilt-border` outer border plus an inset `gilt-dim` hairline at 3–5px
  (session cards, prompt block, story media, ingest cards, modal).
- **Gilt seam** — panel resize handles: 1px `gilt-border` at rest, `gilt` on
  hover/drag with a stepped tick at midpoint.
- **Pill control** — `surface` fill, `border-subtle`; active is `gilt-dim`
  fill, `gilt` border, `gilt-bright` text. Used for surface tabs, status, chips.
- **Primary action** — gilt gradient (`#E2C185 → #C89F5D`), light gold border,
  `on-gilt` text; one per surface (Inspect, Import, Create, Save).
- **Serif accent** — entity titles and the ingest drop line; gold italic for the
  one editorial accent on a screen.
- **Inspector plaque** — gallery label, not dashboard: gold eyebrow, serif
  title, prompt block, quiet parameter spec line.
- **Chips** — inline `[[…]]` → gilded pill with muted text; active tag filters
  carry a gold dismiss glyph.
- **Toast** — control chip bottom-center, gilt left-edge.
- **Empty / first-run** — gold diamond ornament + serif line + "pick root →
  drag here." The one place ornament may be prominent.
- **Missing file** — muted placeholder + `danger` tick; never deleted.

## 5. Guardrails

- **Matte contract.** No blur, grain or glass on chrome; grid opaque; shadows
  only on floating layers. No runtime shaders except the optional gallery
  atmosphere (prototype; hidden in reduced effects), no WebGL elsewhere, no
  animation.
- **Gilding dosage.** Gold frames mark structure and one primary action; the
  wall itself never fills with gold. Ocean blue stays secondary (progress,
  histogram, status).
- **Deco dosage.** Motifs only in quiet moments and at frame joints — never on
  or around items.
- **A11y.** WCAG contrast for `text`/`text-muted` vs `background`; visible
  focus everywhere; keyboard-reachable. Serif is display-only.
- **Thin chrome.** Native menus/dialogs; custom UI only on grid + inspector; no
  component library, theme engine, or heavy animation.

## 6. Do's and Don'ts

- **DO** recede — if an element draws the eye before the nearest image, it is
  wrong.
- **DO** use the tokens as written; never invent a color, face, radius, or
  shadow.
- **DO** use one gilded double frame per card, not stacked frames.
- **DO** reserve the gilt gradient for the single primary action.
- **DON'T** frost, blur, grain or animate chrome.
- **DON'T** set body copy or data in the serif face.
- **DON'T** use ocean blue as a surface fill.
- **DON'T** gild every list row; gilded borders are for active/expanded items.
- **DON'T** render raw metadata blobs; show only known fields.
- **DON'T** use framework shorthand ("rounded-xl"); state values in plain
  language.

## 7. Traceability

Grid/perf (D14), hover-play (D18), badges (D22), audio spectrogram (D42),
inspector/story (D7, D9), native chrome (D35), zero network (D5), thin theming
(UI direction). Reference mockup: `design/gilded-ocean-bento-ui.html`.
