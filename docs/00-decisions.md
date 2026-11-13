# GILDEX — Decisions Log

Status: Living · Last updated: 2026-11-12

Settled decisions, one entry each, with the rationale in a line. The docs cite
these instead of re-deriving them. Newer decisions supersede older ones; when
that happens the older entry is marked superseded rather than deleted.

## D1 — Storage model: in-place references

**Choice.** One configured library root; media referenced by path relative to
the root. Identity is **content hash + UUID**, never the path. Hash-based move
detection re-attaches files renamed/moved within the root. Missing-file states
for files that disappear. Files dropped from *outside* the root are copied in.
A consolidate/archive action (copies originals into a package) is deferred.

**Rationale.** Matches the "point at a stash" promise; no disk duplication; an
item's identity must survive a move.

**Affects.** Vision §6; Architecture (storage layout, identity, move detection).

## D2 — Near-duplicate clustering: pHash, threshold as a setting

**Choice.** Compute a perceptual hash at import. Near-duplicate grouping is
driven by pHash distance, and the **similarity level is a user setting**.
Sessions do most of the grouping work; pHash catches within-session and
cross-session similarity. Embedding-based similarity is deferred.

**Rationale.** The flagship problem is "similar files," not exact copies; pHash
is cheap and local; grouping is for navigation — GILDEX never auto-deletes.

**Affects.** Vision §6, §9; Feature list (threshold setting); Architecture
(hash storage + index).

## D3 — Import model: manual-first + optional watch

**Choice.** Manual scan/import is primary (drag folders, "rescan now"). An
optional recursive watch on the library root auto-picks-up new/changed files,
throttled to yield during generation. Prototype ships manual only.

**Affects.** Vision §6; Feature list; Architecture (import pipeline).

## D4 — Deletion: remove-from-catalog with a trash list

**Choice.** GILDEX **never deletes files on disk**. The only removal is
*remove-from-catalog*, which writes the item's identity into a **trash list**
(content-hash tombstone) so rescanning does not rediscover it. Implies a
restore-from-trash affordance.

**Rationale.** In-place references mean GILDEX does not own the files;
"forgiving by design" forbids destructive defaults.

**Affects.** Vision §6, §12; Architecture; Feature list (restore-from-trash).

## D5 — Network: zero network

**Choice.** The app makes no network requests. External URL cross-links are
stored as inert text and opened in the system browser. Updates/telemetry are a
separate distribution decision, default off.

**Affects.** Vision §6; Tech stack.

## D6 — Source: folders are a browse view

**Choice.** Folders are a path-tree **browse view** (no entity, no annotation).
First-class indexes are **sessions, tags, collections**; timeline and folders
are browse views. The origin-app signal, when parsed, is a filter facet/tag,
not an index. The "source" term is retired.

**Affects.** Vision §4, §6, §7, §10; Feature list.

## D7 — Context layer surface: hybrid inspector

**Choice.** Notes, regions, cross-links, and attached files live behind a
separate **inspection surface** — a dedicated screen by default, with an
"open in new window" affordance (hybrid). It is owner-polymorphic: opened on an
**item**, **session**, or **collection**. Regions are item-only.

**Rationale.** Separates "scan" (main grid) from "study" (inspection) so the
grid stays fast and clean.

**Affects.** Vision §6, §7.5; UI design language; Architecture (owner
mechanism).

## D8 — Context layer scope: all four subsystems in v1

**Choice.** Notes, attached files, image regions, and cross-links are all in
v1. The prototype ships the story view + notes; regions, cross-links, and
attachments land after the prototype. Rollout order within v1 is still open.

**Affects.** Vision §6, §11; Feature list.

## D9 — Generation metadata: canonical fields + catch-all + raw blob

**Choice.** Four tiers:

1. **Canonical indexed fields** (gen-only; empty for non-gen items): `prompt`
   (FTS), `negative_prompt` (FTS), `model_name` (checkpoint, faceted), `seed`,
   `steps`, `sampler`, `cfg_scale`, `generated_at`.
2. **Item dimensions** (`width`, `height`) are item-level, computed from the
   media file — not generation metadata.
3. **Arbitrary metadata**: a generic non-indexed key/value store
   `(item, kind, key)` for any parsed field outside the canonical set (LoRA
   names, VAE, model_hash, clip_skip, denoise, …). Preserved and displayable by
   known key; never searchable.
4. **Raw blob**: the untouched original (A1111 `parameters` string, ComfyUI
   workflow JSON) persisted on disk, keyed by `(item, kind, parser_name,
   parser_version)`; never rendered.

- Dedicated parsers per format fill tiers 1 and 3; non-gen files leave them
  empty.
- Only the checkpoint is indexed as the model; LoRAs/VAE/embeddings are
  non-indexed (tier 3).
- Tiers 1 and 3 are derived/rebuildable from tier 4; tier 2 from the file.
- Raw metadata is never surfaced as a dump; the app shows only known fields.

**Affects.** Architecture (schema, parsers); Feature list (which tier-3 keys
the UI renders); Vision §7.6.

## D10 — Context-layer owner mechanism: polymorphic owner

**Choice.** `note`, `cross_link`, and `attachment` each carry an `owner_type` +
`owner_id` (owner ∈ item / session / collection). `region` is item-only and
uses a direct `item_id`. No database-enforced FK (SQLite limitation); the app
layer cascades context records on remove-from-catalog, and an integrity check
on open surfaces orphaned records as a "missing owner" state.

**Affects.** Architecture (context-layer schema); UI (owner-polymorphic
inspector).

## D11 — Cross-links → References, decoupled from lineage

**Choice.** The context-layer "cross-link" is renamed **Reference** and fully
decoupled from lineage. A reference is a lightweight navigation pointer with
no progression semantics, in two forms: inline `[[item:ID]]` / `[[region:ID]]`
/ `[[url]]` tokens inside note markdown (resolved on display), and a standalone
reference list on an owner (item/session/collection). Targets: internal item,
external file path, URL, region (inline). Dangling targets show a "missing"
state. No type taxonomy on references. Lineage is a separate, deferred relation
— `lineage_edge` (parent_id, child_id, edge_type) — never built on references.

**Affects.** Architecture (reference schema, note inline-reference parsing);
Vision §4, §6, §7.5; Feature list.

## D12 — Authoritative timestamp: file creation time

**Choice.** The item's authoritative timestamp for **organization** (session
clustering, timeline, sorting) is the **file's creation timestamp** (filesystem
birth time; mtime as fallback where unavailable), applied uniformly to all
items — generated and regular alike. Parsed generation time and EXIF datetime
are **metadata only** (display/statistics), never used for organization. The
timestamp is resolved at import and stored; a later touch or rescan does not
change it.

**Supersedes.** The fallback-chain idea. D9's `generated_at` is statistics-only,
not an organization field.

**Affects.** Architecture (item.timestamp); Feature list (session clustering,
timeline); Vision §7.1.

## D13 — Library portability: single relocatable root

**Choice.** Single configured root; all item paths are stored relative to it.
A first-class **"relocate library"** action updates the stored root path and
re-points everything (move detection makes this mostly internal). Within-root
renames/moves are healed by hash-based move detection; files that leave the
root show a "missing" state. Multiple roots are deferred.

**Affects.** Architecture (path resolution, relocate action); UI (relocate
flow).

## D14 — Performance: qualitative targets + three non-negotiable rules

**Choice.** Performance is specified qualitatively — "snappy," "low footprint,"
"yield to generation" — with no hard numbers before the prototype. Three
architectural rules are non-negotiable: (1) thumbnails pre-generated on disk,
fixed sizes, keyed by content hash; (2) virtualized grid (decode only visible
cells); (3) normalized, indexed search fields (no filtering over JSON blobs in
app code). Numbers are measured and set later.

**Affects.** Architecture; Tech stack (evaluate against the qualitative goals +
three rules).

## D15 — Attachment storage: managed folder, hash-addressed

**Choice.** Attached files are copied into a managed `attachments/` folder
inside the library package, addressed by content hash and immutable. Removing
an attachment deletes the record first; the file is removed only by an explicit
cleanup with confirmation. Missing-file state on open. (Never auto-deleted —
consistent with D4.)

**Affects.** Architecture (attachment storage, cleanup); Feature list (attach
flow).

## D16 — Watcher scope: designated inbox only

**Choice.** The optional watcher monitors a single **designated inbox** — not
the whole root. New files dropped there are auto-imported; everything else
requires a manual scan. Debounced and yield-aware. Open detail: whether the
inbox is a folder *under* the root (referenced in place) or an external landing
zone (copied in via D1's copy-into-library).

**Affects.** Architecture (import pipeline, watcher); Feature list (inbox UX).

## D17 — Audio is first-class media

**Choice.** Audio is a first-class grid item alongside images and short videos,
so it can be a full member of sessions, tags, and collections. It gets a
thumbnail (waveform/cover/generic), a player in the inspector, and hover-play
where applicable. "Small files" (text, documents, project files) remain
attachments, not grid items.

**Affects.** Vision §4, §6, §7.3; Feature list; UI.

**Amended by.** D42 — audio thumbnail is a rough spectrogram, not a
cover/generic icon.

## D18 — Hover-play via precomputed frames

**Choice.** Animated images and video thumbnails play on hover by
**precomputing a few representative frames at import** (a small frame strip)
and cycling through them on hover. No live decode in the grid — consistent with
pre-generated thumbnails and the virtualized grid.

**Affects.** Architecture (import-time frame extraction); UI (hover
interaction); Feature list.

## D19 — Format pipeline: FFmpeg, minimal set for now

**Choice.** Decode/thumbnailing runs through a single FFmpeg pipeline.
Guaranteed still-image set for now: **PNG, JPEG, WebP**. Video and audio are
first-class via FFmpeg (sensible defaults: MP4/WebM; WAV/MP3/FLAC) — the exact
guaranteed lists finalize in Tech stack. Other formats (TIFF, AVIF, HEIC, …)
are best-effort and added to the tested list over time.

**Affects.** Architecture (decode/thumbnail pipeline); Tech stack (format
lists).

**Amended by.** D33 — stills are decoded by Go `image`/`x/image`, not FFmpeg.

## D20 — Session inactivity threshold: 2 hours, adjustable

**Choice.** Sessions split at a **2-hour** inactivity gap by default. The
threshold is user-adjustable, and re-clustering is non-destructive (suggestion
engine — never destroys user edits).

**Affects.** Feature list (session settings); Architecture (clustering
parameter).

## D21 — Collection order: time by default, manual edit

**Choice.** Items in a collection are **time-ordered by default**; the user can
manually reorder (drag), and that manual order persists. Sorting by time remains
a view option.

**Affects.** Feature list; Architecture (collection membership order).

## D22 — Item user fields: favorite + rating + status

**Choice.** Items carry three user-layer scalar fields: **favorite** (boolean),
**rating** (1–5), and **status** (label: draft / final / WIP, extensible). All
are indexed for filtering/faceting.

**Affects.** Architecture (item fields); Feature list; UI.

## D23 — Search: tag filters + full-text

**Choice.** v1 search = tag filters plus a single search box doing full-text
over prompt, negative prompt, note text, filename, session name, and collection
name. Advanced query syntax is deferred.

**Affects.** Architecture (FTS index); Feature list; UI.

## D24 — Batch operations: full toolbar

**Choice.** Multi-select supports tag, add-to-collection, assign-session,
favorite/rate/status, and remove-from-catalog — the full toolbar.

**Affects.** Feature list; UI (selection model).

## D25 — Small files: soft warn, no hard cap

**Choice.** No hard attachment size cap; a configurable soft warning above a
default threshold (~100 MB), since attachments live in the managed folder.

**Affects.** Feature list (attach flow); Architecture (storage).

## D26 — Deep-layer rollout order

**Choice.** Post-prototype order within v1: **References → Attachments →
Regions.** References build directly on notes; attachments are a simple list +
preview; regions are the heaviest UI (shape drawing), so they land last.

**Affects.** Feature list (roadmap); Architecture.

## D27 — Undo: targeted, with restore-from-trash

**Choice.** Undo for the last N actions (batch ops, merges, renames,
tag/rating changes) plus restore-from-trash for removals. No full redo/history
tree.

**Affects.** Architecture (action log); UI (undo affordances).

## D28 — v1 boundary

**In v1.** Manual scan + inbox watch; pHash near-dup (threshold setting);
time-gap sessions (2h, adjustable); tags + full batch toolbar; collections
(time-default order, manual edit); story view + full inspector (story, notes,
references, attachments, regions); favorite/rating/status; tag filters + FTS
search; trash-list removal (never delete files on disk); single relocatable
root; managed hash-addressed attachments; hover-play via precomputed frames;
FFmpeg decode (PNG/JPEG/WebP guaranteed).

**Deferred (post-v1).** Lineage, auto-tagging, embeddings/semantic search,
multi-library, multiple roots, nested collections, tag
namespaces/aliases/implications, video regions, advanced query syntax,
consolidated/archive export, eco mode.

**Affects.** Feature list; all downstream docs.

## D29 — Platforms: Linux, Windows, macOS

**Choice.** Desktop targets are **Linux, Windows, and macOS**. A
cross-platform-capable stack is required; the specific per-OS testing burden
(notably the webview) is accepted as a cost of the choice.

**Affects.** Tech stack; packaging/distribution.

## D30 — Stack: Go backend + webview frontend (Wails)

**Choice.** **Go + Wails.** Go owns the backend (hashing, pHash, FFmpeg jobs,
SQLite, filesystem watching) — its concurrency model maps directly onto the
yield-aware background-job scheduler. Wails provides the webview shell, because
the frontend (virtualized grid, hover-play, region drawing, markdown, native
`<video>`/`<audio>`) is best done in web tech. Priority order: performance,
then development speed and LLM familiarity with the languages.

**Affects.** Tech stack; Architecture (job scheduler, IPC boundary).

## D31 — Shell: web frontend + Wails at v1, browser during prototype

**Choice.** The frontend is a web app served by Go. During the prototype it runs
in a browser tab; at v1 it is wrapped in a **Wails shell** for the native
window/dock/tray feel. The frontend code is identical in both, so wrapping is
zero-rework.

**Affects.** Tech stack (dev workflow); UI.

## D32 — SQLite: pure-Go `modernc.org/sqlite`

**Choice.** **`modernc.org/sqlite`** — pure Go, no CGo, FTS5 supported. Keeps
the 3-OS cross-compile trivial and pairs with the no-CGo FFmpeg decision.

**Affects.** Tech stack; Architecture (schema, FTS).

## D33 — FFmpeg integration: bundled binary + Go stills

**Choice.** **Bundled per-OS `ffmpeg` binary** (shelled out) for video, audio,
and animated formats; **Go `image`/`x/image`** decodes PNG/JPEG/WebP/GIF stills
in-process. No CGo anywhere: a spawned ffmpeg crash cannot take down the app,
and the 100k-still hot path avoids per-file process spawns.

**Amends.** D19 — stills no longer go through FFmpeg.

**Affects.** Tech stack (packaging, licensing note); Architecture
(decode/thumbnail pipeline).

## D34 — Frontend framework: React + TypeScript + Vite

**Choice.** **React + TypeScript + Vite.** Rationale: GILDEX's UI is unusual (a
virtualized ~100k-item media grid with hover-play and region drawing), and React
has the largest ecosystem and deepest LLM familiarity for those hard parts
(virtual scrolling, markdown, drag-drop, canvas overlays). Runtime weight is a
non-factor in a desktop webview (parse-once; the bottleneck is image decode and
GPU compositing, identical across frameworks). Svelte 5 noted as the lean
alternative, rejected for smaller ecosystem.

**Affects.** Tech stack; UI.

## D35 — Wails version: v3

**Choice.** **Wails v3** (v3.0.0, stable since 2026-10-26). Its headline features map
directly onto settled GILDEX needs: multiple windows (D7 detached inspector),
native file drag-drop with real paths (D3/D16 import), server build mode (D31
browser prototype), plus native menus, tray, dialogs, and official cross-OS
packaging. Cost: Go 1.26+, Linux default GTK4 + WebKitGTK 6.0.

**Affects.** Tech stack; Architecture (window management, IPC).

## D36 — Attachment types & previews: any type, tiered previews

**Choice.** Any file type is accepted as an attachment. Preview tiers: text
(plain/markdown/code) renders inline; images render as a thumbnail; PDF renders
its first page as an image; everything else shows a generic icon plus
name/size/type and an "open externally" action.

**Affects.** Feature list (attach flow); UI (preview components).

## D37 — Region geometry: rect + polygon + point, normalized coordinates

**Choice.** Image regions support **rectangle, polygon, and point** shapes.
Coordinates are **normalized to [0,1]** relative to the image dimensions, so
annotations survive resize/re-encode. Video regions remain deferred (D28).

**Affects.** Architecture (region schema); UI (region drawing); Feature list.

## D38 — Trash: browsable, no auto-expiry

**Choice.** The trash is a **browsable list**; restore removes the tombstone and
the item is re-discovered on the next scan. Tombstones persist until explicitly
purged — no auto-expiry.

**Affects.** Feature list (trash view); UI; Architecture (tombstone lifecycle).

## D39 — pHash threshold: Hamming ≤ 10 default, adjustable

**Choice.** 64-bit pHash; default "similar" grouping at **Hamming distance ≤
10**, exposed as a user-adjustable slider. Distance 0 = exact duplicate.

**Affects.** Feature list (similarity setting); Architecture (grouping index).

## D40 — Inbox location: in-root subfolder

**Choice.** The designated watcher inbox is a folder **under the library root**
(e.g. `root/_inbox/`), referenced in place — consistent with in-place references
(D1) and the single relocatable root (D13).

**Resolves.** D16's open detail (in-root vs external).

**Affects.** Architecture (inbox path, watcher); Feature list (inbox UX).

## D41 — Metadata provenance flag

**Choice.** Every parser-derived field — canonical (tier 1) and arbitrary
(tier 3) — carries a **provenance flag** `parsed | manual`. Re-import/re-parse
overwrites only `parsed` values; a user edit sets `manual` and is never
clobbered. The raw blob (tier 4) remains the untouched source of truth.

**Clarifies.** D9 (which implied but did not name the flag).

**Affects.** Architecture (item/meta schema, import pipeline).

## D42 — Audio thumbnail: rough spectrogram; audio pHash deferred

**Choice.** Audio items get a **rough spectrogram** thumbnail (precomputed at
import), not a generic/cover icon. Audio is excluded from pHash near-duplicate
grouping for now — pHash applies to images and video (representative frame)
only; audio similarity is deferred.

**Amends.** D17 (thumbnail); D2 (pHash scope).

**Affects.** Architecture (audio thumbnail pipeline); Feature list (audio
similarity, deferred).
