# GILDEX — UI Layout

Status: Draft v0.1 · Last updated: 2026-11-12

The window frame. Traceable to `00-decisions.md` (`D#`). Visual treatment
(tokens, type, material) lives in `05-ui-design-language.md`; this document
only fixes *what goes where*. Naming: **Left rail / Main grid / Right preview**
(replaces the old A/B/C letters, which collided across drafts).

## 1. The three-panel frame

```
┌──────────────────────────────────────────────────────────┐
│ header  ·  surface tabs  ·  ⚙                           │  frosted
├────────────┬─────────────────────────────────┬───────────┤
│            │  search [/]                     │           │
│  LEFT RAIL │ ──────────────────────────────  │  RIGHT    │
│  (nav +    │                                 │  PREVIEW  │
│  surface   │          MAIN GRID              │ (quick    │
│  content)  │         (active surface:        │  preview, │
│            │    sessions · timeline ·        │  toggle)  │
│            │    collections · folders ·      │           │
│            │    tags → items)                │           │
│            │                                 │           │
├────────────┴─────────────────────────────────┴───────────┤
│ footer · density/zoom control                             │
└──────────────────────────────────────────────────────────┘
```

- **Main grid** is the default center of attention; it always shows the *active
  surface's* items (D6: sessions-first default, timeline/folders/tags/
  collections alternate; choice remembered).
- **Left rail** and **Right preview** are frosted fixed chrome; the grid is
  opaque.

## 2. Left rail

Two stacked regions:

1. **Nav section** — the surface switcher, one entry each: **Sessions ·
   Timeline · Collections · Folders · Tags**. Selecting one swaps the Main
   grid's surface and (where applicable) the content below. Sessions-first is
   the default (D6).
2. **Surface content** — depends on the active surface:
   - *Folders* — a path-tree browse view, **directories only** (no files).
   - *Tags* — a **scrollable vertical list** of tags, with a filter box above
     for large vocabularies.
   - *Sessions / Collections* — their respective lists.
   - *Timeline* — no list; the rail collapses to the nav section.

Clicking a tag **applies it as a filter chip** (multi-select, AND) to the Main
grid rather than switching surface (D23); the **Tags** surface exists to browse
the vocabulary itself.

## 3. Main grid

The active surface's full item grid (virtualized, hover-play, badges — see
`05-ui-design-language.md`). It is always the complete result set for the
current surface + active filters; it is never a thumbnail strip or a summary.

- **Search** — a borderless input spanning the top of the grid column, above
  the items. `/` focuses it. Drives full-text search plus tag filters (D23).

## 4. Right preview

A persistent, **toggleable** quick preview — read-only triage, *not* the deep
inspector (notes/regions/references/attachments stay in the separate inspector
surface, D7). Owner-polymorphic by current selection:

| Selection | Right preview shows |
|---|---|
| **Item** (media) | Large preview + **prompt / model** (gen only) + **file metadata** (kind, format, dimensions, size, duration) + favorite/rating/status (D22). Non-gen items degrade to media + file metadata (no empty prompt panels). |
| **Session** | Name + time range + item count + compact thumbnail strip (D20). |
| **Collection** | Name + description + item count + compact thumbnail grid (D21). |
| **Folder / Tag** | Hidden (browse views, not entities), or a minimal count line. |

## 5. Sizing & persistence

- Left rail ≈ **220 px**, collapsible; Right preview ≈ **300 px**, toggleable
  (keypress); both resizable via the gilt-seam handle.
- Widths, active surface, and density preset are **remembered per surface**.
- Panel split-lines carry the gilt hairline + stepped tick (see design language).

## 6. Explicitly not here

The deep **inspector** (notes, regions, references, attachments) is a separate
screen / detached window (D7). The **batch toolbar** floats over the grid when a
selection exists (D24). Neither is part of this fixed frame.
