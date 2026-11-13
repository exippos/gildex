# GILDEX — Visual Style

Status: Draft v0.2 · Last updated: 2026-11-13

The condensed visual style — tokens and treatments only. The full system,
interaction defaults, and fork rationale live in
`ui-design-prototype-v1.md`; the Stitch/DESIGN.md manifest lives in
`stitch-master-prompt.md`. This is the quick-reference sheet for any agent or
human building screens.

Active direction: **editorial matte**, ported from
`design/editorial-matte-bento-ui.html` (charcoal + gold, flat surfaces, pill
controls, editorial sans). Layout is unchanged from `05-ui-layout.md`.

## 1. North star

**Absolute visual silence — the interface is an invisible gallery frame.**

The artwork is the only saturated, opaque object on screen; everything else is
matte material that recedes. **Gilt is an edge — and the action:** the accent
appears as a hairline, tick, square, ring or underline; one solid gold fill is
allowed per screen for the primary action.

## 2. Three layers

| Layer | Role | Expression |
|---|---|---|
| Scandinavian minimalism | Structure | 4px space, hairline borders, low contrast |
| Editorial matte | Material | flat charcoal panels, no blur or grain, 8px cards, pill controls |
| Art Deco | Framing | thin gilt rules, 6px gold squares, light editorial headings |

## 3. Tokens

### 3.1 Color — the charcoal-gold family

Dark ("matte charcoal") is default; light ("ivory matte") is secondary. Gold
and status colors are shared across both; only neutrals shift.

| Token | Dark | Light | Role |
|---|---|---|---|
| `background` | `#090909` | `#F6F3ED` | app canvas / gallery wall |
| `surface` | `#0F0F0F` | `#FFFDF9` | fixed chrome (header, rail, preview) |
| `surface-inset` | `#0B0B0B` | `#F0ECE4` | wells, media beds, folder tree |
| `control` | `#161616` | `#F1EDE5` | inputs, pills, cards, popovers |
| `hairline` | `#222222` | `#E0DBD1` | borders, gutters |
| `border-subtle` | `#2A2A2A` | `#D5CFC4` | control borders |
| `border-strong` | `#3A3A3A` | `#C2BBAE` | hover borders |
| `text` | `#F5F5F4` | `#171614` | primary text |
| `text-muted` | `#9CA3AF` | `#6F6B63` | secondary labels |
| `text-faint` | `#525252` | `#9A948A` | placeholders, metadata |
| `gilt` | `#C5A073` | `#9E7836` | accent, favorite, selection, primary action |
| `gilt-bright` | `#D2B187` | `#7F5F25` | hover / active only |
| `on-gilt` | `#090909` | `#FFFDF9` | text on a solid gold fill |
| `status-final` | `#4ADE80` | `#3F7D5C` | emerald green |
| `status-wip` | `#D08C57` | `#A97648` | clay amber |
| `status-draft` | `#9CA3AF` | `#6F6B63` | neutral |
| `danger` | `#E0655B` | `#A4574E` | destructive, missing, purge |

Status mapping (D22): favorite → `gilt`; final → `status-final`; wip →
`status-wip`; draft → `status-draft`. Guardrail: favorite, WIP, and the accent
must stay separable — favorite = full gilt, WIP = clay, accent = edge or the
single primary action.

### 3.2 Type

- **UI & display** — Inter (system-ui, sans-serif): the serif display face is
  retired. Zero-network policy: use the local stack, never fetch a webfont.
- **Eyebrow** — 10px, weight 600, tracking 0.12em, uppercase; section labels,
  kickers and control labels.
- **Headings** — weight 200 with negative tracking (−0.02em); quiet, not bold.
- Scale (px): caption 10 · body 13 · body-large 15 · subheading 17 · heading 22
  · display 30. Data figures use tabular numerals.

### 3.3 Space, radius, elevation, effects

- Spacing base **4px**; all gutters/paddings are multiples.
- Radius **6px** (controls, cells, thumbs) / **8px** (cards, popovers, panels)
  / **12px** (modals, floating toolbars) / **9999px** (pills). Pills are for
  filters, modes, status and search — not for cards.
- Elevation **flat** — panels are a hairline border on a matte fill. Only
  floating layers (modal, batch toolbar, popovers) cast a wide soft shadow.
- **No blur, no grain, no specular, no glass.** Fixed chrome is a flat surface
  fill. The optional gallery atmosphere is the only moving material and is off
  in the reduced-effects state.

### 3.4 Token file

```css
:root {
  --bg: #090909;
  --surface: #0f0f0f;
  --surface-inset: #0b0b0b;
  --control: #161616;
  --control-hover: #1c1c1c;
  --hairline: #222222;
  --border-subtle: #2a2a2a;
  --border-strong: #3a3a3a;
  --text: #f5f5f4;
  --text-muted: #9ca3af;
  --text-faint: #525252;
  --gilt: #c5a073;
  --gilt-bright: #d2b187;
  --on-gilt: #090909;
  --status-final: #4ade80;
  --status-wip: #d08c57;
  --status-draft: #9ca3af;
  --danger: #e0655b;
  --focus: #c5a073;
  --space: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 9999px;
  --font-ui: "Inter", system-ui, sans-serif;
}
```

Light mode overrides only the neutrals plus `--on-gilt`.

## 4. Component treatments

- **Grid cell** — the only saturated, opaque object on the wall; hairline
  gutter; **no card chrome, no borders, no shadows**; 6px radius.
- **Selection** — 2px `gilt` ring + corner tick (museum-label corner).
- **Focus** — 1px `text-muted` full-cell outline; always visible; distinct from
  selection.
- **Hover** — neutral lift (`rgba(245,245,244,0.06)`), never a gold wash or
  specular band.
- **Hover-play (D18)** — precomputed frame strip, cycled within the cell,
  ~120ms after settle.
- **Badges (D22)** — favorite top-right (`gilt` square), rating/status
  bottom-left on a dark chip.
- **Presence** — the 6px gold square marks section labels and the active nav
  item; toggleable deep-layer content keeps a stepped tick.
- **Kind** — video: hover-play; audio: rough spectrogram (D42). No other glyphs.
- **Gilt seam** — panel resize handles: 1px hairline at rest, `gilt` on
  hover/drag with a stepped tick at midpoint.
- **Pill control** — bordered `control` fill, 10px uppercase label; active state
  brightens text and border. Used for surface tabs, status, tag chips, search.
- **Primary action** — solid `gilt` fill with `on-gilt` text, 6px radius; one per
  surface (Inspect, Set root, Save).
- **Inspector plaque** — gallery label, not dashboard: eyebrow headings, 200
  weight title, prompt block, quiet parameter spec line.
- **Chips** — inline `[[…]]` → pill with muted text; active tag filters carry a
  gold dismiss glyph.
- **Toast** — matte `control` chip bottom-center, gilt left-edge.
- **Empty / first-run** — gold square ornament + 30px/200 weight line + "pick
  root → drag here." The one place ornament may be prominent.
- **Missing file** — muted placeholder + `danger` tick; never deleted.

## 5. Guardrails

- **Matte contract.** No blur, grain, specular or glass on chrome; grid opaque;
  shadows only on floating layers. No runtime shaders except the optional
  gallery atmosphere (prototype; hidden in reduced effects), no WebGL elsewhere,
  no animation.
- **Deco dosage.** Motifs only in quiet moments and at frame joints — never on
  or around items.
- **A11y.** WCAG contrast for `text`/`text-muted` vs `background`; visible
  focus everywhere; keyboard-reachable.
- **Thin chrome.** Native menus/dialogs; custom UI only on grid + inspector; no
  component library, theme engine, or heavy animation.

## 6. Do's and Don'ts

- **DO** recede — if an element draws the eye before the nearest image, it is
  wrong.
- **DO** use the tokens as written; never invent a color, face, radius, or
  shadow.
- **DO** reserve gold fill for the single primary action; everything else is an
  edge.
- **DON'T** frost, blur, grain or animate chrome.
- **DON'T** use serif or small-caps; the editorial voice is uppercase tracking,
  not engraved type.
- **DON'T** pill cards or panels — pills are controls only.
- **DON'T** render raw metadata blobs; show only known fields.
- **DON'T** use framework shorthand ("rounded-xl"); state values in plain
  language.

## 7. Traceability

Grid/perf (D14), hover-play (D18), badges (D22), audio spectrogram (D42),
inspector/story (D7, D9), native chrome (D35), zero network (D5), thin theming
(UI direction). Reference mockup: `design/editorial-matte-bento-ui.html`.
