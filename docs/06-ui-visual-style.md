# GILDEX — Visual Style

Status: Draft v0.1 · Last updated: 2026-11-12

The condensed visual style — tokens and treatments only. The full system,
interaction defaults, and fork rationale live in
`ui-design-prototype-v1.md`; the Stitch/DESIGN.md manifest lives in
`stitch-master-prompt.md`. This is the quick-reference sheet for any agent or
human building screens.

## 1. North star

**Absolute visual silence — the interface is an invisible gallery frame.**

The artwork is the only saturated, opaque object on screen; everything else is
ambient material that recedes. **Gilt is an edge, not a fill** — the accent
appears only as a hairline, a tick, a ring, or an underline, never a solid
block.

## 2. Three layers

| Layer | Role | Expression |
|---|---|---|
| Scandinavian minimalism | Structure | 4px space, hairline borders, low contrast |
| Frosted glass + metal | Material | translucent tinted chrome; static specular hints |
| Art Deco | Framing | thin gilt rules, stepped tick, engraved lettering |

## 3. Tokens

### 3.1 Color — the green-gilt-patina family

Dark ("gilt vault") is default; light ("scandinavian daylight") is secondary.
Gilt and status colors are shared across both; only neutrals shift.

| Token | Dark | Light | Role |
|---|---|---|---|
| `background` | `#0F1713` | `#F4F3EE` | app canvas / gallery wall |
| `surface` | `#16201B` | `#FFFFFF` | opaque fallback for glass |
| `surface-glass` | `rgba(22,32,27,0.55)` | `rgba(255,255,255,0.6)` | frosted chrome |
| `hairline` | `#26322B` | `#D8D5CC` | borders, gutters |
| `text` | `#E6EAE4` | `#1C221E` | primary text |
| `text-muted` | `#93A099` | `#6B726B` | secondary labels |
| `gilt` | `#C6A15B` | — | accent, favorite, selection |
| `gilt-bright` | `#D4AF37` | — | hover / active only |
| `status-final` | `#5E7A6A` | — | patina green |
| `status-wip` | `#A97648` | — | clay amber |
| `status-draft` | `#93A099` | — | neutral |
| `danger` | `#A4574E` | — | destructive, missing, purge |

Status mapping (D22): favorite → `gilt`; final → `status-final`; wip →
`status-wip`; draft → `status-draft`. Guardrail: favorite, WIP, and the accent
must stay separable — favorite = full gilt, WIP = clay, accent = edge-only.

### 3.2 Type

- **UI** — Archivo (system-ui, sans-serif): body and dense UI.
- **Display** — Marcellus (Cinzel, serif): engraved small-caps roman; headings,
  gallery plaque labels, empty states.
- Scale (px): caption 11 · body 13 · body-large 15 · subheading 17 · heading 22 ·
  display 30. Display tracking 0.08em, small-caps.

### 3.3 Space, radius, elevation, effects

- Spacing base **4px**; all gutters/paddings are multiples.
- Radius **2px** (chips, ticks) / **4px** (panels). No pill-radius.
- Elevation **flat** — no drop shadows; "metal" is one static specular gradient;
  panels are hairline border only.
- Blur **12px**, `backdrop-filter` on **fixed chrome only**.
- Density: 3 user presets — contact sheet / default / gallery hang.

### 3.4 Token file

```css
:root {
  --bg: #0F1713;
  --surface: #16201B;
  --surface-glass: rgba(22,32,27,0.55);
  --hairline: #26322B;
  --text: #E6EAE4;
  --text-muted: #93A099;
  --gilt: #C6A15B;
  --gilt-bright: #D4AF37;
  --status-final: #5E7A6A;
  --status-wip: #A97648;
  --status-draft: #93A099;
  --danger: #A4574E;
  --focus: #D4AF37;
  --space: 4px;
  --radius-sm: 2px;
  --radius-md: 4px;
  --blur: 12px;
  --font-ui: "Archivo", system-ui, sans-serif;
  --font-display: "Marcellus", "Cinzel", serif;
}
```

Light mode overrides only the neutrals (`--bg`, `--surface`, `--surface-glass`,
`--hairline`, `--text`, `--text-muted`).

## 4. Component treatments

- **Grid cell** — the only saturated, opaque object on the wall; hairline
  gutter; **no card chrome, no borders, no shadows**.
- **Selection** — 2px `gilt` ring + stepped corner tick (museum-label corner).
- **Focus** — faint full-cell `hairline` outline; always visible; distinct from
  selection.
- **Hover** — faint frosted overlay carrying hover-play + badges; brightens on
  pointer settle, never stroboscopes.
- **Hover-play (D18)** — precomputed frame strip, cycled within the cell,
  ~120ms after settle.
- **Badges (D22)** — favorite top-right (`gilt`), rating/status bottom-left.
- **Presence** — small gold stepped tick marks deep-layer content; toggleable.
- **Kind** — video: hover-play; audio: rough spectrogram (D42). No other glyphs.
- **Gilt seam** — panel resize handles: thin `gilt` hairline + stepped ziggurat
  tick at midpoint; near-invisible at rest, `gilt-bright` on hover/drag.
  Header/footer near the logo: same hairline + single stepped rule.
- **Inspector plaque** — gallery label, not dashboard: engraved heading, prompt
  block, quiet parameter spec line (prompt, negative_prompt collapsed, model,
  seed, steps, sampler, cfg_scale, generated_at, + collapsible additional).
- **Chips** — inline `[[…]]` → gilt hairline underline + muted chip.
- **Toast** — frosted chip bottom-center, gilt left-edge.
- **Empty / first-run** — engraved roman line + stepped motif + "pick root →
  drag here." The one place ornament may be prominent.
- **Missing file** — muted placeholder + `danger` tick; never deleted.

## 5. Guardrails

- **Glass contract (D14).** Blur only on fixed chrome; grid opaque; static
  tint fallback where `backdrop-filter` is unsupported; **no runtime shaders**,
  no WebGL, no animation.
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
- **DON'T** render raw metadata blobs; show only known fields.
- **DON'T** fill with gilt — accent is edge-only.
- **DON'T** use framework shorthand ("rounded-xl"); state values in plain
  language.

## 7. Traceability

Grid/perf (D14), hover-play (D18), badges (D22), audio spectrogram (D42),
inspector/story (D7, D9), native chrome (D35), zero network (D5), thin theming
(UI direction).
