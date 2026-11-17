# GILDEX — Feature List

Status: Draft v0.1 · Last updated: 2026-11-12

Scoped capabilities, priorities, and the v1 vs. later boundary. Traceable to
`00-decisions.md` (`D#`). This document is *what* exists; `03-architecture.md`
is *how* it is built, and `05-ui-design-language.md` is *how it feels*.

## 1. Prototype slice

The first buildable milestone: **story view + notes** (D8), manual import only
(D3), browser-served (D31). Everything else lands later in v1.

**Success criterion:** the grid + sessions experience — smooth virtualized
scroll and a compelling session story — is what the prototype exists to prove.
Breadth is secondary.

## 2. v1 scope (D28)

### 2.1 Library & import
- Manual scan/import of folders; "rescan now" (D3).
- Designated in-root inbox with optional yield-aware watcher (D16, D40).
- Single relocatable root; "relocate library" action (D13).
- Content-hash identity, move detection, missing-file states (D1).
- Trash list: remove-from-catalog, restore, purge — never deletes disk files (D4, D38).

### 2.2 Browsing & organization
- Sessions-first browsing; timeline, folders, tags, collections as alternate
  surfaces (D6).
- Time-gap sessions, 2 h default, adjustable (D20).
- Tags (create, apply, batch); families come from the `family:name` convention.
- Collections with time-default order + manual drag (D21).
- Near-duplicate grouping via pHash, threshold slider (D2, D39).
- Virtualized grid; hover-play for animated/video (D14, D18).

### 2.3 Inspection (deep layer)
- Owner-polymorphic inspector — item / session / collection — hybrid
  screen + detached window (D7).
- Story view (generation parameters, per-format parsers) (D9).
- Notes (markdown, type labels) (D8).
- References: inline `[[…]]` + standalone list (D11, D26).
- Attachments: any type, tiered previews, managed hash-addressed storage
  (D15, D36, D26).
- Regions: rect / polygon / point, normalized coords, on still images (D37, D26).
  Rollout order: References → Attachments → Regions (D26).

### 2.4 Search & filter
- Tag filters + full-text search (FTS) over prompt, negative prompt, note text,
  filename, session/collection names (D23).
- Facets: model, rating, status, kind, tags.

### 2.5 Item fields
- Favorite, rating (1–5), status (idea / draft / final / WIP) (D22).

### 2.6 Batch operations
- Multi-select toolbar: tag, add-to-collection, assign-session,
  favorite/rate/status, remove-from-catalog (D24).

### 2.7 Media support
- Images, short videos, and audio as first-class grid items (D17).
- Guaranteed stills PNG/JPEG/WebP; video MP4/WebM; audio WAV/MP3/FLAC (D19, D33).

### 2.8 Safety & consistency
- Zero network; URL references open in system browser (D5).
- Undo for last N actions + restore-from-trash (D27).

### 2.9 Settings
- One header entry point (⚙) opening a sectioned settings panel: Appearance,
  Library, Sources, Tags, Behavior, About.
- **Device preferences** in `localStorage`: theme, effects mode, gallery zoom.
- **Library preferences** in the catalog DB, portable with the `.gildex`
  bundle: session inactivity gap (D20, default 2 h, adjustable), applied by an
  explicit **Apply & recluster** action.
- Library info (name, root, bundle id, schema/app version, counts) plus
  create/open actions. Media-source management is shared with the Ingest
  workspace.
- **Tag vocabulary import/export** (D44): versioned JSON export plus merge-only
  import from JSON or a one-per-line text list. Names only; item assignments
  stay in the library.
- pHash similarity threshold (D39) is deferred until near-duplicate grouping
  exists; session-gap reclustering warns that manual session assignments may be
  recomputed.

## 3. Deferred (post-v1) — D28

Lineage (`lineage_edge`), auto-tagging, embeddings/semantic search, multi-library,
multiple roots, nested collections, tag aliases/implications, user-assigned
family colours, video regions, advanced query syntax, consolidated/archive
export, eco mode.

## 4. Priority summary

| Priority | Capability | Decision |
|---|---|---|
| P0 (prototype) | Story view + notes, manual import | D8, D3 |
| P1 | References → Attachments → Regions | D26 |
| P1 | Sessions, tags, collections, batch toolbar | D20–D24 |
| P1 | Search (tags + FTS), favorite/rating/status | D23, D22 |
| P1 | Settings: appearance, library, sources, tags, session gap | D20, D39, D44 |
| P2 | Watcher (inbox), pHash grouping slider | D16, D2/D39 |
| P2 | Audio/video polish, hover-play | D17, D18 |
| Later | Everything in §3 | D28 |
