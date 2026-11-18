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
- **Paths are relative** to the source (or library root for inbox items).
  Resolution is `source.path + relative_path` (or `root + relative_path`).
  The absolute path is also snapshotted as `origin_path` at import, so a
  missing item still shows where it came from after its source is removed.
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
| `relative_path` | within the source or library root |
| `origin_path` | absolute path captured at last import; fallback clue when the source is removed |
| `kind` | `image` \| `video` \| `audio` (D17) |
| `format` | detected container/codec |
| `file_size` | bytes |
| `timestamp` | file creation time; organization anchor (D12) |
| `width`, `height` | item-level, from the file (D9 tier 2) |
| `duration` | video/audio, nullable |
| `phash` | perceptual hash (D2) |
| `favorite` | bool (D22) |
| `rating` | 1–5 (D22) |
| `status` | `idea` \| `draft` \| `final` \| `WIP` (D22) |
| `state` | `present` \| `missing` (D1) |
| *canonical gen fields* | `prompt`, `negative_prompt`, `model_name`, `seed`, `steps`, `sampler`, `cfg_scale`, `generated_at`; each carries a `parsed` \| `manual` provenance flag (D9 tier 1, D41) |

### 3.2 Metadata (D9)

- **`raw_metadata`** — `(item_id, kind, parser_name, parser_version, blob)`. The
  untouched original (A1111 `parameters`, ComfyUI workflow JSON); never rendered.
- **`metadata_kv`** — `(item_id, kind, key, value, provenance)`. Non-indexed
  arbitrary fields (LoRA, VAE, model_hash, …); displayable by known key (D9 tier
  3). `provenance` is `parsed` \| `manual` (D41).

### 3.3 Session (D6, D20, D45)

- `id`, `label`, `starts_at`, `ends_at`, `favorite`, `rating`, `status`.
  Membership is derived by time-gap clustering (default 2 h, D20) and may be
  manually overridden. Sessions are first-class indexes and context owners.
  Triage and tags belong to the session itself, not its items.

### 3.4 Episodes (nested grouping, D46)

- **`episode`** — `id`, `owner_type` ∈ session | collection, `owner_id`, `label`,
  `position`, `auto`, `created_at`. Episodes are a second level of grouping
  *inside* a group: a session or collection may contain episodes, and items with
  no near-duplicates stay unassigned. `episode_item` carries `(episode_id,
  item_id, position)`; an item belongs to at most one episode of a given owner.
- Manual is the source of truth: create/rename/delete/assign are user actions.
  `auto=1` marks an episode produced by pHash clustering. Any manual edit —
  rename, assignment, or removal — flips it to `auto=0`, and clustering never
  rebuilds or consumes manual episodes (their items are excluded from the pass).
- Clustering is union-find over items with a non-zero pHash: Hamming distance
  ≤ `phashThreshold` (D39), components of size ≥ 2 become auto episodes.
  A rebuild only deletes `auto=1` rows. Candidate scans are capped at 5 000
  items per owner.
- Episode order is creation/position order (drag reordering is not part of this
  slice). Episodes are cleaned up when their owner disappears (session recluster,
  collection delete) and stale members are pruned with the owner.
- In the grid an episode is a collapsible section: clicking its card expands the
  members in place, like a group tile. Automatic episodes can be regenerated on
  demand from the episode editor, an episode card's context menu, or Settings →
  Behavior; regeneration rebuilds only `auto=1` episodes, so user-authored ones
  are never touched.
- Expanded groups and expanded episodes break to a new row: their items spill
  into the shared grid flow, and the next group tile or episode section starts
  on the following row. Turning the automatic-episodes setting off removes
  existing `auto=1` episodes (manual episodes and items stay); it can be turned
  back on and regenerated on demand.

### 3.5 Tags & Collections (D6, D21, D45)

- **`tag`** — `id`, `name` (unique, case-insensitive). `item_tag` join table.
  **`group_tag`** carries group-owned assignments (`owner_type` ∈ session |
  collection) from the same vocabulary; it never affects item tags, filters, or
  item counts. Families are **derived, not stored**: the prefix before the
  first `:` (valid namespace characters only) is exposed as `family` on the API
  tag object.
- **`collection`** — `id`, `name`, `description`, plus the same group triage as
  sessions (`favorite`, `rating`, `status`). `collection_item` join carries an
  explicit `position` so manual drag-order persists (D21); time-order is the
  default and a view option.

Tag vocabulary transfer (D44) lives in `GET /api/tags/export` (versioned JSON
envelope with names, derived families, informational counts) and
`POST /api/tags/import` (case-insensitive merge in one transaction; never
deletes, renames, or touches `item_tag`/`group_tag`).

### 3.6 Context layer (D8, D10)

- **`note`** — `(owner_type, owner_id, body, type_label, created_at, updated_at)`.
- **`reference`** — `(owner_type, owner_id, target_kind, target_id/target_path/target_url, label)`.
  Standalone references (D11). Inline `[[…]]` tokens are resolved inside note
  markdown at display time.
- **`attachment`** — `(owner_type, owner_id, content_hash, original_name, size, mime)`.
- **`region`** — `(item_id, shape, coords, label, color)`. Item-only owner (D10).
  `shape` ∈ rect / polygon / point; `coords` normalized to [0,1] (D37).

`owner_type` ∈ `item` | `session` | `collection`.

### 3.7 Trash & lineage

- **`tombstone`** — `(content_hash, removed_at)` (D4, D38).
- **`lineage_edge`** — `(parent_id, child_id, edge_type)`. **Deferred** (D11);
  modeled now only to confirm it is separate from references.

### 3.8 Library settings

- **`settings`** — `(key, value)`. Library-scoped preferences stored inside the
  catalog so they travel with the `.gildex` bundle. Typed access lives in
  `internal/store/settings.go`; unknown keys are ignored. Current keys:
  `sessionGapMinutes` (default 120, range 15–1440, D20), `blurNsfw`, `nsfwTag`,
  `phashThreshold` (default 10, range 0–64, D39) and `autoClusterEpisodes`
  (opt-in: rebuild auto episodes after every import; turning it off removes
  existing automatic episodes).

Device-scoped presentation preferences (theme, effects, grid zoom) do **not**
belong here; they stay in browser `localStorage`.

## 4. Storage layout

- **Catalog DB** — `modernc.org/sqlite`, FTS5 virtual tables for the searchable
  text (D23, D32).
- **Thumbnails** — pre-generated, fixed sizes, keyed by content hash; plus a
  frame strip for hover-play (D14 rule 1, D18). Decoded by Go `image`/`x/image`
  for stills, FFmpeg for video/audio/animated (D33).
- **Attachments** — copied into `attachments/<hash>/`, immutable; files removed
  only by explicit confirmed cleanup (D15).
- **Inbox** — `_inbox/` under the root, watched and referenced in place (D40).
- **Settings** — library-scoped preferences in the `catalog.db` settings table;
  presentation preferences in browser `localStorage`.

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
