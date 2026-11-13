# GILDEX — Architecture

Status: Draft v0.1 · Last updated: 2026-11-12

The data model, storage layout, and import pipeline. Every structural choice here
traces to a settled decision in `00-decisions.md`; the reference is cited inline
as `D#`.

## 1. Overview

One Go process owns everything (D30): it serves the React frontend (D31/D34),
runs the import/indexing pipeline, and talks to SQLite (D32) and FFmpeg (D33).
The catalog is a single database + a set of derived on-disk caches, all inside
one relocatable library root (D13).

```
library root/
├── catalog.db           # SQLite (items, sessions, tags, collections, context, trash)
├── thumbnails/<hash>/   # pre-generated thumbnails + hover frames (D14, D18)
├── attachments/<hash>/  # managed attached files, immutable (D15)
├── _inbox/              # designated watcher inbox (D40)
└── <user media>/        # referenced in place, relative paths (D1)
```

## 2. Identity & lifecycle

- **Item identity = content hash (SHA-256) + UUID**, never the path (D1). The
  hash is the stable identity for move detection and dedup; the UUID is the
  stable foreign-key target so the hash can be recomputed without breaking links.
- **Paths are relative** to the root. Resolution is `root + relative_path`.
- **Move detection** (D1): on scan, a file whose hash matches an existing item
  but whose path differs is re-attached to the new path — within the root only.
- **Missing-file state** (D1): if an item's file disappears, the item is marked
  `missing` and the grid shows a placeholder. It is not deleted.
- **Trash** (D4, D38): remove-from-catalog writes a content-hash tombstone; the
  item record and its context cascade off, but the tombstone blocks rediscovery.
  Restore removes the tombstone.

## 3. Data model

Tables and their notable columns. No polymorphic foreign keys (SQLite
limitation); integrity is enforced in the application layer (D10).

### 3.1 Item

| Column | Notes |
|---|---|
| `id` | UUID |
| `content_hash` | SHA-256, unique |
| `relative_path` | within root |
| `kind` | `image` \| `video` \| `audio` (D17) |
| `format` | detected container/codec |
| `file_size` | bytes |
| `timestamp` | file creation time; organization anchor (D12) |
| `width`, `height` | item-level, from the file (D9 tier 2) |
| `duration` | video/audio, nullable |
| `phash` | perceptual hash (D2) |
| `favorite` | bool (D22) |
| `rating` | 1–5 (D22) |
| `status` | `draft` \| `final` \| `WIP` (D22) |
| `state` | `present` \| `missing` (D1) |
| *canonical gen fields* | `prompt`, `negative_prompt`, `model_name`, `seed`, `steps`, `sampler`, `cfg_scale`, `generated_at`; each carries a `parsed` \| `manual` provenance flag (D9 tier 1, D41) |

### 3.2 Metadata (D9)

- **`raw_metadata`** — `(item_id, kind, parser_name, parser_version, blob)`. The
  untouched original (A1111 `parameters`, ComfyUI workflow JSON); never rendered.
- **`metadata_kv`** — `(item_id, kind, key, value, provenance)`. Non-indexed
  arbitrary fields (LoRA, VAE, model_hash, …); displayable by known key (D9 tier
  3). `provenance` is `parsed` \| `manual` (D41).

### 3.3 Session (D6, D20)

- `id`, `label`, `starts_at`, `ends_at`. Membership is derived by time-gap
  clustering (default 2 h, D20) and may be manually overridden. Sessions are
  first-class indexes and context owners.

### 3.4 Tags & Collections (D6, D21)

- **`tag`** — `id`, `name` (unique). `item_tag` join table.
- **`collection`** — `id`, `name`, `description`. `collection_item` join carries
  an explicit `position` so manual drag-order persists (D21); time-order is the
  default and a view option.

### 3.5 Context layer (D8, D10)

- **`note`** — `(owner_type, owner_id, body, type_label, created_at, updated_at)`.
- **`reference`** — `(owner_type, owner_id, target_kind, target_id/target_path/target_url, label)`.
  Standalone references (D11). Inline `[[…]]` tokens are resolved inside note
  markdown at display time.
- **`attachment`** — `(owner_type, owner_id, content_hash, original_name, size, mime)`.
- **`region`** — `(item_id, shape, coords, label, color)`. Item-only owner (D10).
  `shape` ∈ rect / polygon / point; `coords` normalized to [0,1] (D37).

`owner_type` ∈ `item` | `session` | `collection`.

### 3.6 Trash & lineage

- **`tombstone`** — `(content_hash, removed_at)` (D4, D38).
- **`lineage_edge`** — `(parent_id, child_id, edge_type)`. **Deferred** (D11);
  modeled now only to confirm it is separate from references.

## 4. Storage layout

- **Catalog DB** — `modernc.org/sqlite`, FTS5 virtual tables for the searchable
  text (D23, D32).
- **Thumbnails** — pre-generated, fixed sizes, keyed by content hash; plus a
  frame strip for hover-play (D14 rule 1, D18). Decoded by Go `image`/`x/image`
  for stills, FFmpeg for video/audio/animated (D33).
- **Attachments** — copied into `attachments/<hash>/`, immutable; files removed
  only by explicit confirmed cleanup (D15).
- **Inbox** — `_inbox/` under the root, watched and referenced in place (D40).

## 5. Import & indexing pipeline

Stages, each a resumable, yield-aware background job (D14):

1. **Discover** — manual scan of chosen folders, or watcher events from `_inbox/`
   (D3, D16/D40).
2. **Hash** — SHA-256; identity and dedup (D1).
3. **Parse metadata** — per-format parsers (A1111, ComfyUI, …) fill canonical
   fields + `metadata_kv` and persist the raw blob (D9). Non-gen files skip.
4. **Extract** — dimensions (Go `image`), duration/thumbnail/frames (FFmpeg),
   pHash (D2, D33, D18).
5. **Timestamp** — file creation time (D12).
6. **Classify** — kind (image/video/audio), format, and small-file→attachment.
7. **Cluster** — time-gap sessions (D20), pHash near-dup grouping (D2/D39).
8. **Index** — FTS rows and faceting columns; thumbnails written to disk.

The pipeline is **idempotent** — re-import never overwrites user-authored data;
re-parse overwrites only `parsed` (parser-derived) fields, never `manual` edits
(D41).

## 6. Search

One search box = tag filters + FTS5 over prompt, negative prompt, note text,
filename, session name, collection name (D23, D32). Faceting over `model_name`,
`rating`, `status`, `kind`, and tags.

## 7. Integrity & consistency

- **On open:** verify root presence; reconcile orphaned context records to a
  "missing owner" state; recompute the missing-file state (D10).
- **Cascades:** remove-from-catalog cascades notes/references/attachments/regions
  and writes the tombstone (D4).
- **No destructive defaults:** nothing on disk is ever deleted automatically
  (D4, D15).

## 8. Concurrency model

A single background job scheduler (goroutine pool + resource budget) runs hash,
thumbnail, frame, and pHash work, throttled to yield to local generation (D14).
The UI and DB stay responsive via the job queue and incremental results.
