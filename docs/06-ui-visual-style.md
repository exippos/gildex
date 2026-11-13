# GILDEX — Visual Style

Status: Draft v0.4 · Last updated: 2026-11-13

The condensed visual style — themes, tokens and treatments only. The full
system, interaction defaults, and fork rationale live in
`ui-design-prototype-v1.md`; the Stitch/DESIGN.md manifest lives in
`stitch-master-prompt.md`. This is the quick-reference sheet for any agent or
human building screens.

Active direction: **four token themes over one shared shell**. Gilded ocean is
the default. There is no light/dark mode switch; each theme is a fixed
appearance, and ivory copper is the light theme.

| Theme | `data-theme` | Reference |
|---|---|---|
| Gilded ocean (default) | `gilded` | `design/gilded-ocean-bento-ui.html` |
| Dark bento | `dark-bento` | `design/editorial-matte-bento-ui.html` |
| Scandinavian sage | `sage` | `design/scandinavian-green-gilded-bento-ui.html` |
| Ivory copper | `copper` | `design/ivory-copper-bento-ui.html` |

Layout is unchanged from `05-ui-layout.md`.

## 1. North star

**The interface is a frame around the work.** Artwork is the only saturated,
opaque object on screen; chrome recedes. The frame material changes per theme —
gilt, matte gold, brass, or copper — but the structure and behaviour do not.

## 2. Three layers

| Layer | Role | Expression |
|---|---|---|
| Scandinavian minimalism | Structure | 4px space, hairline borders, low contrast |
| Theme material | Surface | navy, charcoal, forest or ivory; flat, no blur or grain |
| Framing | Identity | sunburst or diamond marks, double rules, optional serif accents |

## 3. Themes

### 3.1 Theme matrix

`frontend/src/tokens.css` is the source of truth. Each theme defines a complete
palette; no theme inherits from another.

| Token | Gilded | Dark bento | Sage | Copper |
|---|---|---|---|---|
| `background` | `#060B13` | `#090909` | `#0B120F` | `#FAF7F2` |
| `surface` | `#0B121E` | `#0F0F0F` | `#111B17` | `#F3EDE4` |
| `surface-inset` | `#08101C` | `#0B0B0B` | `#0D1713` | `#EFE7DB` |
| `control` | `#111B2B` | `#161616` | `#182520` | `#EBE2D6` |
| `hairline` | `#19263A` | `#222222` | `#22322B` | `#DFD4C6` |
| `border-subtle` | `#24354F` | `#2A2A2A` | `#2D4138` | `#D2C3B2` |
| `text` | `#F3F6FA` | `#F5F5F4` | `#F2F5F0` | `#1F1B18` |
| `text-muted` | `#8FA3BE` | `#9CA3AF` | `#9BB0A5` | `#685D55` |
| `gilt` (accent) | `#D4AF72` | `#C5A073` | `#D4AF72` | `#A84A28` |
| `gilt-bright` | `#E5C58A` | `#D2B187` | `#E6C792` | `#C4623D` |
| `ocean` (secondary) | `#38BDF8` | `#A8895D` | `#6EE7B7` | `#C4623D` |
| `status-final` | `#2DD4BF` | `#4ADE80` | `#6EE7B7` | `#2B7A58` |
| Display face | Cormorant | Inter | Cormorant | Cormorant |
| `color-scheme` | dark | dark | dark | light |

Status mapping (D22): favorite → `gilt`; final → `status-final`; wip →
`status-wip`; draft → `status-draft`. The accent and status colors must stay
separable in every theme.

### 3.2 Type

- **UI** — Inter (system-ui, sans-serif): body, dense UI, labels and data.
- **Display** — Cormorant Garamond (local stack; Georgia fallback) for gilded,
  sage and copper; **Inter** for dark bento. Used for entity titles, empty
  states, ingest/drop headings and quote-like moments, never dense data rows.
- **Eyebrow** — 10px, weight 600, tracking 0.16em, uppercase, `gilt`.
- **Headings** — serif 400 at 24–34px in serif themes; sans 500 in dark bento.
- Scale (px): caption 10 · body 13 · body-large 15 · subheading 17 · heading 22
  · display 34. Data figures use tabular numerals.

### 3.3 Space, radius, elevation, effects

- Spacing base **4px**; all gutters/paddings are multiples.
- Radius **6/8/12px** for gilded, dark bento and sage (controls/frames/modals);
  ivory copper tightens to **4/6/10px**. Pills are `9999px`.
- Elevation **flat**; double frames do the framing work in gilded, sage and
  copper. Dark bento has no inner rules. Only floating layers cast a shadow;
  copper uses a warm, lighter shadow.
- **No blur, no grain, no glass.** The optional gallery atmosphere is a gilded
  WebGL ring; the other themes use a static themed wash. All are hidden in the
  reduced-effects state.
- Glow is reserved for live/selected marks; dark bento disables the glow.

### 3.4 Material tokens

| Token | Role | Gilded | Dark bento | Sage | Copper |
|---|---|---|---|---|---|
| `--inner-rule-display` | inset card hairline | `block` | `none` | `block` | `block` |
| `--header-rule-display` | second header hairline | `block` | `none` | `block` | `block` |
| `--gilt-fill` | primary action | gold gradient | solid gold | brass gradient | copper gradient |
| `--accent-glow` | selection/glow | gold | transparent | brass | copper |
| `--selection` | text selection | gold 26% | gold 24% | brass 24% | copper 20% |
| `--scrim` | media caption chip | navy | charcoal | forest | warm black |
| `--shadow-float` | toolbar/popover | black | black | black | warm brown |

Structural differences live in `frontend/src/themes.css`: brand marks (sunburst,
square, diamond), glyph geometry (diamond vs square), the sage nav diamond and
the copper light-theme caption text. Do **not** fork component CSS per theme.

### 3.5 Switching

- `data-theme` on `<html>`: `gilded` · `dark-bento` · `sage` · `copper`.
- Resolution: `?theme=` → `localStorage['gildex-ui-theme']` → `gilded`.
- The header theme picker persists the choice and mirrors it into the URL.
- `design/compare.html` shows all four themes in a 2×2 board of scaled
  1440×900 viewports. Point it at the app with `?base=http://localhost:8080/`
  (or `:5173` for Vite); each pane has its own theme selector and full-size
  link.

## 4. Component treatments

- **Grid cell** — the only saturated, opaque object on the wall; hairline
  gutter; no card chrome; 6px radius (4px in copper).
- **Selection** — 2px accent ring. Gilded, sage and copper add a corner tick;
  dark bento hides it.
- **Focus** — 1px `text-muted` full-cell outline; always visible; distinct from
  selection.
- **Hover** — theme sheen (`--sheen`); never a heavy gold wash.
- **Hover-play (D18)** — precomputed frame strip, cycled within the cell,
  ~120ms after settle.
- **Badges (D22)** — favorite top-right as an accent diamond (square in dark
  bento); rating/status bottom-left on the scrim chip.
- **Presence** — accent diamonds mark section labels, active nav items and live
  marks in gilded, sage and copper; dark bento uses squares.
- **Kind** — video: hover-play; audio: rough spectrogram (D42).
- **Framed card** — gilded, sage and copper use an accent border plus an inset
  hairline; dark bento uses a single subtle border.
- **Gilt seam** — panel resize handles: 1px accent border at rest, accent on
  hover/drag with a stepped tick at midpoint.
- **Pill control** — `surface` fill, `border-subtle`; active is accent-dim
  fill, accent border, accent-bright text.
- **Primary action** — one per surface (Inspect, Import, Create, Save): gradient
  in gilded/sage/copper, solid gold in dark bento.
- **Serif accent** — entity titles and the ingest drop line in serif themes;
  gold/brass/copper italic for one editorial accent per screen. Dark bento is
  fully sans.
- **Inspector plaque** — gallery label, not dashboard: accent eyebrow, title,
  prompt block, quiet parameter spec line.
- **Chips** — inline `[[…]]` → accent pill with muted text; active tag filters
  carry an accent dismiss glyph.
- **Toast** — control chip bottom-center, accent left edge.
- **Empty / first-run** — accent ornament + display line + "pick root → drag
  here." The one place ornament may be prominent.
- **Missing file** — muted placeholder + `danger` tick; never deleted.

## 5. Guardrails

- **Token contract.** Components consume semantic tokens. Theme packs define
  values, not copied component rules. If a difference is a value, add a token;
  if it is a shape, use `themes.css`; never duplicate a component.
- **Four themes, not six.** The remaining mockups in `design/` are references,
  not shipped themes. Add a theme only with a full palette and a design owner.
- **Matte contract.** No blur, grain or glass on chrome; grid opaque; shadows
  only on floating layers. The gilded atmosphere is the only shader; the other
  themes use CSS. All effects are off in reduced mode.
- **Gilding dosage.** Accent frames mark structure and one primary action; the
  wall never fills with accent. The secondary accent stays secondary (progress,
  histogram, status).
- **Deco dosage.** Motifs only in quiet moments and at frame joints — never on
  or around items.
- **A11y.** WCAG contrast for `text`/`text-muted` against `background` in all
  four themes, especially copper; visible focus everywhere; keyboard-reachable.
  Serif is display-only.
- **Thin chrome.** Native menus/dialogs; custom UI only on grid + inspector; no
  component library, no per-theme component forks, no heavy animation.

## 6. Do's and Don'ts

- **DO** recede — if an element draws the eye before the nearest image, it is
  wrong.
- **DO** use the tokens as written; never invent a color, face, radius, or
  shadow in a component.
- **DO** keep one code path for all themes; test the affected surface in the
  2×2 compare board.
- **DO** reserve the accent gradient/solid for the single primary action.
- **DON'T** add a light/dark mode switch; a theme is a complete appearance.
- **DON'T** fork a component's CSS per theme or load different markup.
- **DON'T** frost, blur, grain or animate chrome.
- **DON'T** set body copy or data in the serif face.
- **DON'T** use the secondary accent as a surface fill.
- **DON'T** accent every list row; framed borders are for active/expanded
  items.
- **DON'T** render raw metadata blobs; show only known fields.
- **DON'T** use framework shorthand ("rounded-xl"); state values in plain
  language.

## 7. Traceability

Grid/perf (D14), hover-play (D18), badges (D22), audio spectrogram (D42),
inspector/story (D7, D9), native chrome (D35), zero network (D5), token theming
(UI direction). Reference mockups: the four files listed at the top.
Side-by-side board: `design/compare.html`.
